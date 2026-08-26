import crypto from "crypto";
import Razorpay from "razorpay";

export const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    })
  : null;

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production" && signature === `dev:${orderId}:${paymentId}`;
  }

  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return constantTimeHexEqual(expected, signature);
}

export async function verifyCapturedRazorpayPayment(input: { orderId: string; paymentId: string; amountMinor: number; currency: string }) {
  if (!razorpay) throw new Error("Razorpay is not configured.");
  const payment = await razorpay.payments.fetch(input.paymentId);
  if (String(payment.order_id || "") !== input.orderId) throw new Error("Razorpay payment does not belong to this order.");
  if (Number(payment.amount) !== input.amountMinor) throw new Error("Razorpay payment amount does not match this order.");
  if (String(payment.currency || "").toUpperCase() !== input.currency.toUpperCase()) throw new Error("Razorpay payment currency does not match this order.");
  if (String(payment.status || "").toLowerCase() !== "captured") throw new Error("Razorpay payment has not been captured.");
  return payment;
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured.");
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return constantTimeHexEqual(expected, signature);
}

function constantTimeHexEqual(expected: string, actual: string) {
  if (!/^[a-f\d]+$/i.test(expected) || !/^[a-f\d]+$/i.test(actual)) return false;
  const expectedBytes = Buffer.from(expected, "hex");
  const actualBytes = Buffer.from(actual, "hex");
  return expectedBytes.length === actualBytes.length && crypto.timingSafeEqual(expectedBytes, actualBytes);
}
// vercel trigger 5
// vercel trigger 9
