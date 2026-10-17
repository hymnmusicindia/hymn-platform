import "server-only";
import { prisma } from "@/lib/prisma";
import { getDetailedReleaseById, updateDetailedReleaseStatus } from "@/lib/distribution-db";
import { validateReleaseForDireNote } from "@/lib/direnote-readiness";

/** Durable pending marker is written before acknowledgement; cron can recover a stopped request. */
export async function runPendingDistributionQc(releaseId: number, siteUrl: string) {
  let release = await getDetailedReleaseById(releaseId);
  if (release?.paymentStatus === "paid" && release.status === "submitted") {
    await updateDetailedReleaseStatus(releaseId, "under_review", "Paid release received for review.", undefined, { notify: false });
    release = await getDetailedReleaseById(releaseId);
  }
  if (!release || release.paymentStatus !== "paid" || !["under_review", "approved"].includes(release.status)) return false;
  const readiness = await validateReleaseForDireNote(release, { siteUrl });
  const autoQc = { status: readiness.ready ? "passed" : "issues_found", checkedAt: new Date().toISOString(), issueCount: readiness.issues.length, warningCount: readiness.warnings.length };
  // Patch only this metadata key, and never write a result over a concurrently edited release.
  const updated = await prisma.$transaction(async tx => {
    const current = await tx.release.findUnique({ where: { id: releaseId }, select: { metadata: true, updatedAt: true, version: true } });
    if (!current || current.updatedAt.getTime() !== Date.parse(release.draftVersion || "")) return 0;
    const metadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata) ? current.metadata : {};
    const result = await tx.release.updateMany({ where: { id: releaseId, updatedAt: current.updatedAt, version: current.version, status: { in: ["UNDER_REVIEW", "APPROVED"] } }, data: { metadata: { ...metadata, autoQc } as never } });
    return result.count;
  });
  if (!updated || !readiness.ready) console.warn("Automatic QC remains paused", { releaseId, recorded: Boolean(updated), issueFields: readiness.issues.map(issue => issue.field) });
  return Boolean(updated && readiness.ready);
}
