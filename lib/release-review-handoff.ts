import 'server-only';
import type { Prisma } from '@prisma/client';
import { transitionReleaseStatus } from './release-status-engine';
import type { ReleaseStatus } from './types';
import { getPublicAppUrl } from './public-app-url';
import { prisma } from './prisma';

/** Called in the same transaction as the paid metadata/track save. */
export async function finalizeReleaseReviewHandoff(tx: Prisma.TransactionClient, input: { releaseId: number; userId: number; submissionKey?: string }) {
  const release = await tx.release.findUniqueOrThrow({ where: { id: input.releaseId }, include: { user: true } });
  if (release.userId !== input.userId || release.paymentStatus !== 'paid') throw Error('An owned paid release is required for review.');
  const previous = release.status.toLowerCase() as ReleaseStatus;
  const eventKey = input.submissionKey ? `release:${release.id}:correction-review:${input.submissionKey}` : null;
  const previousMetadata = release.metadata as Record<string, unknown> | null;
  const priorMarker = previousMetadata?.correctionReview as {submissionKey?: string} | undefined;
  const previousQueue = await tx.distributionQueueEntry.findUnique({where:{releaseId:release.id}});
  if (previous === 'under_review' && priorMarker?.submissionKey === input.submissionKey && eventKey && previousQueue?.currentStage === 'quality_check' && await tx.adminTask.findUnique({where:{eventKey}})) return;
  const path: ReleaseStatus[] = ['changes_requested', 'rejected'].includes(previous) ? ['resubmitted', 'under_review'] : ['draft', 'awaiting_payment'].includes(previous) ? ['submitted', 'under_review'] : previous === 'under_review' ? [] : ['under_review'];
  let current = previous;
  for (const next of path) {
    transitionReleaseStatus({ currentStatus: current, nextStatus: next, reason: 'Paid release received for review.' });
    await tx.releaseStatusTransition.create({ data: { releaseId: release.id, previousStatus: current.toUpperCase() as typeof release.status, newStatus: next.toUpperCase() as typeof release.status, actorType: 'user', actorId: input.userId, reason: 'Paid release received for review.' } });
    current = next;
  }
  const metadata = previousMetadata;
  const key = input.submissionKey;
  const marker = key ? { submissionKey: key, status: 'pending', receivedAt: new Date().toISOString() } : null;
  await tx.release.update({ where: { id: release.id }, data: { status: 'UNDER_REVIEW', version: { increment: path.length ? 1 : 0 }, ...(marker ? { metadata: JSON.parse(JSON.stringify({ ...metadata, correctionReview: marker, autoQc: { status: 'manual_review_required', checkedAt: null, previousResult: metadata?.autoQc ?? null } })) } : {}) } });
  const existing = await tx.distributionQueueEntry.findUnique({ where: { releaseId: release.id } });
  const timestamps = existing?.timestamps as Record<string, unknown> | null;
  const queue = await tx.distributionQueueEntry.upsert({ where: { releaseId: release.id }, create: { releaseId: release.id, currentStage: 'quality_check', timestamps: { quality_check: new Date().toISOString() }, stageHistory: [] }, update: { currentStage: 'quality_check', timestamps: JSON.parse(JSON.stringify({ ...timestamps, quality_check: new Date().toISOString() })) } });
  if (eventKey && await tx.adminTask.findUnique({ where: { eventKey } })) return;
  await tx.distributionQueueLog.create({ data: { queueEntryId: queue.id, stage: 'quality_check', stageStartTime: new Date(), notes: key ? 'Customer corrections and attachments received for HYMN review.' : 'Paid release received for HYMN review.', metadata: { submissionKey: key ?? null } } });
  if (!eventKey) return;
  await tx.adminTask.create({ data: { eventKey, type: 'Correction review', priority: 'high', title: `Corrections ready for review: ${release.title}`, body: 'Review the updated music, metadata and rights evidence before approving delivery. The previous provider correction is historical until this version is approved and sent.', href: `/admin?tab=distribution-queue&releaseId=${release.id}`, entityType: 'release', entityId: String(release.id) } });
  await tx.auditLog.create({ data: { actorType: 'system', action: 'RELEASE_REVIEW_HANDOFF_READY', entity: 'release', entityId: String(release.id), metadata: { submissionKey: key!, queueEntryId: queue.id } } });
  await tx.notification.upsert({ where: { eventKey: `${eventKey}:notification` }, create: { eventKey: `${eventKey}:notification`, userId: input.userId, title: 'Your corrections were received', body: `HYMN received the updated package for “${release.title}”. It is waiting for review before delivery.`, type: 'release', href: `/dashboard/releases/${release.id}`, actionLabel: 'Track review', metadata: { releaseId: release.id, status: 'under_review', submissionKey: key! } }, update: {} });
  const { enqueueReleaseEmail } = await import('./email/release-outbox');
  await enqueueReleaseEmail(tx, 'release_under_review', { to: release.user.email, userId: release.userId, userName: release.user.name, releaseId: release.id, releaseTitle: release.title, artistName: release.artistName, releaseStatus: 'under_review', statusEventKey: `correction:${key}`, manageReleaseUrl: `${getPublicAppUrl()}/dashboard/releases/${release.id}` });
}

/** Recover legacy saved receipts that were never handed to the admin queue. */
export async function repairPendingReviewHandoffs() {
  const candidates = await prisma.$queryRaw<Array<{id:number; user_id:number; submission_key:string}>>`
    SELECT r.id, r.user_id, r.metadata->>'correctionSubmissionKey' AS submission_key
    FROM releases r
    LEFT JOIN admin_tasks t ON t.event_key = 'release:' || r.id || ':correction-review:' || (r.metadata->>'correctionSubmissionKey')
    LEFT JOIN distribution_queue_entries q ON q.release_id = r.id
    WHERE r.archived_at IS NULL AND r.payment_status = 'paid' AND r.status IN ('UNDER_REVIEW','RESUBMITTED')
      AND COALESCE(r.metadata->>'correctionSubmissionKey','') <> ''
      AND (t.id IS NULL OR q.id IS NULL OR q.current_stage <> 'quality_check')
    ORDER BY r.updated_at ASC LIMIT 3`;
  let repaired = 0;
  for (const candidate of candidates) await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(81422028, ${candidate.id}::integer) AS locked`;
    if (!locked[0]?.locked) return;
    const current = await tx.release.findUnique({where:{id:candidate.id}});
    if (!current || !['UNDER_REVIEW','RESUBMITTED'].includes(current.status) || (current.metadata as Record<string,unknown>|null)?.correctionSubmissionKey !== candidate.submission_key) return;
    await finalizeReleaseReviewHandoff(tx,{releaseId:candidate.id,userId:candidate.user_id,submissionKey:candidate.submission_key});
    repaired++;
  },{timeout:30000,maxWait:10000});
  return repaired;
}
