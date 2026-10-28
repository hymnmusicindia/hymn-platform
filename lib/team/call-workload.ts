import type { Prisma } from '@prisma/client';
export async function callWorkload(tx: Prisma.TransactionClient, workspaceId: string, memberIds: string[]) {
  const tasks = await tx.teamTask.groupBy({ by: ['ownerId'], where: { workspaceId, ownerId: { in: memberIds }, archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] }, OR: [{ eventKey: { startsWith: 'support-call:' } }, { eventKey: { endsWith: ':call' } }] }, _count: true });
  const events = await tx.teamCalendarEvent.groupBy({ by: ['assigneeId'], where: { workspaceId, assigneeId: { in: memberIds }, followUpTaskId: null, kind: { in: ['CALL', 'FOLLOW_UP'] }, status: 'SCHEDULED', startsAt: { gte: new Date() } }, _count: true });
  return new Map(memberIds.map(id => [id, (tasks.find(row => row.ownerId === id)?._count || 0) + (events.find(row => row.assigneeId === id)?._count || 0)]));
}
