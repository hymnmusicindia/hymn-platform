import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { createOrder } from "../lib/db";
import { confirmCheckoutPayment, confirmPersistedPayment, processRazorpayEvent, receiveRazorpayEvent } from "../lib/payment-webhooks";

type EventPayload = { id: string; event: string; payload: Record<string, { entity: Record<string, unknown> }> };

function captured(id: string, orderId: string, paymentId: string, amount = 1000, currency = "INR"): EventPayload {
  return { id, event: "payment.captured", payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency, status: "captured" } } } };
}

async function receive(payload: EventPayload) {
  const raw = Buffer.from(JSON.stringify(payload));
  return receiveRazorpayEvent(raw, payload);
}

async function makeOrder(userId: number, beatId: number, orderId: string, options: { referralCreditsUsed?: number } = {}) {
  return createOrder({ userId, productId: "beatstore", originalPrice: 10, discountApplied: 0, referralCreditsUsed: options.referralCreditsUsed ?? 0, finalAmount: 10, couponCode: null, razorpayOrderId: orderId, amount: 10, paymentStatus: "created", items: [{ beatId, licenseType: "general", price: 10 }] });
}

async function main() {
  assert.match(process.env.DATABASE_URL ?? "", /^postgres(?:ql)?:\/\//i);
  const suffix = Date.now().toString(36);
  const producer = await prisma.user.create({ data: { googleId: `pay-producer-${suffix}`, name: "Payment Producer", email: `producer-${suffix}@payments.invalid`, referralCode: `P${suffix}`.slice(0, 20) } });
  const buyer = await prisma.user.create({ data: { googleId: `pay-buyer-${suffix}`, name: "Payment Buyer", email: `buyer-${suffix}@payments.invalid`, referralCode: `B${suffix}`.slice(0, 20) } });
  const upload = await prisma.upload.create({ data: { userId: producer.id, kind: "AUDIO", storageKey: `payments/${suffix}`, fileName: "beat.mp3", mimeType: "audio/mpeg", sizeBytes: 1 } });
  const beat = await prisma.beat.create({ data: { userId: producer.id, title: "Payment Beat", bpm: 100, genre: "test", mood: "test", keySignature: "C", priceCents: 1000, generalPriceCents: 1000, exclusivePriceCents: 5000, status: "PUBLISHED", enabled: true, audioUploadId: upload.id } });

  const webhookFirstId = `checkout_webhook_first_${suffix}`;
  await makeOrder(buyer.id, beat.id, webhookFirstId);
  const firstPayload = captured(`evt_first_${suffix}`, webhookFirstId, `pay_first_${suffix}`);
  const firstEvent = await receive(firstPayload);
  const duplicate = await receive(firstPayload);
  assert.equal(duplicate.id, firstEvent.id, "Duplicate event must resolve to the persisted event.");
  await processRazorpayEvent(firstEvent.id);
  await processRazorpayEvent(firstEvent.id);
  await confirmCheckoutPayment({ razorpayOrderId: webhookFirstId, paymentId: `pay_first_${suffix}`, userId: buyer.id, source: "browser" });
  assert.equal(await prisma.beatSale.count({ where: { paymentId: `pay_first_${suffix}` } }), 1);
  const firstSale = await prisma.beatSale.findFirstOrThrow({ where: { paymentId: `pay_first_${suffix}` } });
  assert.equal(await prisma.walletTransaction.count({ where: { idempotencyKey: `beat-sale:${firstSale.id}:producer-credit` } }), 1);

  const browserFirstId = `checkout_browser_first_${suffix}`;
  await makeOrder(buyer.id, beat.id, browserFirstId);
  await confirmCheckoutPayment({ razorpayOrderId: browserFirstId, paymentId: `pay_browser_${suffix}`, userId: buyer.id, source: "browser" });
  const browserEvent = await receive(captured(`evt_browser_${suffix}`, browserFirstId, `pay_browser_${suffix}`));
  await processRazorpayEvent(browserEvent.id);
  assert.equal(await prisma.beatSale.count({ where: { paymentId: `pay_browser_${suffix}` } }), 1);

  const mismatchId = `checkout_mismatch_${suffix}`;
  await makeOrder(buyer.id, beat.id, mismatchId);
  await assert.rejects(() => confirmPersistedPayment({ razorpayOrderId: mismatchId, paymentId: `pay_mismatch_${suffix}`, amountMinor: 999, currency: "INR", source: "webhook" }), /amount/);
  await assert.rejects(() => confirmPersistedPayment({ razorpayOrderId: mismatchId, paymentId: `pay_mismatch_${suffix}`, amountMinor: 1000, currency: "USD", source: "webhook" }), /currency/);
  await assert.rejects(() => confirmPersistedPayment({ razorpayOrderId: `missing_${suffix}`, paymentId: `missing_${suffix}`, source: "webhook" }), /not found/);

  const authorizedId = `checkout_authorized_${suffix}`;
  await makeOrder(buyer.id, beat.id, authorizedId);
  const authorized = await receive({ id: `evt_authorized_${suffix}`, event: "payment.authorized", payload: { payment: { entity: { id: `pay_authorized_${suffix}`, order_id: authorizedId, amount: 1000, currency: "INR", status: "authorized" } } } });
  await processRazorpayEvent(authorized.id);
  assert.equal((await prisma.checkoutOrder.findUniqueOrThrow({ where: { razorpayOrderId: authorizedId } })).paymentStatus, "authorized");
  const authorizedCapture = await receive(captured(`evt_authorized_capture_${suffix}`, authorizedId, `pay_authorized_${suffix}`));
  await processRazorpayEvent(authorizedCapture.id);
  assert.equal((await prisma.checkoutOrder.findUniqueOrThrow({ where: { razorpayOrderId: authorizedId } })).paymentStatus, "paid");

  const rollbackId = `checkout_rollback_${suffix}`;
  const rollbackOrder = await makeOrder(buyer.id, beat.id, rollbackId, { referralCreditsUsed: 5 });
  await assert.rejects(() => confirmCheckoutPayment({ razorpayOrderId: rollbackId, paymentId: `pay_rollback_${suffix}`, source: "webhook" }), /credit balance/);
  assert.equal((await prisma.checkoutOrder.findUniqueOrThrow({ where: { id: rollbackOrder.id } })).paymentStatus, "created");
  assert.equal(await prisma.beatSale.count({ where: { paymentId: `pay_rollback_${suffix}` } }), 0);

  const retryId = `checkout_retry_${suffix}`;
  const retryEvent = await receive(captured(`evt_retry_${suffix}`, retryId, `pay_retry_${suffix}`));
  await assert.rejects(() => processRazorpayEvent(retryEvent.id), /not found/);
  assert.equal((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: retryEvent.id } })).processingState, "failed");
  await makeOrder(buyer.id, beat.id, retryId);
  await processRazorpayEvent(retryEvent.id);
  assert.equal((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: retryEvent.id } })).processingState, "processed");

  const refundPayload: EventPayload = { id: `evt_refund_${suffix}`, event: "refund.processed", payload: { refund: { entity: { id: `refund_${suffix}`, order_id: webhookFirstId, payment_id: `pay_first_${suffix}`, amount: 1000, currency: "INR", status: "processed" } } } };
  const refund = await receive(refundPayload);
  await processRazorpayEvent(refund.id);
  assert.equal((await prisma.checkoutOrder.findUniqueOrThrow({ where: { razorpayOrderId: webhookFirstId } })).paymentStatus, "refunded");
  assert.equal((await prisma.beatPurchase.findFirstOrThrow({ where: { paymentId: `pay_first_${suffix}` } })).hasAccess, false);
  const sale = await prisma.beatSale.findFirstOrThrow({ where: { paymentId: `pay_first_${suffix}` } });
  assert.equal(await prisma.walletTransaction.count({ where: { idempotencyKey: `beat-sale:${sale.id}:reversal:refunded` } }), 1);
  await processRazorpayEvent(refund.id);
  assert.equal(await prisma.walletTransaction.count({ where: { idempotencyKey: `beat-sale:${sale.id}:reversal:refunded` } }), 1);

  const failureId = `checkout_failure_${suffix}`;
  await makeOrder(buyer.id, beat.id, failureId);
  const failed = await receive({ id: `evt_failed_${suffix}`, event: "payment.failed", payload: { payment: { entity: { id: `pay_failed_${suffix}`, order_id: failureId, amount: 1000, currency: "INR", status: "failed" } } } });
  await processRazorpayEvent(failed.id);
  assert.equal((await prisma.checkoutOrder.findUniqueOrThrow({ where: { razorpayOrderId: failureId } })).paymentStatus, "failed");

  const exclusiveBeat = await prisma.beat.create({ data: { userId: producer.id, title: "Exclusive Race Beat", bpm: 110, genre: "test", mood: "test", keySignature: "D", priceCents: 500, generalPriceCents: 500, exclusivePriceCents: 5000, status: "PUBLISHED", enabled: true, audioUploadId: upload.id } });
  const exclusiveInput = (orderId: string) => ({ userId: buyer.id, productId: "beatstore", originalPrice: 50, discountApplied: 0, referralCreditsUsed: 0, finalAmount: 50, couponCode: null, razorpayOrderId: orderId, amount: 50, paymentStatus: "created" as const, items: [{ beatId: exclusiveBeat.id, licenseType: "exclusive" as const, price: 50 }] });
  const race = await Promise.allSettled([createOrder(exclusiveInput(`exclusive_a_${suffix}`)), createOrder(exclusiveInput(`exclusive_b_${suffix}`))]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1, "Exactly one exclusive reservation must succeed.");
  const winner = race.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>> => result.status === "fulfilled");
  assert.ok(winner);
  await confirmCheckoutPayment({ razorpayOrderId: winner.value.razorpayOrderId, paymentId: `pay_exclusive_${suffix}`, userId: buyer.id, source: "browser" });
  assert.equal((await prisma.beat.findUniqueOrThrow({ where: { id: exclusiveBeat.id } })).status, "EXCLUSIVELY_SOLD");
  assert.equal(await prisma.beatSale.count({ where: { beatId: exclusiveBeat.id, licenseType: "exclusive" } }), 1);
  const exclusivePurchase = await prisma.beatPurchase.findFirstOrThrow({ where: { beatId: exclusiveBeat.id, licenseType: "exclusive" } });
  assert.ok(exclusivePurchase.licenseTermsSnapshot, "Exclusive licence terms must be snapshotted.");

  const distributionId = `distribution_${suffix}`;
  await prisma.distributionOrder.create({ data: { userId: buyer.id, plan: "basic", amount: 700, razorpayOrderId: distributionId, currency: "INR" } });
  const distributionEvent = await receive(captured(`evt_distribution_${suffix}`, distributionId, `pay_distribution_${suffix}`, 70000));
  await processRazorpayEvent(distributionEvent.id);
  assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { userId: buyer.id } })).status, "active");

  console.log("Razorpay webhook integration verification passed.");
}

main().finally(() => prisma.$disconnect());
// vercel trigger 9
