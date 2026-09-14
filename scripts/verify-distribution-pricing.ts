import assert from "node:assert/strict";
import { distributionPlanCards, findDistributionPlan } from "../lib/distribution-plans";
import { SUBSCRIPTION_POLICIES } from "../lib/subscription-billing";

const expected = { one_time: 99, half_yearly: 699, yearly: 1099, yearly_plus: 1999 } as const;

for (const [plan, price] of Object.entries(expected)) {
  assert.equal(findDistributionPlan(plan as keyof typeof expected).price, price, `${plan} must use the published INR price.`);
}
assert.equal(distributionPlanCards.length, 4);
assert.equal(SUBSCRIPTION_POLICIES.half_yearly.amount, expected.half_yearly * 100);
assert.equal(SUBSCRIPTION_POLICIES.yearly.amount, expected.yearly * 100);
assert.equal(SUBSCRIPTION_POLICIES.yearly_plus.amount, expected.yearly_plus * 100);
assert.equal(findDistributionPlan("yearly").price, findDistributionPlan("half_yearly").price * 2 - 299, "Annual savings must derive from configured prices.");

console.log("Distribution pricing configuration is centralized and consistent with checkout policy.");
