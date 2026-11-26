import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { can, TeamError, type Actor, type Permission } from './policy';
import { audit, notify, teamMutationTx } from './service';
import { activityOpen, workTaskModule } from './work-station-policy';
import { isCallWork } from './daily-call-policy';
import { capacity, object, ownerOperations, planning, remainingHours } from './operations-policy';

const token = (value: unknown) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
const id = z.string().min(1).max(100);
const closed = ['COMPLETED', 'CANCELLED'];
const operationalPermission: Record<string, Permission> = { release: 'operations.distribution.review', beat: 'operations.beats.manage', engineer: 'operations.engineers.manage', studio: 'operations.studio.review', support: 'support.reply' };

export async function readOperations(a: Actor, params: URLSearchParams) {
  ownerOperations(a);
  // Re-read authority for a long-lived session; never infer owner status from names.
  const live = await prisma.teamMember.findFirst({ where: { id: a.id, workspaceId: a.workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' }, role: { owner: true } } });
  if (!live) throw new TeamError('Owner access has changed. Sign in again.', 403);
  const days = params.get('period') === '30' ? 30 : 7;
  const now = new Date(), end = new Date(now.getTime() + days * 86400000), start = new Date(now.getTime() - days * 86400000);
  const taskWhere: Prisma.TeamTaskWhereInput = { workspaceId: a.workspaceId, archivedAt: null, OR: [{ status: { notIn: closed } }, { completedAt: { gte: start } }] };
  const [members, tasks, total, approvals, intakes, pipeline, recent] = await Promise.all([
    prisma.teamMember.findMany({ where: { workspaceId: a.workspaceId }, select: { id: true, department: true, jobTitle: true, responsibilities: true, availability: true, status: true, preferences: true, user: { select: { name: true, avatar: true, status: true } }, role: { select: { name: true, owner: true, permissions: true } } }, orderBy: { joinedAt: 'asc' } }),
    prisma.teamTask.findMany({ where: taskWhere, take: 5000, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }], select: { id: true, ownerId: true, creatorId: true, title: true, status: true, priority: true, dueAt: true, completedAt: true, createdAt: true, version: true, followUpContext: true, eventKey: true, projectId: true, dependencyIds: true, recordType: true, recordId: true, blocker: true, project: { select: { title: true, memberIds: true } } } }),
    prisma.teamTask.count({ where: taskWhere }),
    prisma.teamTask.count({ where: { workspaceId: a.workspaceId, archivedAt: null, status: 'IN_REVIEW' } }),
    prisma.teamWorkIntake.count({ where: { workspaceId: a.workspaceId, taskId: null, status: 'WAITING' } }),
    prisma.teamProspect.groupBy({ by: ['stage'], where: { workspaceId: a.workspaceId }, _count: true }),
    prisma.teamAudit.findMany({ where: { workspaceId: a.workspaceId, action: { in: ['task.updated', 'task.created', 'operations.delegated', 'operations.estimate', 'operations.capacity'] } }, take: 15, orderBy: { createdAt: 'desc' }, select: { id: true, action: true, entityId: true, createdAt: true } }),
  ]);
  const scheduled = await prisma.teamCalendarEvent.findMany({ where: { workspaceId: a.workspaceId, followUpTaskId: { in: tasks.map(task => task.id) }, status: 'SCHEDULED' }, select: { followUpTaskId: true } });
  const appointments = await prisma.consultationRequest.findMany({ where: { workspaceId: a.workspaceId, taskId: { in: tasks.map(task => task.id) } }, select: { taskId: true } });
  const reserved = new Set([...scheduled.map(event => event.followUpTaskId), ...appointments.map(request => request.taskId)]);
  const complete = tasks.length === total;
  const items = tasks.map(task => ({ ...task, followUpContext: undefined, eventKey: undefined, remainingHours: remainingHours(task.followUpContext), kind: isCallWork(task) ? 'calls' : 'tasks', module: workTaskModule(task), locked: activityOpen(task.followUpContext) || closed.includes(task.status) || reserved.has(task.id), project: task.project?.title ?? null, projectMemberIds: task.project?.memberIds ?? [], dueAt: task.dueAt?.toISOString() ?? null, completedAt: task.completedAt?.toISOString() ?? null, createdAt: task.createdAt.toISOString() }));
  const roster = members.map(member => {
    const config = planning(member.preferences), assigned = items.filter(task => task.ownerId === member.id);
    const open = assigned.filter(task => !closed.includes(task.status));
    const planned = open.filter(task => !task.dueAt || new Date(task.dueAt) <= end);
    const hours = planned.reduce((sum, task) => sum + (task.remainingHours ?? 0), 0), missing = planned.filter(task => task.remainingHours === null).length;
    const available = config.weeklyHours === null ? null : config.weeklyHours * days / 7;
    return { id: member.id, name: member.user.name || 'Team member', avatar: member.user.avatar, role: member.role.name, owner: member.role.owner, department: member.department, jobTitle: member.jobTitle, responsibilities: member.responsibilities, availability: member.availability, active: member.status === 'ACTIVE' && member.user.status === 'ACTIVE', permissions: member.role.permissions, config, configVersion: token(object(member.preferences).operations), hours, missing, available, capacity: capacity(hours, complete ? missing : missing + 1, available, config), assigned: open.length, activeWork: open.filter(task => task.status === 'IN_PROGRESS').length, overdue: open.filter(task => task.dueAt && new Date(task.dueAt) < now).length, blocked: open.filter(task => task.status === 'BLOCKED').length, completed: assigned.filter(task => task.status === 'COMPLETED').length };
  });
  return { items, members: roster, total, complete, days, now: now.toISOString(), end: end.toISOString(), approvals, unassignedIntakes: intakes, pipeline, recent };
}

export async function operationsMutation(tx: Prisma.TransactionClient, a: Actor, resource: string, input: unknown) {
  ownerOperations(a);
  if (resource === 'operations-capacity') {
    const data = z.object({ id, version: z.string(), weeklyHours: z.number().min(0).max(168).nullable(), skills: z.array(z.string().trim().min(1).max(60)).max(30), near: z.number().min(1).max(200), overloaded: z.number().min(1).max(300) }).refine(v => v.near < v.overloaded, 'Near-capacity threshold must be below the overload threshold.').parse(input);
    const member = await tx.teamMember.findFirst({ where: { id: data.id, workspaceId: a.workspaceId } });
    if (!member) throw new TeamError('Member unavailable.', 404);
    if (token(object(member.preferences).operations) !== data.version) throw new TeamError('Capacity settings changed. Refresh first.', 409);
    const config = { weeklyHours: data.weeklyHours, skills: data.skills, near: data.near, overloaded: data.overloaded };
    await tx.teamMember.update({ where: { id: member.id }, data: { preferences: { ...object(member.preferences), operations: config } as Prisma.InputJsonValue } });
    await audit(tx, a, 'operations.capacity', member.id, config);
    return { saved: true };
  }
  if (resource === 'operations-estimate') {
    const data = z.object({ id, version: z.number().int().positive(), remainingHours: z.number().min(0).max(10000).nullable() }).parse(input);
    const task = await tx.teamTask.findFirst({ where: { id: data.id, workspaceId: a.workspaceId, archivedAt: null } });
    if (!task) throw new TeamError('Task unavailable.', 404);
    if (task.version !== data.version) throw new TeamError('Task changed. Refresh first.', 409);
    if (closed.includes(task.status) || activityOpen(task.followUpContext)) throw new TeamError('Only released, open tasks can be estimated.', 409);
    await tx.teamTask.update({ where: { id: task.id }, data: { followUpContext: { ...object(task.followUpContext), operations: { ...object(object(task.followUpContext).operations), remainingHours: data.remainingHours } } as Prisma.InputJsonValue, version: { increment: 1 } } });
    await audit(tx, a, 'operations.estimate', task.id, { previous: remainingHours(task.followUpContext), remainingHours: data.remainingHours });
    return { saved: true };
  }
  if (resource === 'operations-delegate') {
    const data = z.object({ changes: z.array(z.object({ id, version: z.number().int().positive(), ownerId: id })).min(1).max(50), note: z.string().trim().max(2000).default('') }).parse(input);
    if (new Set(data.changes.map(change => change.id)).size !== data.changes.length) throw new TeamError('Select each task only once.');
    const results: { id: string; version: number; ownerId: string; previousOwnerId: string }[] = [];
    for (const change of data.changes) {
      const task = await tx.teamTask.findFirst({ where: { id: change.id, workspaceId: a.workspaceId, archivedAt: null } });
      if (!task) throw new TeamError('A selected task is unavailable.', 404);
      if (task.version !== change.version) throw new TeamError('A selected task changed. Refresh and review the plan.', 409);
      if (task.ownerId === change.ownerId) { results.push({ id: task.id, version: task.version, ownerId: task.ownerId, previousOwnerId: task.ownerId }); continue; }
      if (closed.includes(task.status)) throw new TeamError('Closed work cannot be reassigned. Reopen it through its existing workflow.', 409);
      // Appointments and calls use the established rescheduling/handoff workflow,
      // which preserves attendance, capacity, consent and financial attribution.
      if (isCallWork(task) || await tx.teamCalendarEvent.count({ where: { workspaceId: a.workspaceId, followUpTaskId: task.id, status: 'SCHEDULED' } }) || await tx.consultationRequest.count({ where: { taskId: task.id } })) throw new TeamError('Scheduled work and calls must be transferred in Calls or Calendar.', 409);
      const member = await tx.teamMember.findFirst({ where: { id: change.ownerId, workspaceId: a.workspaceId, status: 'ACTIVE', availability: 'AVAILABLE', user: { status: 'ACTIVE' }, role: { owner: false } }, include: { role: true } });
      if (!member || !can(member, 'tasks.update')) throw new TeamError('Choose an available employee authorised to work on tasks.', 403);
      const permission = task.recordType ? operationalPermission[task.recordType] : undefined;
      if (permission && !can(member, permission)) throw new TeamError('The destination member cannot access this service.', 403);
      const updated = await teamMutationTx(tx, a, 'task-update', { id: task.id, version: task.version, ownerId: member.id }) as { id: string; version: number };
      if (data.note) await tx.teamComment.create({ data: { taskId: task.id, authorId: a.id, body: `Handoff: ${data.note}` } });
      await audit(tx, a, 'operations.delegated', task.id, { previousOwnerId: task.ownerId, ownerId: member.id, note: data.note });
      await notify(tx, task.ownerId, `Transferred: ${task.title}`, `/team?module=${workTaskModule(task)}&task=${task.id}`);
      results.push({ id: updated.id, version: updated.version, ownerId: member.id, previousOwnerId: task.ownerId });
    }
    return { items: results };
  }
  throw new TeamError('Unknown operations action.', 404);
}
