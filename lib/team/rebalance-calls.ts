import 'server-only';
import { Prisma } from '@prisma/client';
import { can, type Actor } from './policy';
import { crmPreferences } from './crm-workflow';
import { planCallRebalance } from './call-rebalance-plan';
import { callWorkload } from './call-workload';
import { record } from './availability-rules';

export async function rebalanceCalls(tx: Prisma.TransactionClient, actor: Actor, preferredMemberId: string, requestKey: string, now = new Date(), apply = false) {
  if (!actor.role.owner) throw Error('Workspace owner required.');
  const eventKey = `call-rebalance:${requestKey}`;
  if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey } })) return { alreadyApplied: true, plans: [], counts: [] };
  const members = await tx.teamMember.findMany({ where: { workspaceId: actor.workspaceId, status: 'ACTIVE', availability: 'AVAILABLE', role: { owner: false }, user: { status: 'ACTIVE' } }, include: { role: true, user: { select: { name: true } } }, orderBy: { id: 'asc' } });
  const callers = members.filter(member => can(member, 'crm.outreach.manage') && can(member, 'calendar.manage') && crmPreferences(member.preferences).caller);
  if (!callers.some(member => member.id === preferredMemberId)) throw Error('Preferred representative is not an active caller.');
  const weighted = callers.map(member => ({ ...member, preferences: { ...record(member.preferences), crm: { ...record(record(member.preferences).crm), callWeight: member.id === preferredMemberId ? 1.25 : 1 } } }));
  const tasks = await tx.teamTask.findMany({ where: { workspaceId: actor.workspaceId, ownerId: { in: callers.map(member => member.id) }, archivedAt: null, status: 'TODO', eventKey: { startsWith: 'support-call:' }, client: { status: 'ACTIVE', mergedIntoId: null } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }] });
  const events = await tx.teamCalendarEvent.findMany({ where: { workspaceId: actor.workspaceId, status: 'SCHEDULED' } });
  const movable = tasks.filter(task => !record(task.followUpContext).attempts && events.some(event => event.followUpTaskId === task.id && event.kind === 'FOLLOW_UP'));
  const movingEvents = new Set(movable.map(task => events.find(event => event.followUpTaskId === task.id)!.id));
  const initialLoad = await callWorkload(tx, actor.workspaceId, callers.map(member => member.id));
  for (const task of movable) initialLoad.set(task.ownerId, Math.max(0, (initialLoad.get(task.ownerId) || 0) - 1));
  const plans = planCallRebalance(weighted, movable.map(task => ({ ...task, eventId: events.find(event => event.followUpTaskId === task.id)!.id })), events.filter(event => !movingEvents.has(event.id)), initialLoad, now);
  const counts = weighted.map(member => ({ memberId: member.id, name: member.user.name, weight: member.id === preferredMemberId ? 1.25 : 1, callbacks: plans.filter(plan => plan.ownerId === member.id).length }));
  if (!apply) return { alreadyApplied: false, plans, counts };
  for (const member of weighted) await tx.teamMember.update({ where: { id: member.id }, data: { preferences: member.preferences as Prisma.InputJsonValue } });
  const changes = plans.map(plan => ({ ...plan, taskVersion: movable.find(task => task.id === plan.taskId)!.version, eventVersion: events.find(event => event.id === plan.eventId)!.version }));
  const input = JSON.stringify(changes);
  const taskCount = await tx.$executeRaw`UPDATE team_tasks t SET "ownerId"=p."ownerId", "dueAt"=p."startsAt", version=t.version+1, "updatedAt"=${now} FROM jsonb_to_recordset(${input}::jsonb) AS p("taskId" text,"ownerId" text,"startsAt" timestamp,"taskVersion" int) WHERE t.id=p."taskId" AND t.version=p."taskVersion"`;
  const eventCount = await tx.$executeRaw`UPDATE team_calendar_events e SET "assigneeId"=p."ownerId", "startsAt"=p."startsAt", "endsAt"=p."endsAt", "remindedAt"=NULL, "scheduleRevision"=e."scheduleRevision"+1, version=e.version+1, "updatedAt"=${now} FROM jsonb_to_recordset(${input}::jsonb) AS p("eventId" text,"ownerId" text,"startsAt" timestamp,"endsAt" timestamp,"eventVersion" int) WHERE e.id=p."eventId" AND e.version=p."eventVersion"`;
  if (taskCount !== plans.length || eventCount !== plans.length) throw Error('A call changed during planning; transaction rolled back.');
  await tx.teamAppointmentMessage.updateMany({ where: { eventId: { in: plans.map(plan => plan.eventId) }, status: 'PENDING', kind: { startsWith: 'REP_' } }, data: { status: 'CANCELLED' } });
  await tx.teamWorkflowEvent.create({ data: { workspaceId: actor.workspaceId, eventKey } });
  await tx.teamAudit.create({ data: { workspaceId: actor.workspaceId, actorId: actor.id, action: 'calls.rebalanced', entityId: actor.workspaceId, detail: { requestKey, counts, tasks: plans.length, authority: 'Explicit owner request; internal unattempted callbacks only.' } } });
  for (const count of counts) await tx.teamNotification.create({ data: { memberId: count.memberId, title: `Call plan updated: ${count.callbacks} callbacks assigned. Review your calendar.`, href: '/team?module=customer-calls' } });
  return { alreadyApplied: false, plans, counts };
}
