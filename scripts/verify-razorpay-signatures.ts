import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyRazorpaySignature, verifyRazorpayWebhookSignature } from "../lib/razorpay";
import { validateObservedPayment } from "../lib/payment-webhooks";

process.env.RAZORPAY_KEY_SECRET = "test_payment_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test_webhook_secret";

const orderId = "order_test";
const paymentId = "pay_test";
const paymentSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
assert.equal(verifyRazorpaySignature(orderId, paymentId, paymentSignature), true);
assert.equal(verifyRazorpaySignature(orderId, paymentId, `${paymentSignature.slice(0, -1)}0`), false);

const body = Buffer.from(JSON.stringify({ event: "payment.captured" }));
const webhookSignature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
assert.equal(verifyRazorpayWebhookSignature(body, webhookSignature), true);
assert.equal(verifyRazorpayWebhookSignature(body, "invalid"), false);
assert.doesNotThrow(() => validateObservedPayment({ amountMinor: 9900, currency: "INR" }, { amountMinor: 9900, currency: "inr" }));
assert.throws(() => validateObservedPayment({ amountMinor: 9900, currency: "INR" }, { amountMinor: 1, currency: "INR" }), /amount/);
assert.throws(() => validateObservedPayment({ amountMinor: 9900, currency: "INR" }, { amountMinor: 9900, currency: "USD" }), /currency/);
console.log("Razorpay constant-time signature verification passed.");
// vercel trigger 9
