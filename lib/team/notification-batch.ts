import type { Prisma } from '@prisma/client';
import type { Actor } from './policy';

export type TeamReminder = { eventKey: string; memberId: string; title: string; href?: string; taskId?: string };
/** Caller holds the workspace lock. Deduplication and notices commit together. */
export async function notifyTeamBatch(tx: Prisma.TransactionClient, a: Actor, reminders: TeamReminder[]) {
  const unique = [...new Map(reminders.map(item => [item.eventKey, item])).values()];
  if (!unique.length) return 0;
  const previous = await tx.teamWorkflowEvent.findMany({ where: { workspaceId: a.workspaceId, eventKey: { in: unique.map(item => item.eventKey) } }, select: { eventKey: true } });
  const handled = new Set(previous.map(item => item.eventKey));
  const pending = unique.filter(item => !handled.has(item.eventKey));
  if (!pending.length) return 0;
  const members = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, id: { in: pending.map(item => item.memberId) }, status: 'ACTIVE', user: { status: 'ACTIVE' } }, select: { id: true, preferences: true } });
  const enabled = new Set(members.filter(member => (member.preferences as { notifications?: boolean } | null)?.notifications !== false).map(member => member.id));
  await tx.teamWorkflowEvent.createMany({ data: pending.map(item => ({ workspaceId: a.workspaceId, eventKey: item.eventKey, taskId: item.taskId })) });
  const notices = pending.filter(item => enabled.has(item.memberId));
  if (notices.length) await tx.teamNotification.createMany({ data: notices.map(item => ({ memberId: item.memberId, title: item.title, href: item.href || '/team?module=work' })) });
  return notices.length;
}
