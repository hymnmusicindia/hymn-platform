import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { saveDraftDistributionRelease } from "../lib/distribution-db";
import { claimDistributionSubmission, finishDistributionSubmission } from "../lib/distribution-idempotency";
import { reserveFirstRelease, FIRST_RELEASE_PROMOTION_CODE } from "../lib/first-release-promotion";
import { confirmDistributionPayment, receiveRazorpayEvent, processRazorpayEvent } from "../lib/payment-webhooks";
import { confirmDistributionNonReceipt } from "../lib/distribution-recovery";

assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\/direnote_virtual/);

async function main() {
  const user = await prisma.user.create({ data: { name: "Audit Artist", email: `audit-${Date.now()}@example.test`, googleId: `audit-${Date.now()}` } });
  const other = await prisma.user.create({ data: { name: "Other Artist", email: `other-${Date.now()}@example.test`, googleId: `other-${Date.now()}` } });
  const track = (number: number) => ({ trackTitle: `Recording ${number}`, trackNumber: number, primaryArtist: user.name, audioUrl: "", duration: "180", explicitContent: false, dolbyAtmos: false, contributors: [{ role: "COMPOSER", legalName: "Audit Artist", clientReference: "shared-composer" }] });
  const metadata: any = { artistName: user.name, releaseTitle: "Audit Album", releaseType: "album", releaseDate: "2099-01-10", platforms: ["Spotify"], tracks: Array.from({ length: 10 }, (_, i) => track(i + 1)) };
  const release = await saveDraftDistributionRelease({ userId: user.id, metadata });
  const before = await prisma.track.findMany({ where: { releaseId: release.id }, orderBy: { trackNumber: "asc" } });
  assert.equal(before.length, 10);
  const saved = await saveDraftDistributionRelease({ userId: user.id, draftReleaseId: release.id, metadata });
  assert.deepEqual(saved.tracks.map((row: any) => row.id), before.map(row => row.id), "Draft retries preserve track IDs");
  assert.equal(await prisma.contributorParty.count({ where: { createdByUserId: user.id } }), 1);
  const beforeFailure = await prisma.track.findMany({ where: { releaseId: release.id }, orderBy: { trackNumber: "asc" } });
  const corrupt = { ...metadata, releaseTitle: "Must roll back", tracks: [track(1), { ...track(2), contributors: [{ role: "INVALID", legalName: "Broken" }] }] };
  await assert.rejects(saveDraftDistributionRelease({ userId: user.id, draftReleaseId: release.id, metadata: corrupt }), /Unsupported/);
  assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: release.id } })).title, "Audit Album");
  assert.deepEqual(await prisma.track.findMany({ where: { releaseId: release.id }, orderBy: { trackNumber: "asc" } }), beforeFailure, "Failure on track two rolls back every write");
  await assert.rejects(saveDraftDistributionRelease({ userId: other.id, draftReleaseId: release.id, metadata }), /not found/);
  await prisma.release.update({ where: { id: release.id }, data: { status: "SUBMITTED" } });
  await assert.rejects(saveDraftDistributionRelease({ userId: user.id, draftReleaseId: release.id, metadata }), /no longer a draft/);
  await prisma.release.update({ where: { id: release.id }, data: { status: "DRAFT", paymentStatus: "paid", reviewConfirmedBy: user.id, reviewConfirmedAt: new Date() } });
  await saveDraftDistributionRelease({ userId: user.id, draftReleaseId: release.id, metadata: { ...metadata, tracks: [track(1)] } });
  const edited = await prisma.release.findUniqueOrThrow({ where: { id: release.id } });
  assert.equal(edited.paymentStatus, "paid");
  assert.equal(edited.reviewConfirmedAt, null, "An edit invalidates the review confirmation");
  assert.equal(await prisma.track.count({ where: { releaseId: release.id } }), 1);
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${release.id}::integer)`;
    await assert.rejects(saveDraftDistributionRelease({ userId: user.id, draftReleaseId: release.id, metadata }), /being saved or submitted/);
  });
  const claim = await claimDistributionSubmission(release.id, { version: 1 });
  assert.equal(claim.claimed, true);
  await finishDistributionSubmission(claim.attempt.id, { state: "reconciliation_required", safeError: "Lost response" });
  await prisma.distributionSubmissionAttempt.update({ where: { id: claim.attempt.id }, data: { startedAt: new Date(0) } });
  assert.equal((await claimDistributionSubmission(release.id, { version: 2 })).claimed, false, "Changed payload must not bypass an uncertain prior delivery");
  assert.equal(await prisma.distributionSubmissionAttempt.count({ where: { releaseId: release.id } }), 1);
  await assert.rejects(confirmDistributionNonReceipt({ releaseId: release.id, attemptId: claim.attempt.id, adminId: user.id, evidence: "No", providerReference: "ticket" }), /confirmation/);
  await confirmDistributionNonReceipt({ releaseId: release.id, attemptId: claim.attempt.id, adminId: user.id, evidence: "Provider support confirmed no ingestion exists for this exact attempt.", providerReference: "fixture-ticket-1" });
  assert.equal((await claimDistributionSubmission(release.id, { version: 1 })).claimed, true);
  await finishDistributionSubmission(claim.attempt.id, { state: "failed" });
  const order = await prisma.distributionOrder.create({ data: { userId: user.id, plan: "one_time", amount: 99, razorpayOrderId: `order_audit_${user.id}`, currency: "INR" } });
  const paymentId = `pay_audit_${user.id}`;
  await confirmDistributionPayment({ razorpayOrderId: order.razorpayOrderId, paymentId, userId: user.id, amountMinor: 9900, currency: "INR", source: "browser" });
  for (const eventType of ["payment.failed", "payment.authorized", "payment.captured"]) {
    const payload = { id: `${eventType}_${user.id}`, event: eventType, payload: { payment: { entity: { id: paymentId, order_id: order.razorpayOrderId, amount: 9900, currency: "INR" } } } };
    const event = await receiveRazorpayEvent(Buffer.from(JSON.stringify(payload)), payload);
    await processRazorpayEvent(event.id);
    await processRazorpayEvent(event.id);
    assert.equal((await prisma.distributionOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, "paid", "Duplicate or out-of-order webhook cannot erase captured payment");
  }
  await prisma.promotion.upsert({ where: { code: FIRST_RELEASE_PROMOTION_CODE }, create: { code: FIRST_RELEASE_PROMOTION_CODE, name: "Audit first release", product: "distribution", discountType: "fixed", discountValue: 99, active: true }, update: { active: true } });
  const reservations = await Promise.allSettled(Array.from({ length: 2 }, () => reserveFirstRelease({ userId: other.id, originalAmount: 99, discountAmount: 99, finalAmount: 0 })));
  assert.equal(reservations.filter(result => result.status === "fulfilled").length, 1, "Only one concurrent free entitlement reservation succeeds");
  assert.equal(await prisma.promotionRedemption.count({ where: { userId: other.id } }), 1);
  console.log("Pipeline PostgreSQL regression passed: 10 tracks, stable IDs, rollback, owner/status guards, review invalidation, save lock, uncertain-delivery deduplication, free-release race.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
