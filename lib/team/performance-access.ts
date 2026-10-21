import 'server-only';
import { prisma } from '@/lib/prisma';
import { teamActor, teamIdentity } from './access';
import { assertPerformanceAccess } from './performance';
import { TeamError } from './policy';
import type { PerformanceReport } from './performance-model';

export async function savedPerformanceReport(id: number) {
  await teamIdentity();
  if (!Number.isSafeInteger(id) || id < 1) throw new TeamError('Report not found.', 404);
  const row = await prisma.emailLog.findFirst({ where: { id, template: 'team_performance_report', entityType: 'team_member' } });
  const payload = row?.payload as { report?: PerformanceReport } | null;
  const report = payload?.report;
  if (!row || report?.version !== 1 || report.memberId !== row.entityId || report.userId !== row.userId) throw new TeamError('Report not found.', 404);
  const actor = await teamActor(report.workspaceId);
  assertPerformanceAccess(actor, { id: report.memberId, workspaceId: report.workspaceId });
  return { report, id: row.id };
}
