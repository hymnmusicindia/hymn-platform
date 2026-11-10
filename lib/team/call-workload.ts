import type { Prisma } from '@prisma/client';
import {callTaskWhere} from './daily-call-policy';
export async function callWorkload(tx: Prisma.TransactionClient, workspaceId: string, memberIds: string[]) {
  const [tasks, events, consultations] = await Promise.all([
    tx.teamTask.groupBy({ by: ['ownerId'], where: { workspaceId, ownerId: { in: memberIds }, archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] }, ...callTaskWhere }, _count: true }),
    tx.teamCalendarEvent.groupBy({ by: ['assigneeId'], where: { workspaceId, assigneeId: { in: memberIds }, followUpTaskId: null, kind: { in: ['CALL', 'FOLLOW_UP'] }, status: 'SCHEDULED', startsAt: { gte: new Date() } }, _count: true }),
    tx.consultationRequest.groupBy({ by: ['assignedMemberId'], where: { workspaceId, assignedMemberId: { in: memberIds }, taskId: null, calendarEventId: null, status: { notIn: ['CONVERTED', 'NOT_INTERESTED', 'LOST', 'CONSULTATION_COMPLETED'] } }, _count: true })
  ]);
  return new Map(memberIds.map(id => [id, (tasks.find(row => row.ownerId === id)?._count || 0) + (events.find(row => row.assigneeId === id)?._count || 0) + (consultations.find(row => row.assignedMemberId === id)?._count || 0)]));
}
