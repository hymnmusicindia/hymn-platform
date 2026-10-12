// Basis points, frozen on each commission. Marketplace rates apply only to
// HYMN's recorded share, never to the producer/engineer's earnings.
export const REFERRAL_COMMISSION_RATES = {
  one_time: 1000, half_yearly: 800, yearly: 700, yearly_plus: 500,
  beats: 500, studio: 500,
} as const;
export type ReferralCommissionCategory = keyof typeof REFERRAL_COMMISSION_RATES;
export const REFERRAL_HOLD_DAYS = 14;
export const REFERRAL_MINIMUM_PAYOUT_MINOR = 50000;
export function commissionMinor(baseMinor: number, rateBps: number) {
  if (!Number.isSafeInteger(baseMinor) || baseMinor < 0 || !Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) throw new Error("Invalid commission amount or rate.");
  return Number(BigInt(baseMinor) * BigInt(rateBps) / 10000n);
}
export function remainingCommissionMinor(originalMinor: number, paidMinor: number, refundedMinor: number) {
  if (paidMinor <= 0) return 0;
  return Number(BigInt(originalMinor) * BigInt(Math.max(0, paidMinor - Math.min(paidMinor, refundedMinor))) / BigInt(paidMinor));
}

// Indirect rewards are shares of the direct commission, never recruitment fees.
export const REFERRAL_NETWORK_RATES_BPS = [0, 100, 50, 50, 50, 50, 50] as const;
export function referralReleaseLabel(eligibleAt: string, now = Date.now()) {
  const remaining = new Date(eligibleAt).getTime() - now;
  if (!Number.isFinite(remaining)) return "Payment checks pending";
  if (remaining <= 0) return "Final checks pending";
  if (remaining < 86400000) return "Less than 24 hours";
  return `${Math.ceil(remaining / 86400000)} days remaining`;
}
