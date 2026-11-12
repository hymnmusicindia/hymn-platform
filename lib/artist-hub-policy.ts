/** Browser-safe policy: community trust, participation and money remain separate. */
export const HUB_HREF = '/studio?tab=artists';
export function hubNoticeHref(eventKey: string) {
  const view = /case|conflict|transfer/.test(eventKey) ? 'cases' : /split|live|kyc/.test(eventKey) ? 'money' : /participation|decision|reminder/.test(eventKey) ? 'requests' : 'profiles';
  return `${HUB_HREF}&artistView=${view}`;
}
export function interventionFor(attemptState?: string | null, releaseStatus?: string) {
  if (['LIVE', 'PARTIALLY_LIVE', 'SCHEDULED', 'DELIVERED'].includes(releaseStatus || '')) return 'review_required';
  if (attemptState && ['processing', 'submitted', 'reconciliation_required'].includes(attemptState)) return 'reconcile';
  return 'blocked_locally';
}
export function equalShareBasisPoints(userIds: number[]) {
  const ids = [...new Set(userIds)].sort((a, b) => a - b);
  if (!ids.length || ids.length > 100) throw Error('Choose between one and 100 recipients.');
  const base = Math.floor(10000 / ids.length), remainder = 10000 % ids.length;
  return ids.map((userId, index) => ({ userId, basisPoints: base + (index < remainder ? 1 : 0) }));
}
export const participationLabels: Record<string, string> = { pending: 'Awaiting response', accepted: 'Participation approved', rejected: 'Participation declined' };
export const interventionLabels: Record<string, string> = { none: '', blocked_locally: 'Submission blocked', reconcile: 'Checking delivery', prepared: 'Withdrawal being confirmed', withdrawn: 'Withdrawal confirmed', review_required: 'Resolution review needed' };
