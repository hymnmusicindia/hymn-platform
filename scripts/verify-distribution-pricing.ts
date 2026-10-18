import assert from "node:assert/strict";
import { distributionPlanCards, findDistributionPlan } from "../lib/distribution-plans";
import { SUBSCRIPTION_POLICIES } from "../lib/subscription-billing";
import { getTrackPricingQuote, getUgcAddonPrice, getYoutubeContentIdAddonPrice } from "../lib/distribution-pricing";
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

console.log("Distribution pricing configuration is centralized and consistent with checkout policy.");
