import 'server-only';
import { prisma } from '@/lib/prisma';
import { crmPreferences } from './crm-workflow';
import { can, TeamError, type Actor } from './policy';
import { DAY_MS, indiaDay, dayStart, reportWindow, performanceFeedback, type PerformancePeriod, type PerformanceMetrics, type PerformanceReport } from './performance-model';

export function assertPerformanceAccess(actor: Actor, member: { id: string; workspaceId: string }) {
  if (actor.workspaceId !== member.workspaceId || actor.id !== member.id && !can(actor, 'reports.all.view')) throw new TeamError('This performance report is not available to your account.', 403);
}
export async function buildPerformanceReport(memberId: string, period: PerformancePeriod, day: string, now = new Date()): Promise<PerformanceReport> {
  const member = await prisma.teamMember.findUniqueOrThrow({ where: { id: memberId }, include: { user: { select: { name: true } } } });
  const window = reportWindow(period, day);
  if (window.start > now) throw new TeamError('Future performance reports are not available.');
  const asOf = new Date(Math.min(now.getTime(), window.end.getTime()));
  const previousStart = new Date(window.start.getTime() - (window.end.getTime() - window.start.getTime()));
  const workspaceId = member.workspaceId;
  const [leads, outreach, completed, conversions, commissions, overdueFollowUps, overdueTasks, blockedTasks, openAssignments, evidence] = await Promise.all([
    prisma.acquisitionLead.findMany({ where: { workspaceId, researcherEmployeeId: memberId, registeredAt: { gte: previousStart, lt: asOf } }, select: { registeredAt: true, convertedAt: true, prospect: { select: { verified: true, suppressed: true, contactEligibility: true, email: true, phone: true } } } }),
    prisma.teamOutreach.findMany({ where: { actorId: memberId, prospect: { workspaceId }, kind: { in: ['CONTACT', 'REPLY'] }, occurredAt: { gte: previousStart, lt: asOf } }, select: { prospectId: true, kind: true, occurredAt: true, evidence:true,prospect:{select:{clientId:true}} } }),
    prisma.teamTask.findMany({ where: { workspaceId, ownerId: memberId, status: 'COMPLETED', completedAt: { gte: previousStart, lt: asOf } }, select: { completedAt: true } }),
    prisma.acquisitionLead.findMany({ where: { workspaceId, OR: [{ researcherEmployeeId: memberId }, { acquisitionEmployeeId: memberId }], convertedAt: { gte: previousStart, lt: asOf } }, select: { convertedAt: true } }),
    prisma.acquisitionCommission.findMany({ where: { employeeId: memberId, lead: { workspaceId }, createdAt: { gte: window.start, lt: asOf }, status: { in: ['PENDING', 'APPROVED', 'PAID'] } }, select: { currency: true, entryType: true, amountMinor: true, eligibleAt: true, payoutItems: { where: { payout: { cancellation: { is: null } } }, select: { amountMinor: true } } } }),
    prisma.teamProspect.count({ where: { workspaceId, ownerId: memberId, suppressed: false, stage: { notIn: ['CONVERTED', 'LOST', 'DO_NOT_CONTACT', 'DUPLICATE', 'UNQUALIFIED', 'NOT_INTERESTED'] }, followUpAt: { lt: now } } }),
    prisma.teamTask.count({ where: { workspaceId, ownerId: memberId, archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueAt: { lt: now } } }),
    prisma.teamTask.count({ where: { workspaceId, ownerId: memberId, archivedAt: null, status: 'BLOCKED' } }),
    prisma.teamTask.count({ where: { workspaceId, ownerId: memberId, archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.teamAudit.findMany({where:{workspaceId,actorId:memberId,action:{in:['contact.call_report','contact.activity_report','client.updated']},createdAt:{gte:new Date(previousStart.getTime()-300000),lte:now}},select:{id:true,entityId:true,action:true,createdAt:true,detail:true},orderBy:[{createdAt:'asc'},{id:'asc'}]})
  ]);
  const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
  const reports=evidence.map(row=>{const detail=object(row.detail);const occurred=new Date(String(detail.occurredAt||''));return {...row,detail,at:row.action==='contact.call_report'||row.action==='contact.activity_report'?Number.isFinite(occurred.getTime())?occurred:row.createdAt:row.createdAt};}).filter(row=>!row.detail.amendsReportId&&(row.action!=='client.updated'||!Array.isArray(row.detail.changedFields)||row.detail.changedFields.length));
  const clients=await prisma.teamClient.findMany({where:{workspaceId,id:{in:[...new Set([...reports.map(r=>r.entityId),...outreach.flatMap(o=>o.prospect.clientId?[o.prospect.clientId]:[])])]}},select:{id:true,mergedIntoId:true}});
  const identity=(id:string)=>`client:${clients.find(c=>c.id===id)?.mergedIntoId||id}`;
  const calls=reports.filter(r=>r.action==='contact.call_report');
  const contactable = (p: typeof leads[number]['prospect']) => p.verified && !p.suppressed && ['CONSENTED', 'LEGITIMATE_INTEREST'].includes(p.contactEligibility) && Boolean(p.email?.trim() || /^\+?[1-9]\d{7,14}$/.test(p.phone.replace(/[\s().-]/g, '')));
  function metrics(start: Date, end: Date): PerformanceMetrics {
    const within = (date: Date | null) => date !== null && date >= start && date < end;
    const registered = leads.filter(l => within(l.registeredAt));
    const contacts = outreach.filter(o => o.kind === 'CONTACT' && within(o.occurredAt));
    const periodCalls=calls.filter(r=>within(r.at));
    const unmirrored=periodCalls.filter(r=>!r.detail.activityId||!contacts.some(o=>o.evidence.includes(`Work-station activity ${r.detail.activityId}`)));
    return { leads: registered.length, qualifiedLeads: registered.filter(l => contactable(l.prospect)).length, contacts: new Set([...contacts.map(o => o.prospect.clientId?identity(o.prospect.clientId):`prospect:${o.prospectId}`),...periodCalls.map(r=>identity(r.entityId))]).size, contactEvents: contacts.length+unmirrored.length, replies: new Set(outreach.filter(o => o.kind === 'REPLY' && within(o.occurredAt)).map(o => o.prospectId)).size, conversions: conversions.filter(c => within(c.convertedAt)).length, cohortConversions: registered.filter(l => l.convertedAt && l.convertedAt < end).length, tasksCompleted: completed.filter(t => within(t.completedAt)).length };
  }
  const config = crmPreferences(member.preferences);
  const current = metrics(window.start, asOf);
  const captured=reports.filter(r=>r.at>=window.start&&r.at<asOf),capturedCalls=captured.filter(r=>r.action==='contact.call_report');
  const outcomes=new Map<string,number>();for(const row of capturedCalls){const label=String(row.detail.outcome||'UNSPECIFIED');outcomes.set(label,(outcomes.get(label)||0)+1);}
  const activity:NonNullable<PerformanceReport['activity']>={calls:capturedCalls.length,conversations:capturedCalls.filter(r=>['TALKED','INTERESTED','RESOLVED','NOT_INTERESTED','CALLBACK','FOLLOW_UP'].includes(r.detail.outcome)).length,unanswered:capturedCalls.filter(r=>['NO_ANSWER','BUSY'].includes(r.detail.outcome)).length,clientUpdates:captured.filter(r=>r.action==='client.updated').length,otherReports:captured.filter(r=>r.action==='contact.activity_report').length,activitySeconds:captured.reduce((n,r)=>n+(Number.isFinite(r.detail.elapsedSeconds)?Math.max(0,Math.floor(r.detail.elapsedSeconds)):0),0),outcomes:[...outcomes].map(([label,count])=>({label,count})),days:[]};
  const days: PerformanceReport['days'] = [];
  for (let at = window.start.getTime(); at < asOf.getTime(); at += DAY_MS) {
    const m = metrics(new Date(at), new Date(Math.min(at + DAY_MS, asOf.getTime())));
    days.push({ day: indiaDay(new Date(at)), leads: m.leads, qualifiedLeads: m.qualifiedLeads, contacts: m.contacts, tasksCompleted: m.tasksCompleted });
    const rows=captured.filter(r=>r.at.getTime()>=at&&r.at.getTime()<at+DAY_MS);activity.days.push({day:indiaDay(new Date(at)),calls:rows.filter(r=>r.action==='contact.call_report').length,clientUpdates:rows.filter(r=>r.action==='client.updated').length,otherReports:rows.filter(r=>r.action==='contact.activity_report').length});
  }
  const activeDays = days.filter(d => dayStart(d.day).getTime() >= dayStart(indiaDay(member.joinedAt)).getTime()).length;
  const target = !activeDays ? null : config.workRole === 'researcher' ? (config.researchTarget || 15) * activeDays : config.workRole === 'caller' ? (config.callTarget || 45) * activeDays : null;
  const totals = new Map<string, PerformanceReport['commissions'][number]>();
  for (const row of commissions) {
    const total = totals.get(row.currency) ?? { currency: row.currency, earnedMinor: 0, adjustmentMinor: 0, netMinor: 0, pendingMinor: 0, clearedMinor: 0, reservedMinor: 0 };
    if (row.entryType === 'EARNED') total.earnedMinor += row.amountMinor; else total.adjustmentMinor += row.amountMinor;
    total.netMinor += row.amountMinor;
    const reserved = row.payoutItems.reduce((sum, p) => sum + p.amountMinor, 0);
    total.reservedMinor += reserved;
    if (row.eligibleAt > now) total.pendingMinor += row.amountMinor - reserved;
    else total.clearedMinor += row.amountMinor - reserved;
    totals.set(row.currency, total);
  }
  const report: PerformanceReport = { version: 1, workspaceId, memberId, userId: member.userId, name: member.user.name, jobTitle: member.jobTitle, workRole: config.workRole || 'team member', period, startDay: indiaDay(window.start), endDay: indiaDay(new Date(window.end.getTime() - 1)), startAt: window.start.toISOString(), endAt: asOf.toISOString(), generatedAt: now.toISOString(), provisional: now < window.end, target, targetActual: config.workRole === 'researcher' ? current.qualifiedLeads : current.contacts, targetLabel: config.workRole === 'researcher' ? 'contactable leads' : 'distinct contacts', metrics: current, previous: metrics(previousStart, window.start), previousLabel: `${indiaDay(previousStart)} – ${indiaDay(new Date(window.start.getTime() - 1))}`, overdueFollowUps, overdueTasks, blockedTasks, openAssignments, commissions: [...totals.values()], days, tips: [], wins: [] };
  const feedback=performanceFeedback(report);if(activity.clientUpdates||activity.otherReports)feedback.tips=feedback.tips.filter(t=>!t.startsWith('No tracked activity'));
  if(activity.conversations)feedback.tips=feedback.tips.filter(t=>!t.startsWith('Contact attempts are recorded'));
  if(activity.calls)feedback.wins.push(`${activity.calls} call reports saved, including ${activity.conversations} recorded conversations.`);
  if(activity.clientUpdates)feedback.wins.push(`${activity.clientUpdates} contact-card updates recorded.`);
  return { ...report,activity, ...feedback };
}
