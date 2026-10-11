import assert from "node:assert/strict";
import { SubscriptionPlanConfigurationError, validateSubscriptionProviderPlan } from "../lib/subscription-plan-validation";

const expected = { amount: 69900, currency: "INR", months: 6, planEnv: "RAZORPAY_PLAN_HALF_YEARLY" };
const valid = { item: { amount: 69900, currency: "INR" }, period: "monthly", interval: 6 };
validateSubscriptionProviderPlan(valid, expected);
validateSubscriptionProviderPlan({ ...valid, period: "quarterly", interval: 2 }, expected);
for (const invalid of [
  { ...valid, item: { amount: 699, currency: "INR" } },
  { ...valid, item: { amount: 69900, currency: "USD" } },
  { ...valid, interval: 1 },
  { ...valid, period: "yearly", interval: 1 },
  { ...valid, interval: 0.5 },
  { ...valid, period: "daily", interval: 180 },
  { ...valid, item: undefined },
]) assert.throws(() => validateSubscriptionProviderPlan(invalid, expected), SubscriptionPlanConfigurationError);
validateSubscriptionProviderPlan({ item: { amount: 109900, currency: "INR" }, period: "yearly", interval: 1 }, { ...expected, amount: 109900, months: 12 });
console.log("Subscription plan validation passed: exact minor-unit pricing, currency, and billing frequency.");
