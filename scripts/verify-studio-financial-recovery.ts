import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { applyStudioDispute, recordStudioRefund } from "../lib/studio-refunds";
import { processStudioRefunds, recoverStudioPayments, type StudioGateway } from "../lib/studio-payment-recovery";
import { reviewStudioFinance } from "../lib/studio-finance-review";
import { studioFixtureGateway } from "./studio-fixture-gateway";
import { assertStudioPayoutClear } from "../lib/studio-payout-guard";

async function main() {
  assert.match(process.env.DATABASE_URL || "", /127\.0\.0\.1:\d+\/studio_fixture/);
  const baseline = await prisma.studioServiceOrder.findFirstOrThrow({ where: { projectTitle: "Integration Song" }, include: { engineerParty: true } });
  const engineerId = baseline.engineerParty.claimedByUserId!;
  async function makeOrder(settled = false) {
    const tag = randomUUID();
    const order = await prisma.studioServiceOrder.create({ data: { customerId: baseline.customerId, engineerPartyId: baseline.engineerPartyId, engineerProfileId: baseline.engineerProfileId, serviceListingId: baseline.serviceListingId, serviceType: baseline.serviceType, commissionRate: baseline.commissionRate, engineerShareRate: baseline.engineerShareRate, termsVersion: baseline.termsVersion, termsAcceptedAt: new Date(), projectTitle: `Finance fixture ${tag}`, basePrice: 100, finalPrice: 100, includedRevisions: 1, additionalRevisionPrice: 10, turnaroundDays: 5, status: settled ? "COMPLETED" : "REFUND_PENDING", paidAt: new Date(), paymentStatus: settled ? "RELEASED" : "REFUND_PENDING" } });
    const payment = await prisma.studioPayment.create({ data: { orderId: order.id, purpose: "INITIAL_ORDER", amount: 100, status: "CAPTURED", capturedAt: new Date(), razorpayOrderId: `order_${tag}`, razorpayPaymentId: `pay_${tag}`, idempotencyKey: tag } });
    if (settled) {
      await prisma.studioEarning.create({ data: { orderId: order.id, engineerPartyId: order.engineerPartyId, grossAmount: 100, commissionAmount: 20, netAmount: 80, idempotencyKey: `earning:${tag}` } });
      await prisma.artistPayoutBalance.update({ where: { userId: engineerId }, data: { availableBalance: { increment: 80 }, lifetimeEarnings: { increment: 80 } } });
    }
    return { order, payment };
  }
  const { order, payment } = await makeOrder(true);
  const balanceBefore = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: engineerId } });
  const refund = { id: `refund_${randomUUID()}`, payment_id: payment.razorpayPaymentId!, amount: 2500, currency: "INR", status: "processed" };
  await recordStudioRefund(payment.id, refund);
  await recordStudioRefund(payment.id, refund);
  let earning = await prisma.studioEarning.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(Number(earning.reversedNetAmount), 20);
  assert.equal(Number(earning.reversedCommissionAmount), 5);
  let balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: engineerId } });
  assert.equal(Number(balance.availableBalance), Number(balanceBefore.availableBalance) - 20);
  assert.equal(await prisma.walletTransaction.count({ where: { referenceType: "studio_order", referenceId: { startsWith: `${order.id}:` }, type: "studio_service_reversal" } }), 1);
  await assert.rejects(prisma.$transaction(tx => assertStudioPayoutClear(tx, engineerId)));
  await reviewStudioFinance(order.publicId, "CLOSE_FINANCE", "Partial refund agreed; existing external payouts reviewed", null);
  await recordStudioRefund(payment.id, refund);
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "COMPLETED", "Polling an unchanged refund must not reopen a closed review.");
  await applyStudioDispute(payment.id, "disputed", `fixture-open-${order.id}`);
  earning = await prisma.studioEarning.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(Number(earning.heldNetAmount), 60);
  await recordStudioRefund(payment.id, { ...refund, id: `rest_${randomUUID()}`, amount: 7500 });
  earning = await prisma.studioEarning.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(Number(earning.heldNetAmount), 0);
  assert.equal(Number(earning.reversedNetAmount), 80);
  balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: engineerId } });
  assert.equal(Number(balance.availableBalance), Number(balanceBefore.availableBalance) - 80);
  assert.equal(Number(balance.pendingBalance), Number(balanceBefore.pendingBalance));
  await reviewStudioFinance(order.publicId, "CLOSE_FINANCE", "Verified the external transfer and payout ledger in fixture", null);

  const won = await makeOrder(true);
  const beforeWon = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: engineerId } });
  await applyStudioDispute(won.payment.id, "disputed", "fixture-won-open");
  await applyStudioDispute(won.payment.id, "paid", "fixture-won-close");
  await applyStudioDispute(won.payment.id, "paid", "fixture-won-close");
  balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: engineerId } });
  assert.equal(Number(balance.availableBalance), Number(beforeWon.availableBalance));
  assert.equal(Number(balance.pendingBalance), Number(beforeWon.pendingBalance));
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: won.order.id } })).status, "COMPLETED");

  const retry = await makeOrder();
  const fallback = studioFixtureGateway();
  const keys: string[] = [];
  let ambiguous = true;
  const gateway: StudioGateway = { ...fallback, refund: async (id, amount, key, publicId) => {
    if (id === retry.payment.razorpayPaymentId) { keys.push(key); if (ambiguous) { ambiguous = false; throw new Error("Simulated lost provider response"); } }
    return fallback.refund(id, amount, key, publicId);
  } };
  await processStudioRefunds(Date.now() + 20000, gateway);
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: retry.order.id } })).status, "REFUND_PENDING");
  await processStudioRefunds(Date.now() + 20000, gateway);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1], "Ambiguous retries must reuse the original provider key.");
  assert.equal(await prisma.studioRefund.count({ where: { paymentId: retry.payment.id } }), 1);

  const pending = await makeOrder();
  let creates = 0;
  const pendingGateway: StudioGateway = { ...fallback, refund: async (id, amount, key, publicId) => { creates++; return { ...await fallback.refund(id, amount, key, publicId), status: "pending" }; } };
  await processStudioRefunds(Date.now() + 20000, pendingGateway);
  await processStudioRefunds(Date.now() + 20000, pendingGateway);
  assert.equal(creates, 1, "A pending provider refund must not be submitted twice.");
  const pendingRow = await prisma.studioRefund.findFirstOrThrow({ where: { paymentId: pending.payment.id } });
  await recordStudioRefund(pending.payment.id, { id: pendingRow.providerRefundId!, payment_id: pending.payment.razorpayPaymentId!, amount: 10000, currency: "INR", status: "failed" });
  await processStudioRefunds(Date.now() + 20000, pendingGateway);
  assert.equal(creates, 1, "Failed refunds require explicit admin authorization to retry.");
  await reviewStudioFinance(pending.order.publicId, "RETRY_REFUND", "Provider confirmed failure; authorize a new refund request", null);
  await processStudioRefunds(Date.now() + 20000, fallback);
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: pending.order.id } })).status, "REFUNDED");

  const late = await makeOrder();
  await prisma.studioServiceOrder.update({ where: { id: late.order.id }, data: { status: "CANCELLED", paidAt: null, paymentStatus: "UNPAID" } });
  await prisma.studioPayment.update({ where: { id: late.payment.id }, data: { status: "AUTHORIZED", capturedAt: null } });
  const result = await recoverStudioPayments(Date.now() + 20000, fallback);
  assert.ok(result.checked > 0);
  assert.equal((await prisma.studioPayment.findUniqueOrThrow({ where: { id: late.payment.id } })).status, "CAPTURED");
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: late.order.id } })).status, "REFUND_PENDING", "Late capture must not reactivate a cancelled project.");
  console.log("PASS: earning reversal, dispute hold/release, held-fund refund, durable ambiguous retries, pending/failed refund recovery, admin retry and late capture recovery. Provider simulated; no live transactions.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
