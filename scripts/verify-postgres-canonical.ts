import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { createOrder, createPasswordUser, findUserByEmail, getCheckoutOrderByRazorpayId, listBeats, completeCheckoutOrder, listReleasesByUser } from "../lib/db";
import { createOrRefreshSubscription, createReleaseAuditLog, getDetailedReleaseById, getDistributionQueueSummary, listAllDetailedReleases, listReleaseAuditLogs, listTracksByRelease } from "../lib/distribution-db";

async function main() {
  assert.match(process.env.DATABASE_URL ?? "", /^postgres(?:ql)?:\/\//i, "Disposable PostgreSQL URL is required.");
  const referrer = await prisma.user.create({ data: { googleId: "phase3-referrer", name: "Referrer", email: "referrer@phase3.invalid", referralCode: "PHASE3REF" } });
  const created = await createPasswordUser({ name: "Canonical User", email: "canonical@phase3.invalid", passwordHash: "test-hash-not-a-credential", role: "customer", referralCode: "PHASE3REF" });
  assert.ok(created);
  const persisted = await findUserByEmail("CANONICAL@PHASE3.INVALID");
  assert.equal(persisted?.id, created.id);
  assert.equal(persisted?.passwordHash, "test-hash-not-a-credential");
  assert.equal(persisted?.referredBy, referrer.id);
  assert.equal(await prisma.referral.count({ where: { referredUserId: created.id } }), 1);

  const upload = await prisma.upload.create({ data: { userId: referrer.id, kind: "AUDIO", storageKey: "phase3/audio", fileName: "phase3.mp3", mimeType: "audio/mpeg", sizeBytes: 1 } });
  const beat = await prisma.beat.create({ data: { userId: referrer.id, title: "Persisted Beat", bpm: 100, genre: "test", mood: "test", keySignature: "C", priceCents: 1000, audioUploadId: upload.id, enabled: true } });
  const beats = await listBeats();
  assert.deepEqual(beats.map(row => row.id), [beat.id], "PostgreSQL beat listing must not include demo memory rows.");

  const subscription = await createOrRefreshSubscription(created.id, "basic");
  assert.equal(subscription?.userId, created.id);
  assert.equal(await prisma.subscription.count({ where: { userId: created.id } }), 1);

  const order = await createOrder({ userId: created.id, productId: "beatstore", originalPrice: 10, discountApplied: 0, referralCreditsUsed: 0, finalAmount: 10, couponCode: null, razorpayOrderId: "order_phase3", amount: 10, paymentStatus: "created", items: [{ beatId: beat.id, licenseType: "basic", price: 10 }] });
  assert.equal(await prisma.checkoutOrder.count({ where: { id: order.id } }), 1);
  const completed = await completeCheckoutOrder("order_phase3", "payment_phase3");
  assert.equal(completed?.paymentStatus, "paid");
  assert.equal((await completeCheckoutOrder("order_phase3", "payment_phase3"))?.paymentStatus, "paid");
  await assert.rejects(() => completeCheckoutOrder("order_phase3", "different_payment"), /different payment/);
  assert.equal((await getCheckoutOrderByRazorpayId("order_phase3"))?.razorpayPaymentId, "payment_phase3");

  const summary = await getDistributionQueueSummary();
  assert.equal(summary.currentlyReviewing, 0);
  assert.equal(summary.pendingQueue, 0);
  const release = await prisma.release.create({ data: { userId: created.id, title: "Audit Release", artistName: "Canonical User", genre: "test", releaseDate: new Date(), status: "DRAFT", tracks: { create: { title: "Audit Track", trackNumber: 1, isrc: "PHASE3ISRC" } } } });
  assert.equal((await listReleasesByUser(created.id))[0]?.id, release.id, "Customer release read must use the canonical row.");
  assert.equal((await getDetailedReleaseById(release.id))?.id, release.id, "Admin/distribution release read must use the canonical row.");
  assert.ok((await listAllDetailedReleases()).some(row => row.id === release.id));
  assert.equal((await listTracksByRelease(release.id))[0]?.isrc, "PHASE3ISRC");
  await createReleaseAuditLog({ releaseId: release.id, userId: created.id, action: "PHASE3_CANONICAL_TEST", details: { safe: true } });
  assert.equal((await listReleaseAuditLogs(release.id))[0]?.action, "PHASE3_CANONICAL_TEST");

  console.log("Canonical PostgreSQL integration verification passed.");
}

main().finally(() => prisma.$disconnect());
// vercel trigger 9
