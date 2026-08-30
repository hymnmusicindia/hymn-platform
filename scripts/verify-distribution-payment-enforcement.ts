import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { distributionOrderPriceMatches } from "../lib/distribution-order-price";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const form = source("components/release-form.tsx");
const createOrder = source("app/api/distribution/payment/create-order/route.ts");
const verifySubmit = source("app/api/distribution/payment/verify-submit/route.ts");
const editRoute = source("app/api/distribution/update-release/route.ts");
const payment = source("lib/payment-webhooks.ts");

assert.doesNotMatch(form, /if \(isEditing\)\s*\{\s*const data = await submitEditedRelease/);
assert.match(form, /if \(isCorrectionResubmission\)/);
assert.match(form, /modal: \{ ondismiss: \(\) => reject\(new Error\("Checkout cancelled\."\)\) \}/);
assert.match(form, /payment\.failed/);
assert.doesNotMatch(form, /dev_dist_payment|dev_bypass_payment|sub_active/);
assert.match(form, /existingAudioUrl: track\.existingAudioUrl \|\| undefined/);
assert.match(form, /draftReleaseId: reviewReleaseId/);
assert.match(form, /paidOrderReusable/);
assert.match(form, /useHymnCredits/);
assert.match(form, /HYMN credits/);

assert.match(createOrder, /if \(amountPaise > 0 && !razorpay\)/);
assert.match(createOrder, /fetchPayments/);
assert.match(createOrder, /Multiple captured payments are waiting/);
assert.match(createOrder, /No new charge was created/);
assert.match(createOrder, /creditsUsed/);
assert.match(createOrder, /existingEntitlement/);
assert.match(createOrder, /hasActiveSubscription && payload\.paymentModel === "subscription"/);
assert.match(createOrder, /resumedOrder: true/);
assert.doesNotMatch(createOrder, /dev_dist_order|dev_razorpay_key|BYPASS_DISTRIBUTION_PAYMENT/);

assert.match(verifySubmit, /verifyRazorpaySignature/);
assert.match(verifySubmit, /verifyCapturedRazorpayPayment/);
assert.match(verifySubmit, /persistedOrder\.userId !== session\.sub/);
assert.match(verifySubmit, /distributionOrderPriceMatches/);
assert.match(verifySubmit, /claimDistributionOrderForSubmission/);
assert.match(verifySubmit, /attachDistributionOrderRelease/);
assert.match(verifySubmit, /reserveSubscriptionReleaseSlot/);
assert.ok(verifySubmit.indexOf("await confirmDistributionPayment") < verifySubmit.indexOf("Artwork upload missing"), "Captured payment must be persisted before fallible asset validation.");

assert.match(editRoute, /\["changes_requested", "rejected"\]/);
assert.match(editRoute, /existingRelease\.paymentStatus !== "paid"/);
assert.doesNotMatch(editRoute, /\["draft", "changes_requested", "rejected", "under_review"\]/);

assert.match(payment, /paymentStatus: "paid", fulfilledAt: null/);
assert.match(payment, /This payment or entitlement has already been used for a release/);
assert.match(payment, /distribution-order:\$\{order\.id\}:credit-debit/);
assert.match(source("lib/distribution-db.ts"), /paymentStatus: \{ in: \["created", "authorized"\] \}/);
assert.match(source("lib/distribution-db.ts"), /A captured payment is already attached to this release/);

assert.equal(distributionOrderPriceMatches({ amount: 0, creditsUsed: 0, expectedAmount: 4999, currency: "INR", subscriptionEntitlement: true }), true, "Yearly+ and other active subscriptions must use their zero-value release entitlement.");
assert.equal(distributionOrderPriceMatches({ amount: 0, creditsUsed: 99, expectedAmount: 99, currency: "INR", subscriptionEntitlement: false }), true, "A release fully covered by HYMN credits must remain valid.");
assert.equal(distributionOrderPriceMatches({ amount: 49, creditsUsed: 50, expectedAmount: 99, currency: "INR", subscriptionEntitlement: false }), true, "Partial credits plus Razorpay must remain valid.");
assert.equal(distributionOrderPriceMatches({ amount: 99, creditsUsed: 0, expectedAmount: 99, currency: "INR", subscriptionEntitlement: false }), true, "A standard Razorpay order must remain valid.");
assert.equal(distributionOrderPriceMatches({ amount: 0, creditsUsed: 0, expectedAmount: 0, currency: "INR", subscriptionEntitlement: false }), true, "A valid first-release promotion must remain valid.");
assert.equal(distributionOrderPriceMatches({ amount: 0, creditsUsed: 0, expectedAmount: 99, currency: "INR", subscriptionEntitlement: false }), false, "A zero-value one-time order without entitlement must not bypass payment.");
assert.equal(distributionOrderPriceMatches({ amount: 1, creditsUsed: 0, expectedAmount: 4999, currency: "INR", subscriptionEntitlement: true }), false, "Subscription entitlements must never carry an unexplained charge.");

console.log("Distribution payment enforcement contracts passed: no draft/edit bypass, no fallback checkout, provider verification, entitlement validation, and replay claim are present.");
