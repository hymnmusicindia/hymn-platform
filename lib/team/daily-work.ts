import { Prisma } from "@prisma/client";
import { crmPreferences, nextCaller } from "./crm-workflow";
import { can, TeamError, type Actor } from "./policy";

import { acceptsAssignmentsNow, activeWindows } from './availability-rules';

type Tx = Prisma.TransactionClient;
export function indiaWorkday(now = new Date()) {
  const day = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+05:30`);
  return { day, start, end: new Date(start.getTime() + 86400000), dueAt: new Date(`${day}T23:59:59+05:30`) };
}
export async function assertEmployeeAssignee(tx: Tx, workspaceId: string, memberId: string) {
  const member = await tx.teamMember.findFirst({ where: { id: memberId, workspaceId, status: "ACTIVE", role: { owner: false }, user: { status: "ACTIVE" } } });
  if (!member) throw new TeamError("Assign operational work to an active employee. Owners supervise and do not receive work assignments.", 403);
  return member;
}
export async function dailyProgress(tx: Tx, workspaceId: string, memberId: string, now = new Date()) {
  const { start, end } = indiaWorkday(now);
  const leads = await tx.acquisitionLead.findMany({ where: { workspaceId, researcherEmployeeId: memberId, registeredAt: { gte: start, lt: end }, prospect: { verified: true, suppressed: false, contactEligibility: { in: ["CONSENTED", "LEGITIMATE_INTEREST"] } } }, select: { prospect: { select: { email: true, phone: true } } } });
  const researched = leads.filter(({ prospect }) => Boolean(prospect.email?.trim()) || /^\+?[1-9]\d{7,14}$/.test(prospect.phone.replace(/[\s().-]/g, ""))).length;
  const contacts = await tx.teamOutreach.findMany({ where: { actorId: memberId, kind: "CONTACT", occurredAt: { gte: start, lt: end }, prospect: { workspaceId } }, distinct: ["prospectId"], select: { prospectId: true } });
  return { researched, called: contacts.length };
}

export async function syncDailyCrmWork(tx: Tx, actor: Actor, now = new Date()) {
  const { day, start, end, dueAt } = indiaWorkday(now);
  const members = await tx.teamMember.findMany({ where: { workspaceId: actor.workspaceId, status: "ACTIVE", role: { owner: false }, user: { status: "ACTIVE" } }, include: { role: true, user: { select: { name: true } } } });
  const creator = await tx.teamMember.findFirst({ where: { workspaceId: actor.workspaceId, status: "ACTIVE", role: { owner: true }, user: { status: "ACTIVE" } }, orderBy: { id: "asc" } });
  if (!creator) return { created: 0, completed: 0 };
  let created = 0, completed = 0;
  // Pick up contacts saved while the caller was unavailable. Existing researcher
  // attribution and financial history are never reassigned by this handoff.
  const waiting = await tx.acquisitionLead.findMany({ where: { workspaceId: actor.workspaceId, acquisitionEmployeeId: null, prospect: { verified: true, suppressed: false, contactEligibility: { in: ["CONSENTED", "LEGITIMATE_INTEREST"] }, stage: { in: ["NEW", "NEEDS_RESEARCH", "QUALIFIED", "READY_TO_CONTACT", "ASSIGNED"] } } }, orderBy: [{ registeredAt: "asc" }, { id: "asc" }], take: 100, include: { prospect: true } });
  for (const lead of waiting) {
    if (!lead.prospect.email && !/^\+?[1-9]\d{7,14}$/.test(lead.prospect.phone.replace(/[\s().-]/g, ""))) continue;
    const caller = await nextCaller(tx, actor, now);
    if (!caller) break;
    await tx.acquisitionLead.update({ where: { id: lead.id }, data: { acquisitionEmployeeId: caller.id } });
    await tx.teamProspect.update({ where: { id: lead.prospectId }, data: { ownerId: caller.id, stage: "READY_TO_CONTACT", version: { increment: 1 } } });
    await tx.leadOwnershipEvent.create({ data: { leadId: lead.id, actorEmployeeId: actor.id, newEmployeeId: caller.id, attributionRole: "ACQUISITION", reason: "Automatic caller rotation." } });
    const task = await tx.teamTask.findFirst({ where: { workspaceId: actor.workspaceId, eventKey: { startsWith: `${lead.prospectId}:` }, status: { notIn: ["COMPLETED", "CANCELLED"] } } });
    if (task) await tx.teamTask.update({ where: { id: task.id }, data: { ownerId: caller.id, version: { increment: 1 } } });
    else await tx.teamTask.upsert({ where: { eventKey: `${lead.prospectId}:call` }, create: { workspaceId: actor.workspaceId, creatorId: creator.id, ownerId: caller.id, title: `First contact: ${lead.prospect.name}`, dueAt: lead.prospect.followUpAt || dueAt, eventKey: `${lead.prospectId}:call` }, update: { ownerId: caller.id, status: "TODO", completedAt: null, dueAt: lead.prospect.followUpAt || dueAt, version: { increment: 1 } } });
    await tx.teamAudit.create({ data: { workspaceId: actor.workspaceId, actorId: actor.id, action: "crm.lead_handed_off", entityId: lead.id, detail: { callerId: caller.id } } });
  }
  for (const member of members) {
    const config = crmPreferences(member.preferences);
    const mode = config.workRole;
    if (!mode || !can(member, "crm.prospects.view") || mode === "researcher" && !can(member, "crm.prospects.create") || mode === "caller" && !can(member, "crm.outreach.manage")) continue;
    const windows=activeWindows(member.preferences,start,end);
    if(member.availability!=='AVAILABLE'||!windows.length||!acceptsAssignmentsNow(member.preferences,now))continue;
    const shiftEnd=new Date(Math.min(end.getTime(),Math.max(...windows.map(w=>w.endsAt.getTime()))));
    if(now>=shiftEnd)continue;
    const target = mode === "researcher" ? config.researchTarget ?? 15 : config.callTarget ?? 45;
    if(target<=0)continue;
    const eventKey = `${actor.workspaceId}:crm-daily:${day}:${member.id}:${mode}`;
    let task = await tx.teamTask.findUnique({ where: { eventKey } });
    if (!task) {
      const title = mode === "researcher" ? `Research ${target} contactable leads - ${day}` : `Work the call / email queue - ${day}`;
      const description = mode === "researcher"
        ? `Add ${target} unique, source-checked contacts today with a real phone number including country code or a business email. Save the public source, contact evidence, service interest and research notes in Contacts & Calls. Respect opt-outs; do not add existing HYMN accounts or duplicates. Source-checked eligible contacts route to the available call representative. Only a rep can confirm a verified lead after a real conversation. Your task completes from real CRM records, not a checkbox.`
        : `Work today's researched contacts and overdue follow-ups. Aim to reach ${target} distinct eligible contacts by call or individually reviewed email. Open Contacts & Calls > Call queue, check the source and eligibility, call or open WhatsApp, record actual contact evidence and notes, and schedule the next step in India time. When no leads are ready, review upcoming follow-ups and prepare the outreach plan. Do not invent contacts or mark an attempt as a successful conversation.`;
      task = await tx.teamTask.create({ data: { workspaceId: actor.workspaceId, creatorId: creator.id, ownerId: member.id, title, description, eventKey, dueAt:shiftEnd, priority: "HIGH" } });
      await tx.teamAudit.create({ data: { workspaceId: actor.workspaceId, actorId: actor.id, action: "crm.daily_task_created", entityId: task.id, detail: { employeeId: member.id, day, mode, target } } });
      await tx.teamNotification.create({ data: { memberId: member.id, title, href: `/team?module=work&task=${task.id}` } });
      created++;
    }
    if (task.status === "CANCELLED") continue;
    const progress = await dailyProgress(tx, actor.workspaceId, member.id, now);
    const actual = mode === "researcher" ? progress.researched : progress.called;
    if (task.status === "COMPLETED" && actual < target) {
      await tx.teamTask.update({ where: { id: task.id }, data: { status: "TODO", completedAt: null, evidence: "Daily progress fell below the target after a CRM correction. Review the remaining work.", version: { increment: 1 } } });
      await tx.teamAudit.create({ data: { workspaceId: actor.workspaceId, actorId: actor.id, action: "crm.daily_task_reopened", entityId: task.id, detail: { actual, target, day } } });
    }
    if (task.status === "COMPLETED") continue;
    if (actual >= target) {
      await tx.teamTask.update({ where: { id: task.id }, data: { status: "COMPLETED", completedAt: now, evidence: `${actual} distinct ${mode === "researcher" ? "source-checked contacts registered" : "contacts reached"} in CRM on ${day} (Asia/Kolkata).`, version: { increment: 1 } } });
      await tx.teamAudit.create({ data: { workspaceId: actor.workspaceId, actorId: actor.id, action: "crm.daily_task_completed", entityId: task.id, detail: { employeeId: member.id, actual, target, day } } });
      completed++;
    }
  }
  return { created, completed };
}

export async function assertDailyTaskChange(tx: Tx, actor: Actor, task: { eventKey: string | null; ownerId: string }, change: Record<string, unknown>) {
  if(task.eventKey?.startsWith('auto-source:')&&['COMPLETED','IN_REVIEW'].includes(String(change.status)))throw new TeamError('Complete this assignment by saving the actual source check or creator decision in its source module.',409);
  if (!task.eventKey?.includes(":crm-daily:")) return;
  if (change.status === "CANCELLED" && (!can(actor, "acquisition.admin") || String(change.blocker || change.evidence || "").trim().length < 8)) throw new TeamError("Only a programme administrator can cancel daily work, with a documented reason.", 403);
  if (Object.keys(change).some(key => !["id", "version", "status", "blocker", "evidence"].includes(key))) throw new TeamError("Daily CRM assignments are managed by the daily programme. Change the employee's targets instead.");
  if (["COMPLETED", "IN_REVIEW"].includes(String(change.status))) {
    const member = await tx.teamMember.findUniqueOrThrow({ where: { id: task.ownerId } });
    const config = crmPreferences(member.preferences);
    const day = task.eventKey.split(":crm-daily:")[1].slice(0, 10);
    const progress = await dailyProgress(tx, actor.workspaceId, task.ownerId, new Date(`${day}T12:00:00+05:30`));
    const researcher = task.eventKey.endsWith(":researcher");
    const target = researcher ? config.researchTarget ?? 15 : config.callTarget ?? 45;
    if ((researcher ? progress.researched : progress.called) < target) throw new TeamError("The daily CRM target has not been met. Add real eligible leads or record actual contact evidence first.", 409);
  }
}
