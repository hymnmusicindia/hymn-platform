export const CONFIRMATION_LEFT_EVENT = 'hymn:release-confirmation-left';
const ACTIVE = 'hymn:review-confirmation-active';
const LEFT = 'hymn:review-confirmation-left';
/** Feedback stays optional and never interrupts account, payment or creative work. */
export function deferPurchaseReview(pathname: string, search = '') {
  const workflows = ['/distribution', '/dashboard/releases', '/first-release', '/checkout', '/payout', '/royalty-payouts', '/studio/start', '/studio/orders', '/studio/apply', '/studio/readiness', '/licenses', '/producer-onboarding', '/contributors/claim', '/contact', '/managed-services', '/admin', '/team'];
  if (workflows.some(path => pathname === path || pathname.startsWith(`${path}/`))) return true;
  const query = new URLSearchParams(search);
  return pathname.startsWith('/dashboard') && (query.get('module') === 'splits' || ['support', 'settings', 'account', 'subscription', 'promotions', 'collaborators', 'upload', 'distribution', 'earnings', 'payouts', 'purchases'].includes(query.get('tab') || ''));
}
export function markReviewConfirmationEntered() {
  try { sessionStorage.setItem(ACTIVE, String(Date.now())); sessionStorage.removeItem(LEFT); } catch {}
}
export function clearReviewConfirmationDeparture() {
  try { sessionStorage.removeItem(LEFT); } catch {}
}
export function markReviewConfirmationLeft() {
  if (document.querySelector('[data-release-review-confirmation]')) return;
  try { sessionStorage.removeItem(ACTIVE); sessionStorage.setItem(LEFT, String(Date.now())); } catch {}
  window.dispatchEvent(new Event(CONFIRMATION_LEFT_EVENT));
}
export function recentlyLeftReviewConfirmation() {
  try { const value = Number(sessionStorage.getItem(LEFT)); return value > 0 && Date.now() - value < 30 * 60000; } catch { return false; }
}
export function recoverConfirmationDeparture() {
  try {
    const active = Number(sessionStorage.getItem(ACTIVE));
    if (active > 0 && Date.now() - active < 30 * 60000 && !location.pathname.startsWith('/distribution') && !document.querySelector('[data-release-review-confirmation]')) markReviewConfirmationLeft();
  } catch {}
}
