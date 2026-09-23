import { prisma } from "@/lib/prisma";

/** A transport failure cannot establish whether a non-idempotent ingest ran.
 * A partner-confirmed non-receipt is required before permitting another send. */
export async function confirmDistributionNonReceipt(input: { releaseId: number; attemptId: number; adminId: number; evidence: string; providerReference: string }) {
  if (input.evidence.trim().length < 30 || input.providerReference.trim().length < 5) throw new Error("Record the partner's non-receipt confirmation and support reference before allowing a retry.");
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422028, ${input.releaseId}::integer) AS locked`;
    if (!rows[0]?.locked) throw new Error("This release is still being processed. Retry reconciliation later.");
    const attempt = await tx.distributionSubmissionAttempt.findFirst({ where: { id: input.attemptId, releaseId: input.releaseId, provider: "direnote" } });
    if (!attempt || !["processing", "reconciliation_required"].includes(attempt.state) || attempt.startedAt > new Date(Date.now() - 5 * 60_000)) throw new Error("This attempt is not eligible for manual recovery yet.");
    if (attempt.isCurrent || attempt.providerReference || await tx.distributionSubmissionAttempt.count({ where: { releaseId: input.releaseId, state: "submitted" } })) throw new Error("Provider acceptance exists. Synchronize the accepted release instead of sending again.");
    const updated = await tx.distributionSubmissionAttempt.update({ where: { id: attempt.id }, data: { state: "retryable", safeError: "Partner confirmed this attempt was not received; an administrator authorized retry.", completedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: input.adminId, actorType: "admin", action: "DISTRIBUTION_NON_RECEIPT_CONFIRMED", entity: "release", entityId: String(input.releaseId), metadata: { attemptId: attempt.id, previousState: attempt.state, providerReference: input.providerReference.trim(), evidence: input.evidence.trim() } } });
    return updated;
  });
}
