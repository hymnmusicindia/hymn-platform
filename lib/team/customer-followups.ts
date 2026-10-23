import 'server-only';
import { supportDetails } from '@/lib/support';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can, demand, TeamError, type Actor } from './policy';
import { crmPreferences } from './crm-workflow';
import { whatsappNumber } from './phone';
import { linkProspectContact } from './contact-directory';

import { z } from 'zod';
import { callbackSlot, syncCallbackCalendar, syncProspectCallCalendar } from './callback-calendar';
import { callWindowStart, callbackTip } from './call-rules';
import { internalIdentities, matchesInternalIdentity } from './internal-identity';

export const DRAFT_CALL_INACTIVITY_HOURS = 30;
type Signal = { kind: 'DRAFT_INACTIVE' | 'ENQUIRY' | 'SERVICE_INTEREST' | 'SUPPORT_CALLBACK'; source: string; referenceId: string; service: string; occurredAt: string; footnotes: string[]; draftEditedAt?: string; callbackPhone?: string };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function nextCallDue(now: Date) {
  return callWindowStart(new Date(now.getTime() + 60 * 60000));
}
async function supportCaller(tx: Prisma.TransactionClient, a: Actor) {
  const members = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', availability: 'AVAILABLE', role: { owner: false }, user: { status: 'ACTIVE' } }, include: { role: true }, orderBy: { id: 'asc' } });
  const callers = members.filter(m => (crmPreferences(m.preferences).caller || crmPreferences(m.preferences).workRole === 'caller' || /call representative/i.test(m.role.name)) && can(m, 'crm.outreach.manage') && can(m, 'tasks.update'));
  if (!callers.length) return null;
  const previous = await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: 'support-call:' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const rotated = [...callers.slice((callers.findIndex(m => m.id === previous?.ownerId) + 1) % callers.length), ...callers.slice(0, (callers.findIndex(m => m.id === previous?.ownerId) + 1) % callers.length)];
  const load = await tx.teamTask.groupBy({ by: ['ownerId'], where: { workspaceId: a.workspaceId, ownerId: { in: callers.map(m => m.id) }, status: { notIn: ['COMPLETED', 'CANCELLED'] }, eventKey: { startsWith: 'support-call:' } }, _count: true });
  return rotated.sort((left, right) => (load.find(item => item.ownerId === left.id)?._count || 0) - (load.find(item => item.ownerId === right.id)?._count || 0))[0];
}
async function accountCard(tx: Prisma.TransactionClient, a: Actor, user: { id: number; name: string; email: string; mobile: string | null }) {
  const linked = await tx.teamClient.findUnique({ where: { userId: user.id } });
  if (linked) return linked.workspaceId === a.workspaceId ? linked : null;
  const existing = await tx.teamClient.findFirst({ where: { workspaceId: a.workspaceId, mergedIntoId:null, OR: [{ additionalEmails:{has:user.email.toLowerCase()} },{ email: { equals: user.email, mode: 'insensitive' } }, { secondaryEmail: { equals: user.email, mode: 'insensitive' } }] } });
  if (existing) return existing.userId && existing.userId !== user.id ? null : tx.teamClient.update({ where: { id: existing.id }, data: { userId: user.id, ...(!existing.phone && user.mobile ? { phone: user.mobile } : {}), version: { increment: 1 } } });
  return tx.teamClient.create({ data: { workspaceId: a.workspaceId, ownerId: a.id, userId: user.id, name: user.name, email: user.email, phone: user.mobile || '' } });
}
async function emit(tx: Prisma.TransactionClient, a: Actor, client: { id: string; name: string; phone: string; status: string }, signal: Signal, now: Date) {
  if (client.status !== 'ACTIVE' || !whatsappNumber(client.phone)) return 0;
  if (await tx.teamProspect.findFirst({ where: { clientId: client.id, suppressed: true } })) return 0;
  const eventKey = `support-signal:${a.workspaceId}:${signal.kind}:${signal.source}`;
  if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey } })) return 0;
  const prefix = `support-call:${a.workspaceId}:${signal.kind}:${client.id}:`;
  // Several clicks about one service attach context to one open callback, not a new task per click.
  const prior = ['DRAFT_INACTIVE','SUPPORT_CALLBACK'].includes(signal.kind) ? null : await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, clientId: client.id, eventKey: { startsWith: `support-call:${a.workspaceId}:` }, NOT: { eventKey: { contains: ':DRAFT_INACTIVE:' } }, status: { notIn: ['COMPLETED', 'CANCELLED'] }, followUpContext: { path: ['service'], equals: signal.service } } });
  if (prior) {
    const context = object(prior.followUpContext), footnotes = Array.isArray(context.footnotes) ? context.footnotes : [];
    const updated = await tx.teamTask.update({ where: { id: prior.id }, data: { ...(signal.kind === 'ENQUIRY' ? { priority: 'HIGH' } : {}), description: `${prior.description}\n${signal.footnotes.join('\n')}`.slice(-10000), followUpContext: json({ ...context, ...(signal.kind === 'ENQUIRY' ? { kind: 'ENQUIRY', tip: callbackTip('ENQUIRY') } : {}), footnotes: [...footnotes, ...signal.footnotes].slice(-12) }), version: { increment: 1 } } });
    await syncCallbackCalendar(tx, a, updated);
    await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey, taskId: prior.id } }); return 0;
  }
  if (signal.kind === 'SERVICE_INTEREST' && await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, clientId: client.id, eventKey: { startsWith: 'support-call:' }, status: 'COMPLETED', completedAt: { gte: new Date(now.getTime() - 3 * 86400000) }, followUpContext: { path: ['service'], equals: signal.service } } })) { await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey } }); return 0; }
  const caller = await supportCaller(tx, a);
  if (!caller) return 0; // Leave the source unconsumed so an available representative can receive it later.
  const reason = signal.kind === 'SUPPORT_CALLBACK' ? 'Support callback requested' : signal.kind === 'DRAFT_INACTIVE' ? 'Draft inactive for 30 hours' : signal.kind === 'ENQUIRY' ? 'Customer enquiry' : 'Service interest';
  let dueAt: Date;
  try { dueAt = await callbackSlot(tx, a.workspaceId, caller.id, nextCallDue(now)); } catch (error) { if (error instanceof TeamError && error.status === 409) return 0; throw error; }
  const task = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: caller.id, clientId: client.id, eventKey: `${prefix}${signal.source}`, title: `${reason}: ${client.name}`.slice(0, 200), description: `${reason}\nService: ${signal.service}\n\n${signal.footnotes.join('\n')}\n\nCheck the customer context before contact. Open WhatsApp or call manually, record the real outcome, and schedule a next step. Opening WhatsApp does not log a successful call.`, priority: signal.kind === 'ENQUIRY' ? 'HIGH' : signal.kind === 'SERVICE_INTEREST' ? 'LOW' : 'NORMAL', dueAt, followUpContext: json({ version: 1, ...signal }) } });
  await syncCallbackCalendar(tx, a, task);
  await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey, taskId: task.id } });
  await tx.teamNotification.create({ data: { memberId: caller.id, title: task.title, href: `/team?workspace=${a.workspaceId}&module=customer-calls` } });
  await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'support.callback_assigned', entityId: task.id, detail: { reason: signal.kind, assigneeId: caller.id, clientId: client.id } } });
  return 1;
}
/** Runs under Team OS's existing workspace lock. No customer messages or calls are sent here. */
export async function syncCustomerFollowups(tx: Prisma.TransactionClient, a: Actor, now = new Date()) {
  demand(a, 'acquisition.admin');
  const primary = await tx.teamWorkspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (primary?.id !== a.workspaceId) return { assigned: 0 };
  const deadline = Date.now() + 18000;
  const workspace = await tx.teamWorkspace.findUniqueOrThrow({ where: { id: a.workspaceId }, select: { customerFollowupCursor: true } });
  const cursor = object(workspace.customerFollowupCursor);
  const staff = await internalIdentities(tx);
  const unlinked = await tx.teamProspect.findMany({ where: { workspaceId: a.workspaceId, clientId: null }, select: { id: true }, take: 20, orderBy: { id: 'asc' }, ...(typeof cursor.prospect === 'string' ? { cursor: { id: cursor.prospect }, skip: 1 } : {}) });
  for (const p of unlinked) { if (Date.now() > deadline) break; await linkProspectContact(tx, p.id); cursor.prospect = p.id; }
  if (!unlinked.length) delete cursor.prospect;
  const open = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: 'support-call:' }, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true, client: { select: { userId: true, email: true, secondaryEmail: true, additionalEmails: true, alternatePhones: true, status: true, phone: true, user: { select: { status: true } }, prospect: { select: { suppressed: true } } } }, followUpContext: true, owner: { select: { status: true, availability: true, user: { select: { status: true } } } }, title: true, description: true, ownerId: true, clientId: true, dueAt: true, status: true }, take: 100, orderBy: { id: 'asc' }, ...(typeof cursor.open === 'string' ? { cursor: { id: cursor.open }, skip: 1 } : {}) });
  if (!open.length) delete cursor.open;
  for (const task of open) {
    if (Date.now() > deadline) break;
    cursor.open = task.id;
    const context = object(task.followUpContext);
    const internal = context.kind !== 'SUPPORT_CALLBACK' && Boolean(task.client && matchesInternalIdentity(staff, task.client));
    let obsolete = !task.client || task.client.status !== 'ACTIVE' || !whatsappNumber(context.kind === 'SUPPORT_CALLBACK' ? String(context.callbackPhone || '') : context.kind === 'FRIENDLY_INTRO' ? String(context.callPhone || '') : task.client.phone) || Boolean(task.client.prospect?.suppressed) || Boolean(task.client.user && task.client.user.status !== 'ACTIVE');
    if (context.kind === 'DRAFT_INACTIVE') {
      const release = await tx.release.findUnique({ where: { id: Number(context.referenceId) }, select: { status: true, archivedAt: true, lastEditedAt: true, createdAt: true } });
      obsolete ||= !release || release.status !== 'DRAFT' || Boolean(release.archivedAt) || (release.lastEditedAt || release.createdAt).toISOString() !== context.draftEditedAt;
    }
    if (context.kind === 'ENQUIRY' && String(context.source || '').startsWith('ticket:')) { const ticket = await tx.supportTicket.findUnique({ where: { id: Number(context.referenceId) }, select: { status: true } }); obsolete ||= !ticket || ['RESOLVED', 'CLOSED'].includes(ticket.status); }
    if (context.kind === 'SUPPORT_CALLBACK') {
      const ticket = await tx.supportTicket.findUnique({where:{id:Number(context.referenceId)},select:{id:true,status:true,details:true}});
      const details = supportDetails(ticket?.details);
      obsolete ||= !ticket || ['RESOLVED','CLOSED'].includes(ticket.status) || !['REQUESTED','ASSIGNED'].includes(details.callbackStatus || '') || String(context.source) !== `ticket:${ticket.id}:${details.callbackRequestedAt}`;
    }
    obsolete ||= internal;
    if (!obsolete && task.status !== 'BLOCKED') {
      if (task.owner.status !== 'ACTIVE' || task.owner.user.status !== 'ACTIVE' || task.owner.availability !== 'AVAILABLE') {
        const replacement = await supportCaller(tx, a);
        if (context.pinnedAssignee !== true && replacement && replacement.id !== task.ownerId) { const moved = await tx.teamTask.update({ where: { id: task.id }, data: { ownerId: replacement.id, dueAt: await callbackSlot(tx, a.workspaceId, replacement.id, nextCallDue(now), task.id), version: { increment: 1 } } }); await syncCallbackCalendar(tx, a, moved); await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: "support.callback_reassigned", entityId: task.id, detail: { from: task.ownerId, to: replacement.id, reason: "assignee_unavailable" } } }); await tx.teamNotification.create({ data: { memberId: replacement.id, title: `Callback reassigned: ${task.title}`, href: `/team?workspace=${a.workspaceId}&module=customer-calls` } }); }
      } else if ((await tx.teamCalendarEvent.findUnique({ where: { followUpTaskId: task.id } }))?.status !== 'SCHEDULED') { const due = await callbackSlot(tx, a.workspaceId, task.ownerId, task.dueAt && task.dueAt > now ? task.dueAt : nextCallDue(now), task.id); const updated = await tx.teamTask.update({ where: { id: task.id }, data: { dueAt: due, version: { increment: 1 } } }); await syncCallbackCalendar(tx, a, updated); }
    }
    if (obsolete) { await tx.teamCalendarEvent.updateMany({ where: { followUpTaskId: task.id, status: 'SCHEDULED' }, data: { status: 'CANCELLED', version: { increment: 1 }, scheduleRevision: { increment: 1 } } }); await tx.teamTask.update({ where: { id: task.id }, data: { status: 'CANCELLED', blocker: internal ? 'Internal team member: automatic customer sales follow-up cancelled.' : 'Customer resumed the draft, the release moved on, or the contact is no longer eligible.', version: { increment: 1 } } }); await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'support.callback_cancelled', entityId: task.id, detail: { reason: internal ? 'internal_team_identity' : 'source_or_contact_no_longer_eligible' } } }); }
  }
  const crm = await tx.teamProspect.findMany({ where: { workspaceId: a.workspaceId, clientId: { not: null } }, select: { id: true }, take: 40, orderBy: { id: 'asc' }, ...(typeof cursor.crm === 'string' ? { cursor: { id: cursor.crm }, skip: 1 } : {}) });
  if (!crm.length) delete cursor.crm;
  for (const prospect of crm) { if (Date.now() > deadline) break; cursor.crm = prospect.id; try { await syncProspectCallCalendar(tx, a, prospect.id, now, staff); } catch (error) { if (!(error instanceof TeamError && error.status === 409)) throw error; } }
  let assigned = 0;
  const cutoff = new Date(now.getTime() - DRAFT_CALL_INACTIVITY_HOURS * 3_600_000);
  const drafts = await tx.release.findMany({ where: { status: 'DRAFT', archivedAt: null, user: { status: 'ACTIVE', role: { in: ['CUSTOMER', 'PRODUCER'] }, mobile: { not: null } }, OR: [{ lastEditedAt: { lte: cutoff } }, { lastEditedAt: null, createdAt: { lte: cutoff } }] }, include: { user: { select: { id: true, name: true, email: true, mobile: true } }, _count: { select: { tracks: true } } }, orderBy: { id: 'asc' }, take: 100, ...(typeof cursor.draft === 'number' ? { cursor: { id: cursor.draft }, skip: 1 } : {}) });
  if (!drafts.length) delete cursor.draft;
  for (const release of drafts) {
    if (Date.now() > deadline) break;
    cursor.draft = release.id;
    const edited = release.lastEditedAt || release.createdAt;
    if (matchesInternalIdentity(staff, release.user)) continue;
    if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey: `support-signal:${a.workspaceId}:DRAFT_INACTIVE:${release.id}:${edited.getTime()}` } })) continue;
    if (!whatsappNumber(release.user.mobile)) continue;
    const client = await accountCard(tx, a, release.user); if (!client) continue;
    assigned += await emit(tx, a, client, { kind: 'DRAFT_INACTIVE', source: `${release.id}:${edited.getTime()}`, referenceId: String(release.id), service: 'Music distribution', occurredAt: edited.toISOString(), draftEditedAt: edited.toISOString(), footnotes: [`Release: ${release.title || 'Untitled draft'} (#${release.id})`, `Tracks saved: ${release._count.tracks}`, `Last saved: ${edited.toISOString()}`, 'Draft has had no saved edits for at least 30 hours. Ask whether they need help completing the release; do not claim it was submitted or approved.'] }, now);
  }
  const enquiries = await tx.growthLead.findMany({ where: { kind: 'contact', status: { notIn: ['closed', 'resolved', 'spam', 'do_not_contact'] }, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, orderBy: { id: 'asc' }, take: 100, ...(typeof cursor.enquiry === 'number' ? { cursor: { id: cursor.enquiry }, skip: 1 } : {}) });
  if (!enquiries.length) delete cursor.enquiry;
  for (const lead of enquiries) {
    if (Date.now() > deadline) break;
    cursor.enquiry = lead.id;
    if (matchesInternalIdentity(staff, { userId: lead.userId, email: lead.email, phone: lead.phone })) continue;
    if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey: `support-signal:${a.workspaceId}:ENQUIRY:${lead.id}` } })) continue;
    const user = lead.userId ? await tx.user.findFirst({ where: { id: lead.userId, status: 'ACTIVE' }, select: { id: true, name: true, email: true, mobile: true } }) : null;
    let client = user ? await accountCard(tx, a, user) : null;
    if (lead.userId && !user) continue;
    if (!client && !lead.userId && whatsappNumber(lead.phone)) {
      client = await tx.teamClient.findFirst({ where: { workspaceId: a.workspaceId, OR: [{ email: { equals: lead.email, mode: 'insensitive' } }, { phone: lead.phone || '' }] } }) ?? await tx.teamClient.create({ data: { workspaceId: a.workspaceId, ownerId: a.id, name: lead.name, email: lead.email, phone: lead.phone || '' } });
    }
    if (!client || matchesInternalIdentity(staff, client)) continue;
    assigned += await emit(tx, a, client, { kind: 'ENQUIRY', source: String(lead.id), referenceId: String(lead.id), service: lead.interest || 'General enquiry', occurredAt: lead.createdAt.toISOString(), footnotes: [`Enquiry #${lead.id} received ${lead.createdAt.toISOString()}`, `Customer message: ${lead.message.slice(0, 3000)}`, user ? 'Linked to the signed-in HYMN account.' : 'Guest enquiry: identity and WhatsApp availability are not verified.'] }, now);
  }
  const callbackTickets = await tx.supportTicket.findMany({where:{status:{in:['OPEN','IN_PROGRESS']},details:{path:['callbackStatus'],equals:'REQUESTED'}},include:{user:{select:{id:true,name:true,email:true,mobile:true,status:true}}},orderBy:{id:'asc'},take:50,...(typeof cursor.supportCallback==='number'?{cursor:{id:cursor.supportCallback},skip:1}:{})});
  if (!callbackTickets.length) delete cursor.supportCallback;
  for (const ticket of callbackTickets) {
    if (Date.now()>deadline) break;
    cursor.supportCallback=ticket.id;
    await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${ticket.id} FOR UPDATE`;
    const fresh=await tx.supportTicket.findUniqueOrThrow({where:{id:ticket.id}});
    const details=supportDetails(fresh.details);
    if(details.callbackStatus!=='REQUESTED'||!['OPEN','IN_PROGRESS'].includes(fresh.status))continue;
    if(ticket.user.status!=='ACTIVE'||!whatsappNumber(details.callbackPhone))continue;
    const client=await accountCard(tx,a,ticket.user);if(!client)continue;
    const count=await emit(tx,a,{...client,phone:details.callbackPhone!},{kind:'SUPPORT_CALLBACK',source:`ticket:${ticket.id}:${details.callbackRequestedAt}`,referenceId:String(ticket.id),service:`Support ticket #${ticket.id}`,occurredAt:details.callbackRequestedAt!,callbackPhone:details.callbackPhone,footnotes:[`Customer requested a callback on ${details.callbackPhone}`,`Ticket #${ticket.id}: ${ticket.subject}`,`Preferred time: ${details.callbackPreference || 'Not supplied'}`,ticket.message.slice(0,2000),'Internal callback task only; arrange the requested time with the customer before confirming an appointment. Record the actual outcome.']},now);
    if(count){await tx.supportTicket.update({where:{id:ticket.id},data:{details:json({...details,callbackStatus:'ASSIGNED'})}});assigned+=count;}
  }
  const tickets = await tx.supportTicket.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) }, OR: [{ category: { in: ['community_plan', 'promotion', 'sales'] } }, { subject: { in: ['Curator review support', 'Meta ads campaign request', 'Release campaign request', 'Influencer/reel campaign request', 'YouTube/short-form push request'] } }] }, include: { user: { select: { id: true, name: true, email: true, mobile: true, status: true } } }, take: 50, orderBy: { id: 'asc' }, ...(typeof cursor.ticket === 'number' ? { cursor: { id: cursor.ticket }, skip: 1 } : {}) });
  if (!tickets.length) delete cursor.ticket;
  for (const ticket of tickets) {
    if (Date.now() > deadline) break;
    cursor.ticket = ticket.id;
    if (matchesInternalIdentity(staff, ticket.user)) continue;
    if (ticket.user.status !== 'ACTIVE' || !whatsappNumber(ticket.user.mobile)) continue;
    const client = await accountCard(tx, a, ticket.user); if (!client) continue;
    assigned += await emit(tx, a, client, { kind: 'ENQUIRY', source: `ticket:${ticket.id}`, referenceId: String(ticket.id), service: ticket.category === 'community_plan' ? 'Community Plans' : ticket.subject, occurredAt: ticket.createdAt.toISOString(), footnotes: [`Customer request #${ticket.id}: ${ticket.subject}`, ticket.message.slice(0, 3000), 'Read the request before contact. Keep the proposal and response in the customer support thread.'] }, now);
  }
  const interests = await tx.growthEvent.findMany({ where: { event: 'customer_service_interest', source: 'support_signal', userId: { not: null }, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, orderBy: { id: 'asc' }, take: 100, ...(typeof cursor.interest === 'string' ? { cursor: { id: cursor.interest }, skip: 1 } : {}) });
  if (!interests.length) delete cursor.interest;
  for (const event of interests) {
    if (Date.now() > deadline) break;
    cursor.interest = event.id;
    if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey: `support-signal:${a.workspaceId}:SERVICE_INTEREST:${event.id}` } })) continue;
    const user = await tx.user.findFirst({ where: { id: event.userId!, status: 'ACTIVE', role: { in: ['CUSTOMER', 'PRODUCER'] } }, select: { id: true, name: true, email: true, mobile: true } });
    if (!user || !whatsappNumber(user.mobile)) continue;
    if (matchesInternalIdentity(staff, user)) continue;
    const client = await accountCard(tx, a, user); if (!client) continue;
    const properties = object(event.properties);
    assigned += await emit(tx, a, client, { kind: 'SERVICE_INTEREST', source: event.id, referenceId: event.id, service: String(properties.service || 'Artist services').slice(0, 120), occurredAt: event.createdAt.toISOString(), footnotes: [`Opened a service link at ${event.createdAt.toISOString()}`, `Service: ${String(properties.service || 'Artist services')}`, 'Browsing interest only: no purchase, booking or explicit enquiry is implied. Ask whether help would be welcome.'] }, now);
  }
  await tx.teamWorkspace.update({ where: { id: a.workspaceId }, data: { customerFollowupCursor: json(cursor) } });
  return { assigned };
}
export async function readCallFollowups(a: Actor, params: URLSearchParams) {
  demand(a, 'crm.outreach.manage');
  const offset = Math.max(0, Math.min(100000, Number(params.get('offset')) || 0));
  const where = { workspaceId: a.workspaceId, eventKey: { startsWith: 'support-call:' }, archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] }, ...(!can(a, 'tasks.all') ? { ownerId: a.id } : {}) };
  const items = await prisma.teamTask.findMany({ where, select: { id: true, title: true, description: true, ownerId: true, status: true, priority: true, dueAt: true, followUpContext: true, version: true, client: { select: { id: true, name: true, email: true, phone: true, status: true } } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 50, skip: offset });
  return {items:items.map(task=>{const context=object(task.followUpContext);return ['SUPPORT_CALLBACK','FRIENDLY_INTRO'].includes(String(context.kind))&&task.client?{...task,client:{...task.client,phone:String(context.callbackPhone||context.callPhone||task.client.phone)}}:task;}),total:await prisma.teamTask.count({where})};
}
export async function recordCallbackOutcome(tx: Prisma.TransactionClient, a: Actor, input: unknown, now = new Date()) {
  demand(a, 'crm.outreach.manage'); demand(a, 'tasks.update');
  const data = z.object({ id: z.string().min(1), version: z.number().int().positive(), outcome: z.enum(['NO_ANSWER', 'CALLBACK', 'INTERESTED', 'RESOLVED', 'NOT_INTERESTED', 'DO_NOT_CONTACT']), notes: z.string().trim().min(3).max(2000), nextAt: z.string().datetime({ offset: true }).optional() }).parse(input);
  const task = await tx.teamTask.findFirst({ where: { id: data.id, workspaceId: a.workspaceId, eventKey: { startsWith: 'support-call:' }, archivedAt: null, ...(!can(a, 'tasks.all') ? { ownerId: a.id } : {}) } });
  if (!task || !task.clientId) throw new TeamError('Callback unavailable.', 404);
  if (task.version !== data.version) throw new TeamError('Callback changed. Refresh before recording the result.', 409);
  if (['COMPLETED', 'CANCELLED','BLOCKED'].includes(task.status)) throw new TeamError('This callback is closed or requires manual review.', 409);
  const context = object(task.followUpContext);
  const attempts = Number(context.attempts || 0) + 1;
  let dueAt = task.dueAt;
  const noAnswerAttempts = data.outcome === 'NO_ANSWER' ? Number(context.noAnswerAttempts || 0) + 1 : 0;
  const status = context.kind === 'SUPPORT_CALLBACK' && data.outcome === 'NO_ANSWER' ? 'BLOCKED' : ['RESOLVED', 'NOT_INTERESTED', 'DO_NOT_CONTACT'].includes(data.outcome) ? 'COMPLETED' : data.outcome === 'NO_ANSWER' && noAnswerAttempts >= 3 ? 'BLOCKED' : 'TODO';
  if (data.outcome === 'CALLBACK' && !data.nextAt) throw new TeamError('Choose the callback time requested by the customer.');
  if (status === 'TODO') {
    const desired = data.nextAt ? new Date(data.nextAt) : callWindowStart(new Date(now.getTime() + 86400000));
    if (desired <= now) throw new TeamError('Choose a future callback time.');
    const available = await callbackSlot(tx, a.workspaceId, task.ownerId, desired, task.id);
    if (data.nextAt && available.getTime() !== desired.getTime()) throw new TeamError(`This time is outside calling hours or overlaps another reservation. Next available: ${available.toISOString()}.`, 409);
    dueAt = available;
  }
  const updated = await tx.teamTask.update({ where: { id: task.id }, data: { status, dueAt, completedAt: status === 'COMPLETED' ? now : null, blocker: status === 'BLOCKED' ? (context.kind === 'SUPPORT_CALLBACK' ? 'Customer unavailable. Await customer rescheduling; support can send the missed-call template.' : 'Three attempts recorded. Review before any further outreach.') : '', followUpContext: json({ ...context, attempts, noAnswerAttempts, outcome: data.outcome, lastOutcomeAt: now.toISOString(), tip: callbackTip(String(context.kind), data.outcome), footnotes: [...(Array.isArray(context.footnotes) ? context.footnotes : []), `${now.toISOString()} - ${data.outcome}: ${data.notes}`].slice(-12) }), version: { increment: 1 } } });
  if (context.kind === 'SUPPORT_CALLBACK') {
    const ticketId=Number(context.referenceId);
    await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${ticketId} FOR UPDATE`;
    const ticket=await tx.supportTicket.findUnique({where:{id:ticketId}});
    const details=supportDetails(ticket?.details);
    if(ticket && String(context.source)===`ticket:${ticket.id}:${details.callbackRequestedAt}`) {
      const callbackStatus=data.outcome==='NO_ANSWER'?'NO_ANSWER':data.outcome==='CALLBACK'?'ASSIGNED':'CONTACTED';
      await tx.supportTicket.update({where:{id:ticket.id},data:{details:json({...details,callbackStatus,callbackAttemptAt:now.toISOString()})}});
    }
  }
  await tx.teamComment.create({ data: { taskId: task.id, authorId: a.id, body: `${data.outcome}: ${data.notes}${status === 'TODO' ? `\nNext callback: ${dueAt!.toISOString()}` : ''}` } });
  await syncCallbackCalendar(tx, a, updated);
  if (data.outcome === 'DO_NOT_CONTACT') {
    await tx.teamClient.update({ where: { id: task.clientId }, data: { status: 'DO_NOT_CONTACT', version: { increment: 1 } } });
    await tx.teamProspect.updateMany({ where: { clientId: task.clientId }, data: { suppressed: true, stage: 'DO_NOT_CONTACT', version: { increment: 1 } } });
    await tx.teamTask.updateMany({ where: { workspaceId: a.workspaceId, clientId: task.clientId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, data: { status: 'CANCELLED', version: { increment: 1 } } });
    await tx.teamCalendarEvent.updateMany({ where: { workspaceId: a.workspaceId, clientId: task.clientId, status: 'SCHEDULED' }, data: { status: 'CANCELLED', version: { increment: 1 }, scheduleRevision: { increment: 1 } } });
  }
  await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'support.callback_outcome', entityId: task.id, detail: { outcome: data.outcome, attempts, nextAt: dueAt?.toISOString() || null } } });
  return updated;
}
