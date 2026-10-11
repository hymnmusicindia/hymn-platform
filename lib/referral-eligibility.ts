// Shared onboarding rules: one day, before any checkout or subscription purchase.
export const REFERRAL_ONBOARDING_WINDOW_MS = 24 * 60 * 60 * 1000;
export function referralOnboardingEligible(account: { createdAt: Date; referredById: number | null; checkoutOrders: number; distributionOrders: number; subscriptionPayments: number }, now = Date.now()) {
  return !account.referredById && now >= account.createdAt.getTime() && now - account.createdAt.getTime() <= REFERRAL_ONBOARDING_WINDOW_MS && account.checkoutOrders === 0 && account.distributionOrders === 0 && account.subscriptionPayments === 0;
}
