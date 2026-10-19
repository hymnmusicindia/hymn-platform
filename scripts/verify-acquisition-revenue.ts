import assert from "node:assert/strict";
import { checkoutRetainedRevenueMinor, eligibleNetRevenue, proportionalRefundMinor, studioRetainedRevenueMinor } from "../lib/acquisition-revenue";

assert.equal(eligibleNetRevenue({ recognisedRevenueMinor: 100000, applicableTaxesMinor: 18000, refundsChargebacksMinor: 10000, directPassThroughCostsMinor: 20000, providerFeeMinor: 2000 }), 50000);
assert.equal(Math.floor(50000 * 200 / 10000), 1000);
assert.equal(Math.floor(50000 * 300 / 10000), 1500);
assert.equal(checkoutRetainedRevenueMinor(30), 3000, "Beat-store rewards use the recorded HYMN share, not buyer gross.");
assert.equal(studioRetainedRevenueMinor(10000, 0.2), 2000, "Studio rewards use HYMN's contract commission share.");
assert.equal(proportionalRefundMinor(3000, 10000, 2500), 750, "Partial refunds reduce retained revenue proportionately.");
assert.equal(proportionalRefundMinor(3000, 10000, 10000), 3000, "Full refunds reverse the full recognized share.");
assert.throws(() => eligibleNetRevenue({ recognisedRevenueMinor: 5000, applicableTaxesMinor: 1000, refundsChargebacksMinor: 1000, directPassThroughCostsMinor: 2000, providerFeeMinor: 1500 }), /Deductions exceed/);
assert.throws(() => eligibleNetRevenue({ recognisedRevenueMinor: 5000, applicableTaxesMinor: -1, refundsChargebacksMinor: 0, directPassThroughCostsMinor: 0, providerFeeMinor: 0 }), /nonnegative/);
assert.throws(() => studioRetainedRevenueMinor(10000, 1.5), /invalid/);
assert.throws(() => proportionalRefundMinor(1, 0, 0), /invalid/);

console.log("Acquisition revenue policy checks passed.");
