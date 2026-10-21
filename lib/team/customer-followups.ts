import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { can, demand, type Actor } from './policy';
import { crmPreferences } from './crm-workflow';
import { whatsappNumber } from './phone';
import { linkProspectContact } from './contact-directory';

export const DRAFT_CALL_INACTIVITY_HOURS = 30;
type Signal = { kind: 'DRAFT_INACTIVE' | 'ENQUIRY' | 'SERVICE_INTEREST'; source: string; referenceId: string; service: string; occurredAt: string; footnotes: string[]; draftEditedAt?: string };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function nextCallDue(now: Date) {
  const local = new Date(now.getTime() + 330 * 60_000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minute >= 570 && minute < 1050) return new Date(now.getTime() + 60 * 60_000);
  if (minute >= 1050) local.setUTCDate(local.getUTCDate() + 1);
  local.setUTCHours(9, 30, 0, 0);
  return new Date(local.getTime() - 330 * 60_000);
}
async function supportCaller(tx: Prisma.TransactionClient, a: Actor) {
  const members = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', availability: 'AVAILABLE', role: { owner: false }, user: { status: 'ACTIVE' } }, include: { role: true }, orderBy: { id: 'asc' } });
  const callers = members.filter(m => (crmPreferences(m.preferences).caller || crmPreferences(m.preferences).workRole === 'caller') && can(m, 'crm.outreach.manage') && can(m, 'tasks.update'));
  if (!callers.length) return null;
  const previous = await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: 'support-call:' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  return callers[(callers.findIndex(m => m.id === previous?.ownerId) + 1) % callers.length];
}
async function accountCard(tx: Prisma.TransactionClient, a: Actor, user: { id: number; name: string; email: string; mobile: string | null }) {
  const linked = await tx.teamClient.findUnique({ where: { userId: user.id } });
  if (linked) return linked.workspaceId === a.workspaceId ? linked : null;
  const existing = await tx.teamClient.findFirst({ where: { workspaceId: a.workspaceId, OR: [{ email: { equals: user.email, mode: 'insensitive' } }, { secondaryEmail: { equals: user.email, mode: 'insensitive' } }] } });
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
  const prior = signal.kind === 'DRAFT_INACTIVE' ? null : await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, clientId: client.id, eventKey: { startsWith: prefix }, status: { notIn: ['COMPLETED', 'CANCELLED'] }, followUpContext: { path: ['service'], equals: signal.service } } });
  if (prior) {
    const context = object(prior.followUpContext), footnotes = Array.isArray(context.footnotes) ? context.footnotes : [];
    await tx.teamTask.update({ where: { id: prior.id }, data: { followUpContext: json({ ...context, footnotes: [...footnotes, ...signal.footnotes].slice(-12) }), version: { increment: 1 } } });
    await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey, taskId: prior.id } }); return 0;
  }
  const caller = await supportCaller(tx, a);
  if (!caller) return 0; // Leave the source unconsumed so an available representative can receive it later.
  const reason = signal.kind === 'DRAFT_INACTIVE' ? 'Draft inactive for 30 hours' : signal.kind === 'ENQUIRY' ? 'Customer enquiry' : 'Service interest';
  const task = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: caller.id, clientId: client.id, eventKey: `${prefix}${signal.source}`, title: `${reason}: ${client.name}`.slice(0, 200), description: `${reason}\nService: ${signal.service}\n\n${signal.footnotes.join('\n')}\n\nCheck the customer context before contact. Open WhatsApp or call manually, record the real outcome, and schedule a next step. Opening WhatsApp does not log a successful call.`, priority: signal.kind === 'ENQUIRY' ? 'HIGH' : signal.kind === 'SERVICE_INTEREST' ? 'LOW' : 'NORMAL', dueAt: nextCallDue(now), followUpContext: json({ version: 1, ...signal }) } });
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
  const unlinked = await tx.teamProspect.findMany({ where: { workspaceId: a.workspaceId, clientId: null }, select: { id: true }, take: 20, orderBy: { id: 'asc' }, ...(typeof cursor.prospect === 'string' ? { cursor: { id: cursor.prospect }, skip: 1 } : {}) });
  for (const p of unlinked) { if (Date.now() > deadline) break; await linkProspectContact(tx, p.id); cursor.prospect = p.id; }
  if (!unlinked.length) delete cursor.prospect;
  const open = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: 'support-call:' }, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { id: true, client: { select: { status: true, phone: true, user: { select: { status: true } }, prospect: { select: { suppressed: true } } } }, followUpContext: true }, take: 100, orderBy: { id: 'asc' }, ...(typeof cursor.open === 'string' ? { cursor: { id: cursor.open }, skip: 1 } : {}) });
  if (!open.length) delete cursor.open;
  for (const task of open) {
    if (Date.now() > deadline) break;
    cursor.open = task.id;
    const context = object(task.followUpContext);
    let obsolete = !task.client || task.client.status !== 'ACTIVE' || !whatsappNumber(task.client.phone) || Boolean(task.client.prospect?.suppressed) || Boolean(task.client.user && task.client.user.status !== 'ACTIVE');
    if (context.kind === 'DRAFT_INACTIVE') {
      const release = await tx.release.findUnique({ where: { id: Number(context.referenceId) }, select: { status: true, archivedAt: true, lastEditedAt: true, createdAt: true } });
      obsolete ||= !release || release.status !== 'DRAFT' || Boolean(release.archivedAt) || (release.lastEditedAt || release.createdAt).toISOString() !== context.draftEditedAt;
    }
    if (obsolete) { await tx.teamTask.update({ where: { id: task.id }, data: { status: 'CANCELLED', blocker: 'Customer resumed the draft, the release moved on, or the contact is no longer eligible.', version: { increment: 1 } } }); await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'support.callback_cancelled', entityId: task.id, detail: { reason: 'source_or_contact_no_longer_eligible' } } }); }
  }
  let assigned = 0;
  const cutoff = new Date(now.getTime() - DRAFT_CALL_INACTIVITY_HOURS * 3_600_000);
  const drafts = await tx.release.findMany({ where: { status: 'DRAFT', archivedAt: null, user: { status: 'ACTIVE', role: { in: ['CUSTOMER', 'PRODUCER'] }, mobile: { not: null } }, OR: [{ lastEditedAt: { lte: cutoff } }, { lastEditedAt: null, createdAt: { lte: cutoff } }] }, include: { user: { select: { id: true, name: true, email: true, mobile: true } }, _count: { select: { tracks: true } } }, orderBy: { id: 'asc' }, take: 100, ...(typeof cursor.draft === 'number' ? { cursor: { id: cursor.draft }, skip: 1 } : {}) });
  if (!drafts.length) delete cursor.draft;
  for (const release of drafts) {
    if (Date.now() > deadline) break;
    cursor.draft = release.id;
    const edited = release.lastEditedAt || release.createdAt;
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
    if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey: `support-signal:${a.workspaceId}:ENQUIRY:${lead.id}` } })) continue;
    const user = lead.userId ? await tx.user.findFirst({ where: { id: lead.userId, status: 'ACTIVE' }, select: { id: true, name: true, email: true, mobile: true } }) : null;
    let client = user ? await accountCard(tx, a, user) : null;
    if (lead.userId && !user) continue;
    if (!client && !lead.userId && whatsappNumber(lead.phone)) {
      client = await tx.teamClient.findFirst({ where: { workspaceId: a.workspaceId, OR: [{ email: { equals: lead.email, mode: 'insensitive' } }, { phone: lead.phone || '' }] } }) ?? await tx.teamClient.create({ data: { workspaceId: a.workspaceId, ownerId: a.id, name: lead.name, email: lead.email, phone: lead.phone || '' } });
    }
    if (!client) continue;
    assigned += await emit(tx, a, client, { kind: 'ENQUIRY', source: String(lead.id), referenceId: String(lead.id), service: lead.interest || 'General enquiry', occurredAt: lead.createdAt.toISOString(), footnotes: [`Enquiry #${lead.id} received ${lead.createdAt.toISOString()}`, `Customer message: ${lead.message.slice(0, 3000)}`, user ? 'Linked to the signed-in HYMN account.' : 'Guest enquiry: identity and WhatsApp availability are not verified.'] }, now);
  }
  const interests = await tx.growthEvent.findMany({ where: { event: 'customer_service_interest', source: 'support_signal', userId: { not: null }, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, orderBy: { id: 'asc' }, take: 100, ...(typeof cursor.interest === 'string' ? { cursor: { id: cursor.interest }, skip: 1 } : {}) });
  if (!interests.length) delete cursor.interest;
  for (const event of interests) {
    if (Date.now() > deadline) break;
    cursor.interest = event.id;
    if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey: `support-signal:${a.workspaceId}:SERVICE_INTEREST:${event.id}` } })) continue;
    const user = await tx.user.findFirst({ where: { id: event.userId!, status: 'ACTIVE', role: { in: ['CUSTOMER', 'PRODUCER'] } }, select: { id: true, name: true, email: true, mobile: true } });
    if (!user || !whatsappNumber(user.mobile)) continue;
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
  return { items: await prisma.teamTask.findMany({ where, select: { id: true, title: true, description: true, ownerId: true, status: true, priority: true, dueAt: true, followUpContext: true, version: true, client: { select: { id: true, name: true, email: true, phone: true, status: true } } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 50, skip: offset }), total: await prisma.teamTask.count({ where }) };
}
