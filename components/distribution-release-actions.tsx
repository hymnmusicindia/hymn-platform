"use client";
import styles from './distribution-operations.module.css';


import type { AdminPermissionKey } from '@/lib/access';
import type { Release } from '@/lib/types';
import { releaseReviewActions } from '@/lib/distribution-workspace';

export type ReleaseDeliveryReadiness = {
  releaseId: number;
  ready: boolean;
  issues: { field: string; message: string; fixSuggestion?: string }[];
  warnings: { field: string; message: string }[];
  checklist?: { label: string; ready: boolean }[];
};

export function DistributionReleaseActions({ release, readiness, readinessError, onRefreshReadiness, busy, cooldownSeconds, hasPermission, onStatus, onReview, onSync, onArchive }: {
  release: Release;
  readiness: ReleaseDeliveryReadiness | null;
  readinessError: string;
  onRefreshReadiness: () => void;
  busy: boolean;
  cooldownSeconds: number;
  hasPermission: (permission: AdminPermissionKey) => boolean;
  onStatus: (status: Release['status'], confirm?: boolean) => void;
  onReview: (action: 'changes_requested' | 'rejected') => void;
  onSync: () => void;
  onArchive: () => void;
}) {
  const actions = releaseReviewActions(release);
  const current = readiness?.releaseId === release.id ? readiness : null;
  const canReview = hasPermission('releases.review');
  const reason = cooldownSeconds > 0 ? `Delivery cooldown: ${Math.ceil(cooldownSeconds)} seconds remaining.`
    : readinessError || (current ? current.ready ? '' : 'Resolve the delivery blockers below before sending.' : 'Checking delivery readiness.');
  const canSync = Boolean(release.upcCode || release.direNoteStatus || release.tracks?.some(track => track.isrc));
  return <section aria-label="Release review actions" className={styles.actionBar}>
    <div className={styles.actionHeading}><h3>QC &amp; delivery actions</h3><span>Approval → delivery → partner confirmation</span></div>
    {(actions.approve || actions.retry || actions.startReview) && <div className={styles.actionChecks} aria-live="polite">
      <p>{readinessError || (current ? current.ready ? 'Delivery readiness passed. Manual approval and partner acceptance remain separate steps.' : 'Delivery is blocked. Review the checks below.' : 'Checking delivery readiness…')}</p>
      <button type="button" className="btn-outline justify-self-start" disabled={busy} onClick={onRefreshReadiness}>Recheck readiness</button>
      {current && <details open={!current.ready}><summary className="cursor-pointer">Delivery checks{current.issues.length ? ` (${current.issues.length} blockers)` : ''}</summary>
        <ul className="mt-2 grid gap-2">{current.checklist?.map(item => <li key={item.label}>{item.ready ? 'Ready' : 'Needs fix'}: {item.label}</li>)}</ul>
        {current.issues.map((issue, index) => <p key={`${issue.field}-${index}`} className="mt-2" style={{ color: 'var(--danger)' }}>{issue.field}: {issue.message}{issue.fixSuggestion ? ` ${issue.fixSuggestion}` : ''}</p>)}
        {current.warnings.map((issue, index) => <p key={`warning-${index}`} className="mt-2">Warning: {issue.message}</p>)}
      </details>}
    </div>}
    <div className={styles.actionButtons}>
      {actions.startReview && <button type="button" disabled={busy || !canReview} onClick={() => onStatus('under_review')} className="btn-outline">Start Review</button>}
      {actions.approve && <button type="button" disabled={busy || !!reason || !canReview || !hasPermission('distribution.submit')} title={reason || (!canReview || !hasPermission('distribution.submit') ? 'Requires release review and distribution submit permissions.' : undefined)} onClick={() => onStatus('approved', true)} className="btn-primary">{release.status === 'approved' ? 'Queue partner delivery' : 'Approve & queue delivery'}</button>}
      {actions.retry && <button type="button" disabled={busy || !!reason || !canReview || !hasPermission('distribution.retry')} title={reason || (!canReview || !hasPermission('distribution.retry') ? 'Requires release review and distribution retry permissions.' : undefined)} onClick={() => onStatus('sent', true)} className="btn-primary">Retry Send</button>}
      {actions.returnToQc && <button type="button" disabled={busy || !canReview} onClick={() => onStatus('in_qc_queue', true)} className="btn-outline">Return to QC</button>}
      {actions.requestChanges && <button type="button" disabled={busy || !canReview} onClick={() => onReview('changes_requested')} className="btn-outline">Request changes</button>}
      {actions.reject && <button type="button" disabled={busy || !canReview} onClick={() => onReview('rejected')} className="btn-outline">Reject</button>}
      <button type="button" disabled={busy || !hasPermission('releases.read') || !canSync} onClick={onSync} className="btn-outline">Refresh partner status</button>
      {actions.markLive && <button type="button" disabled={busy || !canReview || !hasPermission('distribution.confirm_status')} onClick={() => onStatus('live', true)} className="btn-primary">Mark Live</button>}
      <button type="button" disabled={busy || !hasPermission('releases.override')} onClick={onArchive} className="btn-outline">Archive</button>
    </div>
    {release.status==='queued_for_distribution' && <div className={styles.preparationNotice} role="status"><strong>Approval saved · awaiting partner handoff</strong><p>{String((release.metadata?.deliveryPreparation as {reason?:string}|undefined)?.reason || 'Artist verification and delivery continue automatically. Do not create another release while this package is queued.')}</p></div>}
    {cooldownSeconds > 0 && (actions.approve || actions.retry) && <p role="status" className="text-sm">Try again in {Math.ceil(cooldownSeconds)} seconds.</p>}
    {actions.awaitingCustomer && <p className="text-sm">Awaiting user correction. Approval becomes available after the updated package returns to HYMN review.</p>}
  </section>;
}
