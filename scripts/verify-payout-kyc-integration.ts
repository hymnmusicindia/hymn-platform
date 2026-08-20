import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getPayoutCredential, reviewPayoutCredential, savePayoutCredential } from "../lib/payout/credentials";
import { createPayoutRequest, updatePayoutRequestStatus } from "../lib/payout";

async function main() {
  process.env.PAYOUT_ENCRYPTION_KEY = "fixture-only-payout-encryption-key-with-adequate-entropy";
  process.env.ALLOW_PAYOUT_REQUESTS_DURING_OPEN_QUARTER = "true";
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { googleId: `payout-${stamp}`, name: "Payout Fixture", email: `payout-${stamp}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  const admin = await prisma.user.create({ data: { googleId: `payout-admin-${stamp}`, name: "Payout Admin", email: `payout-admin-${stamp}@example.test`, role: "ADMIN", status: "ACTIVE" } });
  const release = await prisma.release.create({ data: { userId: user.id, title: "Payout Fixture", artistName: user.name, genre: "Test", releaseDate: new Date(), releaseType: "single", status: "LIVE", paymentStatus: "paid" } });
  const line = await prisma.royaltyLineItem.create({ data: { userId: user.id, releaseId: release.id, platform: "Fixture", grossRevenue: 100, netRevenue: 100, statementMonth: new Date("2026-01-01"), sourceKey: `payout-held-${stamp}` } });
  const split = await prisma.splitRecord.create({ data: { releaseId: release.id, ownerUserId: user.id, status: "locked", totalSharePercent: 100 } });
  await prisma.splitEarningLineItem.create({ data: { royaltyLineItemId: line.id, splitRecordId: split.id, recipientUserId: user.id, recipientEmail: user.email, recipientName: user.name, recipientRole: "owner", releaseId: release.id, sharePercent: 100, grossShareAmount: 100, netShareAmount: 100, status: "pending_payout_details" } });
  await prisma.artistPayoutBalance.create({ data: { userId: user.id, availableBalance: 1000, lifetimeEarnings: 1000 } });
  await prisma.walletTransaction.create({ data: { userId: user.id, type: "fixture_credit", amount: 1000, direction: "credit", referenceType: "fixture", referenceId: stamp, idempotencyKey: `fixture-credit-${stamp}`, balanceAfter: 1000 } });

  await savePayoutCredential(user.id, { method: "BANK", legalName: "Payout Fixture", country: "IN", taxResidency: "IN", accountHolderName: "Payout Fixture", bankAccountNumber: "123456789012", ifsc: "HDFC0001234", taxInfo: "ABCDE1234F" });
  const safe = await getPayoutCredential(user.id); assert.equal(safe.bankAccountMasked?.endsWith("9012"), true); assert.equal("bankAccountEncrypted" in safe, false);
  assert.equal(await prisma.walletTransaction.count({ where: { userId: user.id, type: "earning_release" } }), 0);
  await assert.rejects(() => createPayoutRequest(user.id, { amount: 800, method: "BANK" }), /manually verify/);
  const review = await reviewPayoutCredential(user.id, { status: "verified", note: "Identity and masked bank evidence manually reviewed.", actorId: admin.id }); assert.equal(review.releasedEarnings, 1);
  let balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: user.id } }); assert(new Prisma.Decimal(balance.availableBalance).equals(1100));

  const attempts = await Promise.allSettled([createPayoutRequest(user.id, { amount: 800, method: "BANK" }), createPayoutRequest(user.id, { amount: 800, method: "BANK" })]);
  assert.equal(attempts.filter(row => row.status === "fulfilled").length, 1); assert.equal(attempts.filter(row => row.status === "rejected").length, 1);
  const request = (attempts.find(row => row.status === "fulfilled") as PromiseFulfilledResult<{ id: number }>).value;
  balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: user.id } }); assert(new Prisma.Decimal(balance.availableBalance).equals(300)); assert(new Prisma.Decimal(balance.pendingBalance).equals(800));
  const reservation = await prisma.walletTransaction.findUniqueOrThrow({ where: { idempotencyKey: `payout:${request.id}:reservation` } }); assert(new Prisma.Decimal(reservation.amount).isZero());
  await assert.rejects(() => updatePayoutRequestStatus({ requestId: request.id, status: "paid", actorId: admin.id, paymentReference: `UTR-${stamp}`, paymentMethod: "NEFT", paymentDate: new Date(), paidAmount: 784 }), /cannot move/);
  await updatePayoutRequestStatus({ requestId: request.id, status: "under_review", actorId: admin.id });
  await updatePayoutRequestStatus({ requestId: request.id, status: "approved", actorId: admin.id });
  await updatePayoutRequestStatus({ requestId: request.id, status: "processing", actorId: admin.id });
  await updatePayoutRequestStatus({ requestId: request.id, status: "paid", actorId: admin.id, paymentReference: `UTR-${stamp}`, paymentMethod: "NEFT", paymentDate: new Date("2026-07-26"), paidAmount: 784 });
  balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: user.id } }); assert(new Prisma.Decimal(balance.pendingBalance).isZero()); assert(new Prisma.Decimal(balance.lifetimePaid).equals(784));
  const payoutLedger = await prisma.walletTransaction.findMany({ where: { userId: user.id, referenceType: "payout_request", referenceId: String(request.id) } }); assert(new Prisma.Decimal(payoutLedger.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0))).equals(-800));
  const paid = await prisma.payoutRequest.findUniqueOrThrow({ where: { id: request.id }, include: { events: { orderBy: { createdAt: "asc" } } } }); assert.equal(paid.paymentReference, `UTR-${stamp}`); assert.equal(paid.status, "PAID"); assert.deepEqual(paid.events.map(event => event.newStatus), ["requested", "under_review", "approved", "processing", "paid"]);
  const second = await prisma.user.create({ data: { googleId: `payout-second-${stamp}`, name: "Second Payout", email: `payout-second-${stamp}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  await savePayoutCredential(second.id, { method: "UPI", legalName: "Second Payout", country: "IN", upiId: "second.fixture@upi" }); await reviewPayoutCredential(second.id, { status: "verified", note: "Manual UPI profile review passed.", actorId: admin.id });
  await prisma.artistPayoutBalance.create({ data: { userId: second.id, availableBalance: 600, lifetimeEarnings: 600 } }); await prisma.walletTransaction.create({ data: { userId: second.id, type: "fixture_credit", amount: 600, direction: "credit", referenceType: "fixture", referenceId: `${stamp}-second`, idempotencyKey: `fixture-credit-second-${stamp}`, balanceAfter: 600 } });
  const secondRequest = await createPayoutRequest(second.id, { amount: 500, method: "UPI" }); await updatePayoutRequestStatus({ requestId: secondRequest.id, status: "under_review", actorId: admin.id }); await updatePayoutRequestStatus({ requestId: secondRequest.id, status: "approved", actorId: admin.id }); await updatePayoutRequestStatus({ requestId: secondRequest.id, status: "processing", actorId: admin.id });
  await assert.rejects(() => updatePayoutRequestStatus({ requestId: secondRequest.id, status: "paid", actorId: admin.id, paymentReference: `UTR-${stamp}`, paymentMethod: "UPI", paymentDate: new Date("2026-07-26"), paidAmount: 490 }), /unique|constraint/i);
  await updatePayoutRequestStatus({ requestId: secondRequest.id, status: "failed", actorId: admin.id, adminNote: "Bank reported a beneficiary validation failure." });
  const secondBalance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: second.id } }); assert(new Prisma.Decimal(secondBalance.availableBalance).equals(600)); assert(new Prisma.Decimal(secondBalance.pendingBalance).isZero());
  const releaseEntry = await prisma.walletTransaction.findUniqueOrThrow({ where: { idempotencyKey: `payout:${secondRequest.id}:release` } }); assert(new Prisma.Decimal(releaseEntry.amount).isZero());
  assert.equal(await prisma.payoutRequestEvent.count({ where: { payoutRequestId: secondRequest.id } }), 5);
  console.log("Manual KYC, payout reservation, immutable artist/admin timeline, transition, failure refund, and payment confirmation verification passed.");
}
main().finally(() => prisma.$disconnect());
// vercel trigger 9
