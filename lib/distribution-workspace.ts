import type { Release } from './types';
import { effectiveReleaseStatus } from './release-status-presentation';

export type ReleaseBucket = 'drafts' | 'review' | 'corrections' | 'delivery' | 'live' | 'exceptions';
export function releaseBucket(release: Release): ReleaseBucket {
  const status = effectiveReleaseStatus(release.status, release.direNoteStatus);
  if (['draft', 'awaiting_payment'].includes(status)) return 'drafts';
  if (['changes_requested', 'distributor_changes_required'].includes(status)) return 'corrections';
  if (['live', 'partially_live'].includes(status)) return 'live';
  if (['failed', 'delivery_failed', 'rejected', 'taken_down', 'takedown_requested', 'takedown_processing', 'archived'].includes(status)) return 'exceptions';
  if (['delivered', 'approved', 'queued_for_distribution', 'submitting_to_distributor', 'sent', 'sent_to_distributor', 'processing', 'distributor_processing', 'scheduled', 'awaiting_live_confirmation'].includes(status)) return 'delivery';
  return 'review';
}
export function newestReleaseFirst(a: Release, b: Release) {
  return (Date.parse(b.submittedAt || b.createdAt) || 0) - (Date.parse(a.submittedAt || a.createdAt) || 0) || b.id - a.id;
}
export function automationSummary(release: Release) {
  const qc = release.metadata?.autoQc as { status?: string; reason?: string; issueCount?: number } | undefined;
  const bucket = releaseBucket(release);
  const reason=typeof qc?.reason==='string'?qc.reason:undefined;
  if (bucket === 'drafts') return { label: 'Not submitted', tone: 'muted', detail: 'The artist controls this draft.' };
  if (bucket === 'corrections') return {label:'Corrections needed',tone:'warning',detail:reason||'Open the current correction request before this release can continue.'};
  if (qc?.status === 'passed') return { label: 'Checks passed', tone: 'success', detail: reason || 'Technical checks passed. Delivery safeguards remain active.' };
  if (qc?.status === 'manual_review_required') return { label: 'Review needed', tone: 'warning', detail: reason || 'A sensitive or uncertain issue needs a reviewer.' };
  if (qc?.status === 'issues_found') return { label: `${qc.issueCount || 1} QC issue${qc.issueCount === 1 ? '' : 's'}`, tone: 'warning', detail: reason || 'Open the release to inspect the checks.' };
  if (qc?.status === 'retryable') return { label: 'Check will retry', tone: 'warning', detail: reason || 'A temporary dependency could not be verified.' };
  if (qc?.status === 'checking') return { label: 'Checking', tone: 'muted', detail: 'The submitted revision is being checked.' };
  return { label: bucket === 'live' ? 'Monitoring' : 'Awaiting checks', tone: 'muted', detail: reason || 'The next automatic cycle will assess eligible submissions.' };
}
