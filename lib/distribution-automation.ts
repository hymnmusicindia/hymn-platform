import 'server-only';
import { prisma } from './prisma';
import { runPendingDistributionQc } from './distribution-auto-qc';
import { submitRelease } from './distribution-service';
import { getDetailedReleaseById, updateDetailedReleaseStatus } from './distribution-db';
import { getPublicAppUrl } from './public-app-url';
import { processPendingAutomaticAmendments } from './release-amendment-automation';
import { DISTRIBUTION_QC_POLICY_VERSION, earliestPartnerReleaseDate } from './distribution-automation-policy';
import { hasCurrentManualQcEvidence } from './distribution-qc-evidence';
import { preparationRetry } from './distribution-preparation-retry';

export async function distributionAutomationCandidates(limit = 2) {
  return prisma.$queryRaw<Array<{ id: number }>>`
    SELECT r.id FROM releases r JOIN users u ON u.id=r.user_id
    WHERE r.archived_at IS NULL AND u.status='ACTIVE' AND r.payment_status='paid'
      AND r.status IN ('SUBMITTED','UNDER_REVIEW','IN_QC_QUEUE','IN_QUEUE','RESUBMITTED','APPROVED','QUEUED_FOR_DISTRIBUTION','CHANGES_REQUESTED')
      AND ((r.status IN ('APPROVED','QUEUED_FOR_DISTRIBUTION') AND r.metadata->'manualQc'->>'status'='passed' AND r.metadata->'manualQc'->>'packageRevision' IS NOT NULL)
        OR COALESCE(r.metadata->'autoQc'->>'status','pending') IN ('pending','passed')
        OR (r.metadata->'correctionReview'->>'status'='pending' AND r.status IN ('UNDER_REVIEW','RESUBMITTED','APPROVED') AND r.metadata->>'liveAt' IS NULL AND r.release_date<${new Date(earliestPartnerReleaseDate())})
        OR (r.metadata->'autoQc'->>'status'='manual_review_required' AND r.metadata->'autoQc'->>'changeKind' IN ('missing_baseline','rights_review')
          AND COALESCE(r.metadata->'autoQc'->>'policyVersion','')<>${String(DISTRIBUTION_QC_POLICY_VERSION)})
        OR (r.metadata->'autoQc'->>'status'='manual_review_required'
          AND r.metadata->'autoQc'->>'reason'='A queued package has no confirmed safe retry.')
        OR (r.metadata->'autoQc'->>'status'='retryable' AND COALESCE(r.metadata->'autoQc'->>'nextCheckAt','')<=${new Date().toISOString()})
        OR CASE WHEN COALESCE(r.metadata->'autoQc'->>'checkedVersion','') ~ '^[0-9]{1,9}$' THEN (r.metadata->'autoQc'->>'checkedVersion')::integer ELSE -1 END <> r.version)
      AND (COALESCE(r.metadata->'deliveryPreparation'->>'state','')<>'needs_review'
        OR (r.metadata->'deliveryPreparation'->>'reason' LIKE 'DireNote hourly request capacity is exhausted.%'
          AND r.metadata->'manualQc'->>'status'='passed'))
      AND COALESCE(r.metadata->'deliveryPreparation'->>'nextAttemptAt','')<=${new Date().toISOString()}
      AND (r.status<>'QUEUED_FOR_DISTRIBUTION'
        OR (r.metadata->'manualQc'->>'status'='passed' AND NOT EXISTS (SELECT 1 FROM distribution_submission_attempts a WHERE a.release_id=r.id AND a.provider='direnote'))
        OR (r.metadata->'manualQc'->>'status'='passed' AND EXISTS (SELECT 1 FROM distribution_submission_attempts a WHERE a.release_id=r.id AND a.provider='direnote' AND a.is_current=true AND a.state='submitted' AND a.corrections->>'status'='customer_resolved'))
        OR EXISTS (
        SELECT 1 FROM distribution_submission_attempts a WHERE a.release_id=r.id
          AND a.provider='direnote' AND a.state='retryable'
          AND a.id=(SELECT MAX(latest.id) FROM distribution_submission_attempts latest WHERE latest.release_id=r.id AND latest.provider='direnote')
          AND a.attempt_count<5
          AND a.started_at<NOW()-INTERVAL '6 minutes'*POWER(2,LEAST(5,GREATEST(0,a.attempt_count-1)))))
      AND NOT EXISTS (SELECT 1 FROM distribution_submission_attempts a
        WHERE a.release_id=r.id AND a.is_current=true AND a.provider='direnote'
          AND (a.state IN ('processing','reconciliation_required','failed')
            OR a.state='submitted' AND COALESCE(a.corrections->>'status','')<>'customer_resolved'))
    ORDER BY r.updated_at ASC,r.id ASC LIMIT ${Math.max(1, Math.min(100, Math.trunc(limit)))}`;
}

export async function processDistributionAutomation(siteUrl = getPublicAppUrl(), onlyReleaseId?:number) {
  if (process.env.DISTRIBUTION_AUTOMATION_ENABLED === 'false') {
    return { skipped: 'disabled', checked: 0, submitted: 0 };
  }
  // Checked versions skip unchanged exceptions. Confirmed retries respect the
  // largest jittered cooldown, leaving the existing claim guard authoritative.
  const candidates = onlyReleaseId ? [{id:onlyReleaseId}] : await distributionAutomationCandidates();
  let checked = 0, submitted = 0;
  const outcomes: { releaseId: number; status: string }[] = [];
  const deadline = Date.now() + 25000;
  for (const candidate of candidates) {
    if (Date.now() > deadline) break;
    checked++;
    let reviewedRevision: string | undefined;
    try {
      let manuallyReviewed = await getDetailedReleaseById(candidate.id);
      if (manuallyReviewed && ['approved','queued_for_distribution'].includes(manuallyReviewed.status) && hasCurrentManualQcEvidence(manuallyReviewed)) {
        if(manuallyReviewed.status==='approved')manuallyReviewed=await updateDetailedReleaseStatus(candidate.id,'queued_for_distribution','Saved HYMN approval recovered for automatic delivery.',undefined,{notify:false});
        if(!manuallyReviewed)throw Error('Approved release became unavailable.');
        reviewedRevision=String((manuallyReviewed.metadata?.manualQc as Record<string,unknown>).packageRevision);
        const result = await submitRelease(candidate.id, { siteUrl, retry: true, manualQcRevision: String((manuallyReviewed.metadata?.manualQc as Record<string, unknown>).packageRevision) });
        if (result.submitted) submitted++;
        outcomes.push({ releaseId: candidate.id, status: result.submitted ? 'submitted' : result.retryable ? 'retryable' : 'review' });
        continue;
      }
      if (!await runPendingDistributionQc(candidate.id, siteUrl)) {
        outcomes.push({ releaseId: candidate.id, status: 'paused' });
        continue;
      }
      const release = await getDetailedReleaseById(candidate.id);
      const revision = (release?.metadata?.autoQc as { revision?: string } | undefined)?.revision;
      if (!revision) continue;
      const result = await submitRelease(candidate.id, {
        siteUrl, automaticQcRevision: revision,
        retry: release?.status === 'queued_for_distribution',
      });
      if (result.submitted) submitted++;
      outcomes.push({ releaseId: candidate.id, status: result.submitted ? 'submitted' : result.retryable ? 'retryable' : 'review' });
    } catch (error) {
      if(reviewedRevision)await recordDeliveryPreparationFailure(candidate.id,reviewedRevision,error);
      // Never replay an uncertain write. The durable attempt remains authoritative.
      await prisma.auditLog.create({ data: {
        actorType: 'system', action: 'DISTRIBUTION_AUTOMATION_DEFERRED',
        entity: 'release', entityId: String(candidate.id),
        metadata: { reason: 'Inspect the latest QC evidence and current delivery attempt before retrying.' },
      } });
      outcomes.push({ releaseId: candidate.id, status: 'review' });
    }
  }
  const amendments = onlyReleaseId ? {skipped:'scoped_release_recovery'} : await processPendingAutomaticAmendments();
  return { checked, submitted, amendments, outcomes };
}

/** Preparation failures happen before ingest. Back off transient errors; keep identity conflicts visible for review. */
async function recordDeliveryPreparationFailure(releaseId:number,revision:string,error:unknown){
  await prisma.$transaction(async tx=>{
    const row=await tx.release.findUnique({where:{id:releaseId}});
    if(!row||row.status!=='QUEUED_FOR_DISTRIBUTION'||row.archivedAt)return;
    const metadata=row.metadata as Record<string,any>??{};
    if(metadata.manualQc?.packageRevision!==revision)return;
    const retry=preparationRetry(error,Number(metadata.deliveryPreparation?.failures||0));
    await tx.release.updateMany({where:{id:releaseId,version:row.version,updatedAt:row.updatedAt},data:{metadata:JSON.parse(JSON.stringify({...metadata,deliveryPreparation:{...metadata.deliveryPreparation,...retry,state:retry.nextAttemptAt?'retryable':'needs_review',updatedAt:new Date().toISOString()}}))}});
  },{timeout:15000,maxWait:5000});
}
