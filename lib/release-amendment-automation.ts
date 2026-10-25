import 'server-only';
import { prisma } from './prisma';
import { enqueueAmendmentUpdate, amendmentTransactionOptions } from './release-amendment-notifications';
import { createAdminTaskOnce, resolveAdminTask } from './task-queue';

/** A provider/validation failure requires staff review, never blind re-ingestion. */
export async function flagAmendmentManualQc(requestId: number, reason: string) {
  const request = await prisma.$transaction(async tx => {
    const identity = await tx.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${identity.releaseId}::integer)`;
    const current = await tx.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (['cancelled', 'completed', 'rejected'].includes(current.status)) return current;
    const status = ['submitted', 'under_review', 'approved'].includes(current.status) ? 'processing_manually' : current.status;
    const note = `Automatic amendment checks need manual QC. ${reason.slice(0, 1200)}`;
    if (current.adminNote === note) return current;
    const release = await tx.release.findUniqueOrThrow({where:{id:current.releaseId}});
    await tx.release.update({where:{id:release.id},data:{metadata:JSON.parse(JSON.stringify({...release.metadata as Record<string,unknown>,amendmentQc:{status:'manual_required',requestId,checkedAt:new Date().toISOString(),reason:reason.slice(0,1200)}}))}});
    const item = await tx.releaseChangeRequest.update({ where: { id: requestId }, data: { status, adminNote: note } });
    const event = await tx.releaseChangeRequestEvent.create({ data: { requestId, actorType: 'system', previousStatus: current.status, newStatus: status, note } });
    await enqueueAmendmentUpdate(tx, requestId, event.id);
    return item;
  }, amendmentTransactionOptions);
  if (['cancelled', 'completed', 'rejected'].includes(request.status)) return;
  await createAdminTaskOnce({ eventKey: `amendment:${requestId}:manual-qc`, type: 'Amendment QC', priority: 'high', title: `Amendment #${requestId} needs manual QC`, body: reason.slice(0, 1500), href: `/admin/release-change-requests?request=${requestId}`, entityType: 'release', entityId: request.releaseId });
}

export async function recordAmendmentQcPassed(requestId: number, attemptId: number) {
  await prisma.$transaction(async tx => {
    const request = await tx.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
    const attempt = await tx.distributionSubmissionAttempt.findFirst({where:{id:attemptId,releaseId:request.releaseId,isCurrent:true,state:'submitted'}});
    if (!attempt || !['submitted_to_partner','completed'].includes(request.status)) throw Error('QC confirmation requires the current accepted amendment attempt.');
    const release = await tx.release.findUniqueOrThrow({ where: { id: request.releaseId } });
    const metadata = release.metadata as Record<string, unknown> | null;
    await tx.release.update({ where: { id: release.id }, data: { metadata: JSON.parse(JSON.stringify({ ...metadata, amendmentQc: { status: 'passed', requestId, attemptId, checkedAt: new Date().toISOString(), source: 'validated_provider_acceptance' } })) } });
    const prior = await tx.auditLog.findFirst({ where: { action: 'AMENDMENT_AUTO_QC_PASSED', entityId: String(requestId), metadata: { path: ['attemptId'], equals: attemptId } } });
    if (!prior) await tx.auditLog.create({ data: { actorType: 'system', action: 'AMENDMENT_AUTO_QC_PASSED', entity: 'release_change_request', entityId: String(requestId), metadata: { attemptId, releaseId: release.id } } });
  }, amendmentTransactionOptions);
  await resolveAdminTask(`amendment:${requestId}:manual-qc`, 'Validated amendment accepted with confirmed identifiers.');
}

/** Only new opt-in wizard proposals are automatic. Legacy requests need explicit approval. */
export async function processAutomaticAmendment(requestId: number) {
  return prisma.$transaction(async lock => {
    const rows = await lock.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422031, ${requestId}::integer) AS locked`;
    if (!rows[0]?.locked) return;
    await processClaimedAmendment(requestId);
  }, { timeout: 180000, maxWait: 10000 });
}
async function processClaimedAmendment(requestId: number) {
  const legacy = await prisma.releaseChangeRequest.findUnique({ where: { id: requestId } });
  if (legacy && ['submitted', 'approved'].includes(legacy.status)) await flagAmendmentManualQc(requestId, 'Legacy amendment retained for manual correction review. Post-release changes use existing recording identifiers, never new ingestion.');
}

export async function processPendingAutomaticAmendments() {
  const requests = await prisma.releaseChangeRequest.findMany({ where: { requestType: 'metadata_update', status: { in: ['submitted', 'approved'] }, requestedChanges: { path: ['automaticDelivery'], equals: true } }, orderBy: { id: 'asc' }, take: 1, select: { id: true } });
  for (const request of requests) await processAutomaticAmendment(request.id);
  return requests.length;
}
