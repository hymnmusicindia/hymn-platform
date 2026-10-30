import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { TeamError, type Actor } from './policy';

export const activityCategories = ['all', 'calls', 'contacts', 'leads', 'work', 'schedule', 'reports', 'team', 'other'] as const;
type Category = typeof activityCategories[number];
const prefixes: Record<Exclude<Category, 'all' | 'other'>, string[]> = {
  calls: ['contact.call_report', 'support.callback_'], contacts: ['client.', 'coordinator.contact_created'],
  leads: ['prospect.', 'prospects.', 'outreach.', 'enquiry.'],
  work: ['workstation.','contact.activity_report','task.', 'tasks.', 'project.', 'coordinator.', 'approval.', 'document.'],
  schedule: ['calendar.', 'availability.'], reports: ['report.'],
  team: ['member.', 'role.', 'owner.', 'invitation.'],
};
const hidden = ['coordinator.synced', 'workflow.synced'];
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === 'string' ? value : '';
const readable = (value: string) => value.replace(/[._]/g, ' ').replace(/^./, c => c.toUpperCase());
export function activityCategory(action: string): Exclude<Category, 'all'> {
  return (Object.entries(prefixes).find(([, values]) => values.some(prefix => action.startsWith(prefix)))?.[0] || 'other') as Exclude<Category, 'all'>;
}
const titles: Record<string, string> = {
  'contact.activity_report':'Saved an activity report', 'workstation.started':'Started an activity','workstation.paused':'Paused an activity','workstation.resumed':'Resumed an activity','workstation.ticket_closed':'Closed a support ticket','workstation.email_queued':'Queued a client email','workstation.missed_email':'Queued a missed-call email',
  'contact.call_report': 'Saved a call report', 'client.created': 'Added a contact', 'client.updated': 'Updated a contact', 'client.merged': 'Merged duplicate contacts',
  'client.account_linked': 'Linked a registered customer', 'coordinator.contact_created': 'Added a contact',
  'task.created': 'Created a task', 'task.updated': 'Updated a task', 'task.comment_added': 'Added a work update', 'task.archived': 'Archived a task',
  'task.duplicated': 'Duplicated a task', 'tasks.bulk_updated': 'Updated multiple tasks', 'task.controls_updated': 'Updated task controls',
  'prospect.created': 'Added a lead', 'prospect.updated': 'Updated a lead', 'prospect.research_updated': 'Checked a lead source', 'prospects.imported': 'Imported leads',
  'outreach.contact': 'Recorded a lead conversation', 'outreach.reply': 'Recorded a lead reply',
  'support.callback_outcome': 'Recorded a callback outcome', 'support.callback_updated': 'Added callback notes or rescheduled',
  'support.callback_assigned': 'Automatically assigned a callback', 'support.callback_reassigned': 'Automatically reassigned a callback', 'support.callback_cancelled': 'Automatically cancelled an ineligible callback',
  'coordinator.received': 'Added incoming work', 'coordinator.assigned': 'Automatically routed incoming work', 'coordinator.context_merged': 'Attached context to existing work',
  'availability.submitted': 'Updated working hours', 'availability.policy_updated': 'Updated a working-hours policy',
  'calendar.created': 'Added a calendar event', 'calendar.updated': 'Updated a calendar event', 'calendar.deleted': 'Removed a calendar event', 'calendar.handoff': 'Handed over an appointment', 'calendar.task.created': 'Scheduled a task',
  'report.submitted': 'Submitted a weekly report', 'member.profile_updated': 'Updated a team profile', 'member.invited': 'Invited a teammate', 'member.access_changed': 'Changed team access',
};
const paramsSchema = z.object({
  days: z.enum(['1', '7', '30', '90', 'all']).default('7'), category: z.enum(activityCategories).default('all'),
  member: z.string().max(150).default(''), cursor: z.string().max(1000).optional(),
  snapshot: z.string().datetime().optional(), mode: z.enum(['feed', 'head']).default('feed'),
});
function cursorValue(raw: string) {
  try { return z.object({ at: z.string().datetime(), id: z.string().min(1).max(200) }).parse(JSON.parse(Buffer.from(raw, 'base64url').toString())); }
  catch { throw new TeamError('Invalid activity page. Refresh the feed.'); }
}
const encodeCursor = (row: { id: string; createdAt: Date }) => Buffer.from(JSON.stringify({ at: row.createdAt.toISOString(), id: row.id })).toString('base64url');

export async function readLeadershipActivity(a: Actor, params: URLSearchParams, now = new Date()) {
  // Names and application-admin status never grant leadership access.
  if (!a.role.owner) throw new TeamError('This activity view is available to workspace owners only.', 403);
  const input = paramsSchema.parse(Object.fromEntries(params));
  const snapshot = input.snapshot ? new Date(input.snapshot) : now;
  if (snapshot.getTime() > now.getTime() + 5000) throw new TeamError('Invalid activity snapshot.');
  const localDay = new Date(snapshot.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const start = new Date(`${localDay}T00:00:00+05:30`);
  start.setTime(input.days === 'all' ? 0 : start.getTime() - (Number(input.days) - 1) * 86400000);
  const earlierPrefixes = Object.values(prefixes).slice(0, Object.keys(prefixes).indexOf(input.category)).flat();
  const categoryWhere = input.category === 'all' ? {} : input.category === 'other'
    ? { NOT: { OR: Object.values(prefixes).flat().map(prefix => ({ action: { startsWith: prefix } })) } }
    : { AND: [{ OR: prefixes[input.category].map(prefix => ({ action: { startsWith: prefix } })) }, ...(earlierPrefixes.length ? [{ NOT: { OR: earlierPrefixes.map(prefix => ({ action: { startsWith: prefix } })) } }] : [])] };
  const base: Prisma.TeamAuditWhereInput = { workspaceId: a.workspaceId, createdAt: { gte: start, lte: snapshot },
    ...(input.member ? { actorId: input.member } : {}),
    AND: [{ action: { notIn: hidden } }, { NOT: { OR: [{ action: { startsWith: 'message.' } }, { action: { startsWith: 'channel.' } }] } }, categoryWhere],
  };
  if (input.mode === 'head') {
    const first = await prisma.teamAudit.findFirst({ where: base, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
    return { latestId: first?.id || null };
  }
  const cursor = input.cursor ? cursorValue(input.cursor) : null;
  const where: Prisma.TeamAuditWhereInput = cursor ? { AND: [base, { OR: [{ createdAt: { lt: new Date(cursor.at) } }, { createdAt: new Date(cursor.at), id: { lt: cursor.id } }] }] } : base;
  const [rows, groups, members] = await Promise.all([
    prisma.teamAudit.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31 }),
    prisma.teamAudit.groupBy({ by: ['actorId', 'action'], where: base, _count: true }),
    prisma.teamMember.findMany({ where: { workspaceId: a.workspaceId }, select: { id: true, status: true, user: { select: { name: true } } }, orderBy: { joinedAt: 'asc' } }),
  ]);
  const visible = rows.slice(0, 30);
  const details = visible.map(row => ({ row, detail: object(row.detail) }));
  const taskIds = details.filter(({ row }) => /^(task\.|support\.callback_|calendar\.task\.)/.test(row.action)).map(({ row }) => row.entityId);
  const prospectIds = details.filter(({ row }) => row.action.startsWith('prospect.')).map(({ row }) => row.entityId);
  const outreachIds = details.filter(({ row }) => row.action.startsWith('outreach.')).map(({ row }) => row.entityId);
  const [tasks, prospects, outreaches, events, intakes] = await Promise.all([
    prisma.teamTask.findMany({ where: { workspaceId: a.workspaceId, id: { in: taskIds } }, select: { id: true, title: true, clientId: true } }),
    prisma.teamProspect.findMany({ where: { workspaceId: a.workspaceId, id: { in: prospectIds } }, select: { id: true, name: true, clientId: true } }),
    prisma.teamOutreach.findMany({ where: { id: { in: outreachIds }, prospect: { workspaceId: a.workspaceId } }, select: { id: true, body: true, occurredAt: true, prospect: { select: { name: true, clientId: true } } } }),
    prisma.teamCalendarEvent.findMany({ where: { workspaceId: a.workspaceId, id: { in: visible.filter(row => row.action.startsWith('calendar.')).map(row => row.entityId) } }, select: { id: true, title: true, clientId: true } }),
    prisma.teamWorkIntake.findMany({ where: { workspaceId: a.workspaceId, id: { in: visible.filter(row => row.action.startsWith('coordinator.')).map(row => row.entityId) } }, select: { id: true, summary: true, clientId: true, taskId: true } }),
  ]);
  const clientIds = [...new Set([
    ...details.filter(({ row }) => row.action.startsWith('client.') || ['contact.call_report','contact.activity_report'].includes(row.action) || row.action === 'coordinator.contact_created').map(({ row }) => row.entityId),
    ...details.map(({ detail }) => string(detail.clientId)), ...tasks.map(row => row.clientId), ...prospects.map(row => row.clientId), ...outreaches.map(row => row.prospect.clientId), ...events.map(row => row.clientId), ...intakes.map(row => row.clientId),
  ].filter((id): id is string => Boolean(id)))];
  const clients = await prisma.teamClient.findMany({ where: { workspaceId: a.workspaceId, id: { in: clientIds } }, select: { id: true, name: true, mergedIntoId: true } });
  const retained = await prisma.teamClient.findMany({ where: { workspaceId: a.workspaceId, id: { in: clients.flatMap(row => row.mergedIntoId ? [row.mergedIntoId] : []) } }, select: { id: true, name: true, mergedIntoId: true } });
  const contactMap = new Map([...clients, ...retained].map(row => [row.id, row]));
  const memberMap = new Map(members.map(row => [row.id, row]));
  const route = (module: string, query: Record<string, string> = {}) => `/team?${new URLSearchParams({ workspace: a.workspaceId, module, ...query })}`;
  const items = details.map(({ row, detail }) => {
    const category = activityCategory(row.action);
    const task = tasks.find(item => item.id === row.entityId), prospect = prospects.find(item => item.id === row.entityId), outreach = outreaches.find(item => item.id === row.entityId), event = events.find(item => item.id === row.entityId), intake = intakes.find(item => item.id === row.entityId);
    const clientId = row.action.startsWith('client.') || ['contact.call_report','contact.activity_report'].includes(row.action) || row.action === 'coordinator.contact_created' ? row.entityId : task?.clientId || prospect?.clientId || outreach?.prospect.clientId || event?.clientId || intake?.clientId || string(detail.clientId);
    const original = contactMap.get(clientId || ''), contact = original?.mergedIntoId ? contactMap.get(original.mergedIntoId) : original;
    const links: { label: string; href: string }[] = [];
    if (contact && !contact.mergedIntoId) links.push({ label: 'Open contact & reports', href: route('contacts', { client: contact.id }) });
    if (task) links.push({ label: 'Open work history', href: route('work', { task: task.id }) });
    if (intake?.taskId) links.push({ label: 'Open assigned work', href: route('work', { task: intake.taskId }) });
    if (!links.length && category === 'leads') links.push({ label: 'Open contacts & calls', href: route('acquisition') });
    if (category === 'schedule') links.push({ label: row.action.startsWith('availability.') ? 'Open working hours' : 'Open calendar', href: route(row.action.startsWith('availability.') ? 'availability' : 'calendar') });
    if (category === 'reports') links.push({ label: 'Open weekly reports', href: route('reports') });
    if (category === 'team') links.push({ label: 'Open team directory', href: route('directory') });
    if (category === 'work' && !links.length) links.push({ label: 'Open work', href: route('tasks') });
    if (row.action.startsWith('project.')) links.push({ label: 'Open projects', href: route('projects') });
    if (row.action.startsWith('approval.')) links.push({ label: 'Open approvals', href: route('approvals') });
    const fields = [
      ['Call time (IST)', string(detail.occurredAt) || outreach?.occurredAt?.toISOString() || ''],
      ['Recorded by', string(detail.authorName)], ['Role',string(detail.authorRole)], ['Duration (seconds)', typeof detail.elapsedSeconds==='number'?String(detail.elapsedSeconds):''], ['Services',Array.isArray(detail.services)?detail.services.join(', '):''], ['Outcome', string(detail.outcome)], [row.action==='contact.call_report'?'Called using':'Activity source', ['contact.call_report','contact.activity_report'].includes(row.action) ? readable(string(detail.source).toLowerCase()) : ''], ['Discussion', string(detail.discussion) || string(detail.notes) || outreach?.body || ''],
      ['Customer needs', string(detail.needs)], ['Agreements', string(detail.commitments)], ['Next action', string(detail.nextAction)],
      ['Requested follow-up', row.action === 'support.callback_outcome' ? string(detail.requestedNextAt) : string(detail.nextAt)],
      ['Next scheduled callback', row.action === 'support.callback_outcome' && detail.status === 'TODO' ? string(detail.nextAt) : ''], ['Work update', string(detail.body)],
      ['Status', string(detail.status)], ['Previous status', string(detail.previousStatus)], ['Stage', string(detail.stage)],
      ['Previous stage', string(detail.previousStage)],
      ['Work', string(detail.title) || task?.title || ''],
      ['Fields changed', Array.isArray(detail.changedFields) ? detail.changedFields.filter(value => typeof value === 'string').join(', ') : ''],
    ].filter(([, value]) => value).map(([label, value]) => ({ label, value }));
    if (typeof detail.imported === 'number') fields.push({ label: 'Leads imported', value: String(detail.imported) });
    const automatic = row.action.startsWith('support.callback_') && /assigned|cancelled/.test(row.action) || row.action === 'coordinator.assigned' || detail.origin === 'AUTOMATION';
    return { id: row.id, at: row.createdAt.toISOString(), action: row.action, title: titles[row.action] || readable(row.action), category,
      actor: { id: row.actorId, name: memberMap.get(row.actorId)?.user.name || 'Former team member' }, automatic,
      subject: string(detail.contactName) || contact?.name || task?.title || prospect?.name || outreach?.prospect.name || event?.title || intake?.summary || '',
      isUpdate: Boolean(detail.amendsReportId), fields, links };
  });
  const byCategory: Record<string, number> = {}, byMember = new Map<string, number>();
  for (const group of groups) { const category = activityCategory(group.action); byCategory[category] = (byCategory[category] || 0) + group._count; byMember.set(group.actorId, (byMember.get(group.actorId) || 0) + group._count); }
  return { items, latestId: items[0]?.id || null, nextCursor: rows.length > 30 ? encodeCursor(visible[visible.length - 1]) : null,
    snapshot: snapshot.toISOString(), from: start.toISOString(), total: groups.reduce((sum, row) => sum + row._count, 0),
    summary: { callReports: groups.filter(row => row.action==='contact.call_report').reduce((sum, row) => sum + row._count, 0), contactsAdded: groups.filter(row => ['client.created', 'coordinator.contact_created'].includes(row.action)).reduce((sum, row) => sum + row._count, 0), workUpdates: byCategory.work || 0, contributors: byMember.size },
    members: members.map(row => ({ id: row.id, name: row.user.name, status: row.status, updates: byMember.get(row.id) || 0 })),
  };
}
