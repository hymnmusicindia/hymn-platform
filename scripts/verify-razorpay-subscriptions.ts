import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

process.env.RAZORPAY_KEY_SECRET = "subscription-test-secret";

async function main() {
const { isSubscriptionProduct, subscriptionHasEntitlement, subscriptionPeriodAdvanced, verifySubscriptionCheckoutSignature } = await import("../lib/subscription-billing");

assert.equal(isSubscriptionProduct("half_yearly"), true);
assert.equal(isSubscriptionProduct("yearly"), true);
assert.equal(isSubscriptionProduct("yearly_plus"), true);
assert.equal(isSubscriptionProduct("one_time"), false);
assert.equal(isSubscriptionProduct("plan_attacker_supplied"), false);

const paymentId = "pay_verified";
const subscriptionId = "sub_owned";
const signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${paymentId}|${subscriptionId}`).digest("hex");
assert.equal(verifySubscriptionCheckoutSignature(paymentId, subscriptionId, signature), true);
assert.equal(verifySubscriptionCheckoutSignature(paymentId, "sub_other_user", signature), false);
assert.equal(verifySubscriptionCheckoutSignature("pay_forged", subscriptionId, signature), false);
assert.equal(verifySubscriptionCheckoutSignature(paymentId, subscriptionId, "not-a-signature"), false);

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);
assert.equal(subscriptionHasEntitlement({ status: "active", currentPeriodEnd: future }), true);
assert.equal(subscriptionHasEntitlement({ status: "pending", currentPeriodEnd: future }), false);
assert.equal(subscriptionHasEntitlement({ status: "halted", currentPeriodEnd: future }), false);
assert.equal(subscriptionHasEntitlement({ status: "paused", currentPeriodEnd: future }), false);
assert.equal(subscriptionHasEntitlement({ status: "cancelled", currentPeriodEnd: future, cancelAtPeriodEnd: true }), false);
assert.equal(subscriptionHasEntitlement({ status: "cancelled", currentPeriodEnd: past, cancelAtPeriodEnd: true }), false);
assert.equal(subscriptionPeriodAdvanced(new Date("2026-01-01"), new Date("2026-02-01")), true);
assert.equal(subscriptionPeriodAdvanced(new Date("2026-02-01"), new Date("2026-02-01")), false);
assert.equal(subscriptionPeriodAdvanced(null, new Date("2026-02-01")), false);

const createOrderSource = fs.readFileSync("app/api/distribution/payment/create-order/route.ts", "utf8");
assert.match(createOrderSource, /createProviderSubscription\(session\.sub, payload\.plan\)/);
assert.match(createOrderSource, /hasActiveSubscription && payload\.paymentModel === "subscription"/);
assert.doesNotMatch(createOrderSource, /body\.price|payload\.price|body\.planId|payload\.planId/);
const actionSource = fs.readFileSync("app/api/subscriptions/actions/route.ts", "utf8");
assert.match(actionSource, /manageProviderSubscription\(session\.sub, action\)/);
const billingSource = fs.readFileSync("lib/subscription-billing.ts", "utf8");
assert.match(billingSource, /subscriptionReleaseUsage\.count/);
assert.match(billingSource, /sub\.currentPeriodStart \? \{ createdAt: \{ gte: sub\.currentPeriodStart \} \}/);
const oneTimeSource = fs.readFileSync("app/api/checkout/create-order/route.ts", "utf8");
assert.match(oneTimeSource, /razorpay\.orders\.create/);
assert.doesNotMatch(oneTimeSource, /subscriptions\.create/);

console.log("Razorpay subscription mapping, entitlement policy, callback tamper resistance, ownership routing, and one-time separation passed.");
}

main().catch((error) => { console.error(error); process.exit(1); });
