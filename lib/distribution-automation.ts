import 'server-only';
import { prisma } from './prisma';
import { runPendingDistributionQc } from './distribution-auto-qc';
import { submitRelease } from './distribution-service';
import { getDetailedReleaseById } from './distribution-db';
import { getPublicAppUrl } from './public-app-url';
import { processPendingAutomaticAmendments } from './release-amendment-automation';

export async function processDistributionAutomation(siteUrl = getPublicAppUrl()) {
  if (process.env.DISTRIBUTION_AUTOMATION_ENABLED === 'false') {
    return { skipped: 'disabled', checked: 0, submitted: 0 };
  }
  // Checked versions skip unchanged exceptions. Confirmed retries respect the
  // largest jittered cooldown, leaving the existing claim guard authoritative.
  const candidates = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT r.id FROM releases r JOIN users u ON u.id=r.user_id
    WHERE r.archived_at IS NULL AND u.status='ACTIVE' AND r.payment_status='paid'
      AND r.status IN ('SUBMITTED','UNDER_REVIEW','IN_QC_QUEUE','IN_QUEUE','RESUBMITTED','APPROVED','QUEUED_FOR_DISTRIBUTION','CHANGES_REQUESTED')
      AND (COALESCE(r.metadata->'autoQc'->>'status','pending') IN ('pending','passed')
        OR (r.metadata->'autoQc'->>'status'='retryable' AND COALESCE(r.metadata->'autoQc'->>'nextCheckAt','')<=${new Date().toISOString()})
        OR CASE WHEN COALESCE(r.metadata->'autoQc'->>'checkedVersion','') ~ '^[0-9]{1,9}$' THEN (r.metadata->'autoQc'->>'checkedVersion')::integer ELSE -1 END <> r.version)
      AND (r.status<>'QUEUED_FOR_DISTRIBUTION' OR EXISTS (
        SELECT 1 FROM distribution_submission_attempts a WHERE a.release_id=r.id
          AND a.provider='direnote' AND a.is_current=true AND a.state='retryable'
          AND a.attempt_count<5
          AND a.started_at<NOW()-INTERVAL '6 minutes'*POWER(2,LEAST(5,GREATEST(0,a.attempt_count-1)))))
      AND NOT EXISTS (SELECT 1 FROM distribution_submission_attempts a
        WHERE a.release_id=r.id AND a.is_current=true AND a.provider='direnote'
          AND (a.state IN ('processing','reconciliation_required','failed')
            OR a.state='submitted' AND COALESCE(a.corrections->>'status','')<>'customer_resolved'))
    ORDER BY r.updated_at ASC,r.id ASC LIMIT 2`;
  let checked = 0, submitted = 0;
  const outcomes: { releaseId: number; status: string }[] = [];
  const deadline = Date.now() + 25000;
  for (const candidate of candidates) {
    if (Date.now() > deadline) break;
    checked++;
    try {
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
    } catch {
      // Never replay an uncertain write. The durable attempt remains authoritative.
      await prisma.auditLog.create({ data: {
        actorType: 'system', action: 'DISTRIBUTION_AUTOMATION_DEFERRED',
        entity: 'release', entityId: String(candidate.id),
        metadata: { reason: 'Inspect the latest QC evidence and current delivery attempt before retrying.' },
      } });
      outcomes.push({ releaseId: candidate.id, status: 'review' });
    }
  }
  const amendments = await processPendingAutomaticAmendments();
  return { checked, submitted, amendments, outcomes };
}
