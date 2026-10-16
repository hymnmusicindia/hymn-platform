import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { assertStudioParticipant, sendStudioMessage } from "../lib/studio-services";
import { receiveRazorpayEvent, processRazorpayEvent } from "../lib/payment-webhooks";

async function main() {
  assert.match(process.env.DATABASE_URL || "", /127\.0\.0\.1:\d+\/studio_fixture/);
  const baseline = await prisma.studioServiceOrder.findFirstOrThrow({ where: { projectTitle: "Integration Song" } });
  const order = await prisma.studioServiceOrder.create({ data: { customerId: baseline.customerId, engineerPartyId: baseline.engineerPartyId, engineerProfileId: baseline.engineerProfileId, serviceListingId: baseline.serviceListingId, serviceType: baseline.serviceType, commissionRate: baseline.commissionRate, engineerShareRate: baseline.engineerShareRate, termsVersion: baseline.termsVersion, termsAcceptedAt: new Date(), projectTitle: "Audit only - refund boundaries", basePrice: 100, finalPrice: 100, includedRevisions: 1, additionalRevisionPrice: 10, turnaroundDays: 5, status: "IN_PROGRESS", paidAt: new Date(), paymentStatus: "HELD" } });
  const tag = randomUUID();
  const first = await prisma.studioPayment.create({ data: { orderId: order.id, purpose: "INITIAL_ORDER", amount: 100, status: "CAPTURED", capturedAt: new Date(), razorpayOrderId: `order-audit-${tag}`, razorpayPaymentId: `pay-audit-${tag}`, idempotencyKey: `audit-${tag}` } });
  const extra = await prisma.studioPayment.create({ data: { orderId: order.id, purpose: "AMENDMENT", amount: 10, status: "CAPTURED", capturedAt: new Date(), razorpayOrderId: `order-extra-${tag}`, razorpayPaymentId: `pay-extra-${tag}`, idempotencyKey: `extra-${tag}` } });
  const payload = { id: `event-${tag}`, event: "refund.processed", payload: { refund: { entity: { id: `rfnd-${tag}`, payment_id: first.razorpayPaymentId!, amount: 1, currency: "INR", status: "processed" } } } };
  const event = await receiveRazorpayEvent(Buffer.from(JSON.stringify(payload)), payload);
  await processRazorpayEvent(event.id);
  const after = await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: order.id } });
  const extraAfter = await prisma.studioPayment.findUniqueOrThrow({ where: { id: extra.id } });
  assert.equal(after.status, "DISPUTED", "A partial refund must not close the project as fully refunded.");
  assert.equal(Number((await prisma.studioPayment.findUniqueOrThrow({ where: { id: first.id } })).refundedAmount), .01);
  assert.equal(extraAfter.status, "CAPTURED");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: baseline.customerId } });
  try {
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await assert.rejects(assertStudioParticipant(baseline.publicId, user.id));
    await assert.rejects(sendStudioMessage({ orderPublicId: baseline.publicId, userId: user.id, body: "Audit suspended participant access", idempotencyKey: randomUUID() }));
  } finally { await prisma.user.update({ where: { id: user.id }, data: { status: user.status } }); }
  const { recordStudioRefund } = await import("../lib/studio-refunds");
  const observed = payload.payload.refund.entity;
  await recordStudioRefund(first.id, { ...observed, status: "pending" });
  assert.equal((await prisma.studioRefund.findUniqueOrThrow({ where: { providerRefundId: observed.id } })).status, "PROCESSED", "A delayed pending event must not regress a processed refund.");
  await assert.rejects(recordStudioRefund(first.id, { ...observed, id: `invalid-${tag}`, amount: 10000 }));
  await assert.rejects(recordStudioRefund(first.id, { ...observed, id: `currency-${tag}`, currency: "USD" }));
  await recordStudioRefund(first.id, { ...observed, id: `rest-${tag}`, amount: 9999 });
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "DISPUTED", "Other captured funding still remains.");
  await recordStudioRefund(extra.id, { ...observed, id: `extra-refund-${tag}`, payment_id: extra.razorpayPaymentId!, amount: 1000 });
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "REFUNDED");
  console.log("PASS: partial/full refund boundaries, duplicate and stale events, over-refund/currency rejection, suspended participant access. Fixture only; no live financial actions.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
