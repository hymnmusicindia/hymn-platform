import { socialPlatforms } from "@/lib/release-config";
import type { SubscriptionPlan } from "@/lib/types";

const TRACK_PRICE = 99;
export const UGC_ADDON_PRICE = 50;

export type TrackPricingQuote = {
  trackCount: number;
  basePrice: number;
  discountRate: number;
  discountAmount: number;
  finalPrice: number;
  savings: number;
  nextThreshold: number | null;
  nextThresholdDiscount: number | null;
  nextThresholdPrice: number | null;
  nextThresholdSavings: number | null;
  bestValue: boolean;
};

function pluralizeTrack(count: number) {
  return count === 1 ? "track" : "tracks";
}

function nextTierFor(trackCount: number) {
  if (trackCount < 6) return { threshold: 6, discount: 0.08 };
  if (trackCount < 12) return { threshold: 12, discount: 0.10 };
  if (trackCount < 16) return { threshold: 16, discount: 0.15 };
  return { threshold: null, discount: null };
}

export function getTrackPricingQuote(trackCount: number): TrackPricingQuote {
  const safeTrackCount = Math.max(1, Math.floor(trackCount || 1));
  const basePrice = safeTrackCount * TRACK_PRICE;
  const discountRate = safeTrackCount >= 16 ? 0.15 : safeTrackCount >= 12 ? 0.10 : safeTrackCount >= 6 ? 0.08 : 0;
  const finalPrice = Math.round(basePrice * (1 - discountRate));
  const savings = basePrice - finalPrice;
  const nextTier = nextTierFor(safeTrackCount);
  const nextThresholdPrice = nextTier.threshold && nextTier.discount != null ? Math.round(nextTier.threshold * TRACK_PRICE * (1 - nextTier.discount)) : null;
  const nextThresholdSavings = nextTier.threshold && nextThresholdPrice != null ? nextTier.threshold * TRACK_PRICE - nextThresholdPrice : null;

  return {
    trackCount: safeTrackCount,
    basePrice,
    discountRate,
    discountAmount: savings,
    finalPrice,
    savings,
    nextThreshold: nextTier.threshold,
    nextThresholdDiscount: nextTier.discount,
    nextThresholdPrice,
    nextThresholdSavings,
    bestValue: safeTrackCount >= 12 && safeTrackCount <= 15
  };
}

export function getTrackPricingBadge(quote: TrackPricingQuote) {
  return quote.bestValue ? "Best Value" : null;
}

export function getTrackPricingNudge(quote: TrackPricingQuote) {
  if (quote.trackCount === 5 && quote.nextThresholdSavings != null) {
    return `Add 1 more track and save \u20B9${quote.nextThresholdSavings.toLocaleString("en-IN")}`;
  }
  if (quote.trackCount === 11 && quote.nextThresholdSavings != null) {
    return `Add 1 more track and save \u20B9${quote.nextThresholdSavings.toLocaleString("en-IN")}`;
  }
  if (quote.discountRate === 0) {
    const target = quote.nextThreshold ?? 6;
    const needed = target - quote.trackCount;
    return `Add ${needed} more ${pluralizeTrack(needed)} to unlock 8% discount`;
  }
  if (quote.discountRate === 0.08) {
    return "You unlocked 8% bulk discount ??";
  }
  if (quote.bestValue) {
    const needed = 16 - quote.trackCount;
    return `You unlocked 10% bulk discount ??. Add ${needed} more ${pluralizeTrack(needed)} to unlock 15% discount`;
  }
  if (quote.discountRate === 0.10) {
    return "You unlocked 10% bulk discount ??";
  }
  return "You unlocked 15% bulk discount ??";
}

function normalizePlatformName(value: string) {
  return value.trim().toLowerCase();
}

export function hasUgcPlatforms(platforms: string[]) {
  const selected = new Set(platforms.map(normalizePlatformName).filter(Boolean));
  return socialPlatforms.some((platform) => selected.has(normalizePlatformName(platform.name)));
}

export function getUgcAddonPrice(platforms: string[], plan?: SubscriptionPlan, options?: { youtubeContentIdEnabled?: boolean }) {
  if (plan && plan !== "one_time") {
    return 0;
  }
  const ugcFee = hasUgcPlatforms(platforms) ? UGC_ADDON_PRICE : 0;
  const youtubeContentIdFee = options?.youtubeContentIdEnabled ? 200 : 0;
  return ugcFee + youtubeContentIdFee;
}
