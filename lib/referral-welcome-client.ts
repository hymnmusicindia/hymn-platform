export const REFERRAL_WELCOME_KEY = "hymn-referral-welcome";
export const REFERRAL_WELCOME_EVENT = "hymn:referral-welcome";

export function queueReferralWelcome(value: unknown) {
  if (!value || typeof value !== "object" || !("name" in value) || typeof value.name !== "string") return;
  try {
    sessionStorage.setItem(REFERRAL_WELCOME_KEY, JSON.stringify({ ...value, expiresAt: Date.now() + 60_000 }));
    window.dispatchEvent(new Event(REFERRAL_WELCOME_EVENT));
  } catch { /* Storage restrictions must not interrupt sign-in. */ }
}
