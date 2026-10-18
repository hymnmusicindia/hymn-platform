import assert from "node:assert/strict";
import { distributionPlanCards, findDistributionPlan } from "../lib/distribution-plans";
import { SUBSCRIPTION_POLICIES } from "../lib/subscription-billing";
import { createDistributionCheckoutQuote, getTrackPricingQuote, getUgcAddonPrice, getYoutubeContentIdAddonPrice } from "../lib/distribution-pricing";
import { calculateFirstReleasePrice } from "../lib/first-release-promotion";
import { getDistributionPricing } from "../lib/distribution-db";

const expected = { one_time: 99, half_yearly: 699, yearly: 1099, yearly_plus: 1999 } as const;

for (const [plan, price] of Object.entries(expected)) {
  assert.equal(findDistributionPlan(plan as keyof typeof expected).price, price, `${plan} must use the published INR price.`);
}
assert.equal(distributionPlanCards.length, 4);
assert.equal(SUBSCRIPTION_POLICIES.half_yearly.amount, expected.half_yearly * 100);
assert.equal(SUBSCRIPTION_POLICIES.yearly.amount, expected.yearly * 100);
assert.equal(SUBSCRIPTION_POLICIES.yearly_plus.amount, expected.yearly_plus * 100);
assert.equal(findDistributionPlan("yearly").price, findDistributionPlan("half_yearly").price * 2 - 299, "Annual savings must derive from configured prices.");
const ugcPlatforms = ["Spotify", "Instagram / Facebook", "TikTok"];
assert.equal(getUgcAddonPrice(ugcPlatforms, "one_time"), 50, "UGC fee is separate from Content ID pricing.");
assert.equal(getYoutubeContentIdAddonPrice("one_time", true), 200, "Content ID remains a separately priced service.");
assert.equal(getYoutubeContentIdAddonPrice("one_time", false), 0);
assert.equal(getTrackPricingQuote(1).finalPrice + getUgcAddonPrice(ugcPlatforms, "one_time"), 149);
assert.equal(getDistributionPricing("one_time", 1, "single", ugcPlatforms, { youtubeContentIdEnabled: false }), 149, "Server price must exclude Content ID when it is not selected.");
assert.equal(getDistributionPricing("one_time", 1, "single", ugcPlatforms, { youtubeContentIdEnabled: true }), 349, "Server price must include both distinct optional add-ons only when Content ID is selected.");
assert.equal(calculateFirstReleasePrice({ plan: "one_time", releaseType: "single", trackCount: 1, normalAmount: 99 + 50 }).finalAmount, 50, "First-release pricing should waive the single's base fee and leave UGC payable.");
assert.equal(calculateFirstReleasePrice({ plan: "one_time", releaseType: "single", trackCount: 1, normalAmount: 99 + 50 + 200 }).finalAmount, 250, "Opted-in Content ID remains additional after the base fee is waived.");

const quote = (input: Partial<Parameters<typeof createDistributionCheckoutQuote>[0]> = {}) => createDistributionCheckoutQuote({
  releaseId: 12,
  reviewMetadataHash: "review-hash",
  trackCount: 1,
  releaseType: "single",
  platforms: ["Spotify"],
  youtubeContentIdEnabled: false,
  firstReleaseOffer: false,
  useHymnCredits: false,
  availableCredits: 0,
  ...input
});
for (const trackCount of [1, 5, 6, 11, 12, 15, 16, 20]) {
  const standard = quote({ trackCount });
  const expectedBase = getTrackPricingQuote(trackCount).finalPrice;
  assert.equal(standard.subtotal, expectedBase, `Standard quote must use bulk pricing at ${trackCount} tracks.`);
  assert.equal(standard.payable, expectedBase);
  assert.equal(quote({ trackCount, firstReleaseOffer: true }).firstReleaseDiscount, Math.min(99, expectedBase), `Offer may discount only up to ₹99 at ${trackCount} tracks.`);
}
for (const platforms of [[], ["Spotify"], ["Instagram / Facebook"], ["TikTok"], ["Spotify", "YouTube Music"], ["Instagram / Facebook", "TikTok"]]) {
  const hasUgc = hasUgcPlatformsForTest(platforms);
  const standard = quote({ platforms });
  assert.equal(standard.ugcAddon, hasUgc ? 50 : 0, `UGC pricing must match selected platforms: ${platforms.join(",") || "none"}.`);
  assert.equal(quote({ platforms, firstReleaseOffer: true }).payable, (hasUgc ? 50 : 0), "First-release offer must leave the optional UGC fee payable for a single.");
}
for (const youtubeContentIdEnabled of [false, true]) {
  const amount = youtubeContentIdEnabled ? 200 : 0;
  assert.equal(quote({ youtubeContentIdEnabled }).youtubeContentIdAddon, amount);
  assert.equal(quote({ youtubeContentIdEnabled, firstReleaseOffer: true }).payable, amount, "First-release offer must leave opted-in Content ID payable.");
  assert.equal(quote({ youtubeContentIdEnabled, firstReleaseOffer: true, platforms: ["TikTok"] }).payable, amount + 50, "First-release offer must leave both optional add-ons payable.");
}
for (const [availableCredits, expectedUsed] of [[0, 0], [1, 1], [49, 49], [50, 50], [51, 50], [-5, 0], [49.9, 49]] as const) {
  const creditQuote = quote({ firstReleaseOffer: true, platforms: ["TikTok"], useHymnCredits: true, availableCredits });
  assert.equal(creditQuote.creditsUsed, expectedUsed, `Credits must cap at eligible subtotal (available ${availableCredits}).`);
  assert.equal(creditQuote.payable, 50 - expectedUsed);
}
assert.equal(quote({ firstReleaseOffer: true, useHymnCredits: true, availableCredits: 99 }).payable, 0, "Credits can cover the remaining eligible subtotal after base discount.");
assert.equal(quote({ firstReleaseOffer: true, useHymnCredits: false, availableCredits: 1000 }).payable, 0, "Credits must not apply unless the customer opts in.");

function hasUgcPlatformsForTest(platforms: string[]) {
  return getUgcAddonPrice(platforms, "one_time") === 50;
}

console.log("Distribution pricing configuration is centralized and consistent with checkout policy.");
