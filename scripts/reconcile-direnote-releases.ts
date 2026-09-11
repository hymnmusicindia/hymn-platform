/**
 * Non-destructive production reconciliation report. Pass --apply only after
 * reviewing the report; it repairs duplicate current-attempt flags, never
 * deletes releases or provider history.
 */
import { prisma } from "../lib/prisma";

const apply = process.argv.includes("--apply");

async function main() {
  const [releases, attempts, duplicateCurrent] = await Promise.all([
    prisma.release.findMany({ select: { id: true, status: true, archivedAt: true, direNoteStatus: true, upc: true } }),
    prisma.distributionSubmissionAttempt.findMany({ where: { provider: "direnote" }, select: { id: true, releaseId: true, state: true, isCurrent: true, providerStatus: true, upc: true, startedAt: true } }),
    prisma.$queryRaw<Array<{ releaseId: number; count: bigint }>>`SELECT "release_id" AS "releaseId", count(*) FROM "distribution_submission_attempts" WHERE "provider" = 'direnote' AND "is_current" = true GROUP BY "release_id" HAVING count(*) > 1`
  ]);
  const releaseById = new Map(releases.map(release => [release.id, release]));
  const rejectedUnderReview = attempts.filter(attempt => attempt.isCurrent && /reject|declin|fail|invalid|denied|cancel/i.test(attempt.providerStatus ?? "") && releaseById.get(attempt.releaseId)?.status === "UNDER_REVIEW");
  const archivedWithCurrentAttempt = attempts.filter(attempt => attempt.isCurrent && releaseById.get(attempt.releaseId)?.archivedAt);
  const orphanAttempts = attempts.filter(attempt => !releaseById.has(attempt.releaseId));
  const report = {
    mode: apply ? "APPLY" : "DRY_RUN", releasesScanned: releases.length, providerAttemptsScanned: attempts.length,
    duplicateCurrentAttempts: duplicateCurrent.map(row => ({ releaseId: Number(row.releaseId), count: Number(row.count) })),
    rejectedStillUnderReview: rejectedUnderReview.map(row => ({ releaseId: row.releaseId, attemptId: row.id, providerStatus: row.providerStatus })),
    archivedWithCurrentAttempt: archivedWithCurrentAttempt.map(row => ({ releaseId: row.releaseId, attemptId: row.id })),
    orphanAttempts: orphanAttempts.map(row => ({ releaseId: row.releaseId, attemptId: row.id }))
  };
  if (!apply) return console.log(JSON.stringify(report, null, 2));
  for (const duplicate of report.duplicateCurrentAttempts) {
    const rows = attempts.filter(attempt => attempt.releaseId === duplicate.releaseId && attempt.isCurrent).sort((a, b) => b.id - a.id);
    await prisma.distributionSubmissionAttempt.updateMany({ where: { id: { in: rows.slice(1).map(row => row.id) } }, data: { isCurrent: false, providerStatus: "superseded" } });
  }
  console.log(JSON.stringify({ ...report, repairedDuplicateCurrentAttempts: report.duplicateCurrentAttempts.length }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
