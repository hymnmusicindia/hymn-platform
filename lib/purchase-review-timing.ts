export const CONFIRMATION_LEFT_EVENT = 'hymn:release-confirmation-left';
const ACTIVE = 'hymn:review-confirmation-active';
const LEFT = 'hymn:review-confirmation-left';
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
