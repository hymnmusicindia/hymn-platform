import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { localPrivateStorage } from "../lib/private-storage";
import { confirmPersistedPayment } from "../lib/payment-webhooks";
import { appointStudioEngineer, updateStudioEngineer } from "../lib/admin-studio-engineers";
import { approveStudioDelivery, assertStudioParticipant, cancelStudioOrder, confirmStudioPayment, createStudioAmendmentPayment, createStudioDelivery, createStudioOrder, createStudioPayment, createStudioRevisionPayment, handoffStudioOrderToRelease, proposeStudioAmendment, requestStudioRevision, respondToStudioOrder, reviewStudioOrder, runStudioAutomation, sendStudioMessage, transitionStudioOrder } from "../lib/studio-services";

async function main() {
  assert.match(process.env.DATABASE_URL ?? "", /^postgres(?:ql)?:\/\//i);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [customer, engineerUser, producerUser, outsider] = await Promise.all([
    prisma.user.create({ data: { googleId: `studio-customer-${stamp}`, name: "Studio Customer", email: `studio-customer-${stamp}@example.test` } }),
    prisma.user.create({ data: { googleId: `studio-engineer-${stamp}`, name: "Studio Engineer", email: `studio-engineer-${stamp}@example.test` } }),
    prisma.user.create({ data: { googleId: `studio-producer-${stamp}`, name: "Beat Producer", email: `studio-producer-${stamp}@example.test` } }),
    prisma.user.create({ data: { googleId: `studio-outsider-${stamp}`, name: "Studio Outsider", email: `studio-outsider-${stamp}@example.test` } }),
  ]);
  const appointedUser = await prisma.user.create({ data: { googleId: `studio-appointed-${stamp}`, name: "Appointed Engineer", email: `studio-appointed-${stamp}@example.test` } });
  const appointmentInput = {
    userId: appointedUser.id, professionalName: "Appointed Engineer", slug: `appointed-engineer-${stamp}`, profilePhotoUrl: null, bio: "An experienced mix engineer appointed through Studio operations.", specialties: ["Mixing", "Mastering"], genres: ["Pop", "R&B"], availability: "AVAILABLE" as const, maxActiveOrders: 4, verificationState: "VERIFIED" as const, sellerState: "ACTIVE" as const, payoutState: "PENDING" as const,
    listing: { title: "Mix and master", description: "A complete mix and master prepared for commercial release.", standardPrice: 2500, beatCustomerPrice: 2000, includedRevisions: 2, additionalRevisionPrice: 500, turnaroundDays: 5, sourceRequirements: ["Consolidated stems", "Reference mix"], deliverables: ["24-bit WAV", "320 kbps MP3"], instantAccept: false, active: true, paused: false },
  };
  const appointed = await appointStudioEngineer(appointmentInput, customer.id, `appoint-${stamp}`);
  assert.equal(appointed.listings.length, 1);
  assert.equal((await prisma.contributorParty.findUniqueOrThrow({ where: { claimedByUserId: appointedUser.id }, include: { engineerProfile: true } })).engineerProfile?.id, appointed.id);
  assert.equal(await prisma.notification.count({ where: { userId: appointedUser.id, eventKey: `studio:engineer-appointed:${appointed.id}` } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { action: "STUDIO_ENGINEER_APPOINTED", entityId: String(appointed.id) } }), 1);
  await assert.rejects(() => appointStudioEngineer(appointmentInput, customer.id, `appoint-again-${stamp}`), /already has an engineer profile/i);
  await updateStudioEngineer(appointed.id, { ...appointmentInput, professionalName: "Appointed Engineer Updated", sellerState: "PAUSED", listing: { ...appointmentInput.listing, active: false, paused: true } }, customer.id, `update-${stamp}`);
  const updatedAppointment = await prisma.engineerProfile.findUniqueOrThrow({ where: { id: appointed.id }, include: { listings: true } });
  assert.equal(updatedAppointment.professionalName, "Appointed Engineer Updated");
  assert.equal(updatedAppointment.sellerState, "PAUSED");
  assert.equal(updatedAppointment.listings[0].active, false);
  assert.equal(await prisma.auditLog.count({ where: { action: "STUDIO_ENGINEER_UPDATED", entityId: String(appointed.id) } }), 1);
  const party = await prisma.contributorParty.create({ data: { publicId: `HYM_STUDIO_${stamp}`, professionalName: "Studio Engineer", displayName: "Studio Engineer", claimedByUserId: engineerUser.id, createdByUserId: engineerUser.id, identityState: "CLAIMED" } });
  const engineer = await prisma.engineerProfile.create({ data: { contributorPartyId: party.id, slug: `studio-engineer-${stamp}`, professionalName: "Studio Engineer", availability: "AVAILABLE", maxActiveOrders: 2, verificationState: "VERIFIED" } });
  const listing = await prisma.studioServiceListing.create({ data: { engineerProfileId: engineer.id, title: "Integration Mix & Master", description: "Integration fixture", standardPrice: 2000, beatCustomerPrice: 1500, includedRevisions: 2, additionalRevisionPrice: 400, turnaroundDays: 5, sourceRequirements: { stems: true }, deliverables: { wav: true } } });
  const producerParty = await prisma.contributorParty.create({ data: { publicId: `HYM_PRODUCER_${stamp}`, professionalName: "Beat Producer", displayName: "Beat Producer", claimedByUserId: producerUser.id, createdByUserId: producerUser.id, identityState: "CLAIMED" } });
  const beatUpload = await prisma.upload.create({ data: { userId: producerUser.id, kind: "AUDIO", storageKey: `studio/${stamp}/asmaan.mp3`, fileName: "asmaan.mp3", mimeType: "audio/mpeg", sizeBytes: 100 } });
  const beat = await prisma.beat.create({ data: { userId: producerUser.id, producerPartyId: producerParty.id, title: "Asmaan", bpm: 96, genre: "Hip-Hop", mood: "Atmospheric", keySignature: "C Minor", priceCents: 25000, generalPriceCents: 25000, exclusivePriceCents: 200000, status: "PUBLISHED", enabled: true, audioUploadId: beatUpload.id } });
  const purchase = await prisma.beatPurchase.create({ data: { userId: customer.id, beatId: beat.id, producerPartyId: producerParty.id, licenseType: "general", licenseUrl: `/api/beat-purchases/general-${stamp}/license`, licenseUploadedAt: new Date(), hasAccess: true } });

  const order = await createStudioOrder({ customerId: customer.id, listingPublicId: listing.publicId, projectTitle: "Integration Song", beatPurchaseId: purchase.id, idempotencyKey: `quote-${stamp}`, termsAccepted: true });
  const duplicateOrder = await createStudioOrder({ customerId: customer.id, listingPublicId: listing.publicId, projectTitle: "Ignored duplicate", idempotencyKey: `quote-${stamp}`, termsAccepted: true });
  assert.equal(duplicateOrder.id, order.id);
  assert.equal(Number(order.finalPrice), 1500);
  assert.equal(order.termsVersion, "2026-09-24");
  assert.ok(order.termsAcceptedAt instanceof Date);
  await assert.rejects(() => assertStudioParticipant(order.publicId, outsider.id), /not found/i);
  assert.equal((await assertStudioParticipant(order.publicId, customer.id)).id, order.id);
  assert.equal((await assertStudioParticipant(order.publicId, engineerUser.id)).id, order.id);
  const payment = await createStudioPayment({ orderPublicId: order.publicId, customerId: customer.id, idempotencyKey: `initial-payment-${stamp}` });
  await confirmStudioPayment({ razorpayOrderId: payment.razorpayOrderId, paymentId: `pay-initial-${stamp}`, amountMinor: 150000, currency: "INR", source: "webhook" });
  await respondToStudioOrder({ orderPublicId: order.publicId, engineerUserId: engineerUser.id, accept: true });
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "AWAITING_SOURCE_FILES");
  const sourceUpload = await localPrivateStorage.upload({ ownerUserId: customer.id, assetType: "private_studio_source", fileName: "asmaan-stems.zip", mimeType: "application/zip", bytes: Buffer.from(`PK source package ${stamp}`) });
  await prisma.studioFile.create({ data: { orderId: order.id, assetId: sourceUpload.id, uploaderId: customer.id, category: "SOURCE", version: 1 } });
  await transitionStudioOrder({ orderId: order.id, to: "IN_PROGRESS", actorUserId: customer.id, actorType: "CUSTOMER", reason: "Source files uploaded", correlationId: `source-${stamp}` });
  await sendStudioMessage({ orderPublicId: order.publicId, userId: customer.id, body: "The vocal stems are uploaded and ready.", idempotencyKey: `message-${stamp}` });
  assert.equal(await prisma.studioMessage.count({ where: { orderId: order.id, idempotencyKey: `message-${stamp}` } }), 1);

  async function delivery(version: number) {
    const uploaded = await localPrivateStorage.upload({ ownerUserId: engineerUser.id, assetType: "private_studio_delivery", fileName: `delivery-${version}.zip`, mimeType: "application/zip", bytes: Buffer.from(`PK fixture delivery ${version} ${stamp}`) });
    const asset = await prisma.storedAsset.findUniqueOrThrow({ where: { id: uploaded.id } });
    const file = await prisma.studioFile.create({ data: { orderId: order.id, assetId: asset.id, uploaderId: engineerUser.id, category: "DELIVERY", version } });
    if (version === 1) {
      assert.equal((await localPrivateStorage.createAuthorizedRead({ assetId: asset.id, requesterUserId: customer.id, isAdmin: false })).bytes.length, Number(asset.byteSize));
      assert.equal((await localPrivateStorage.createAuthorizedRead({ assetId: asset.id, requesterUserId: engineerUser.id, isAdmin: false })).bytes.length, Number(asset.byteSize));
      assert.equal((await localPrivateStorage.createAuthorizedRead({ assetId: asset.id, requesterUserId: 0, isAdmin: true })).bytes.length, Number(asset.byteSize));
      await assert.rejects(() => localPrivateStorage.createAuthorizedRead({ assetId: asset.id, requesterUserId: outsider.id, isAdmin: false }), /Forbidden/);
    }
    return createStudioDelivery({ orderPublicId: order.publicId, engineerUserId: engineerUser.id, studioFileIds: [file.id], note: `Delivery ${version}`, idempotencyKey: `delivery-${version}-${stamp}` });
  }

  const delivery1 = await delivery(1);
  const concurrentRevision = await Promise.allSettled([
    requestStudioRevision({ orderPublicId: order.publicId, customerId: customer.id, deliveryId: delivery1.id, feedback: "Raise the lead vocal.", idempotencyKey: `revision-1a-${stamp}` }),
    requestStudioRevision({ orderPublicId: order.publicId, customerId: customer.id, deliveryId: delivery1.id, feedback: "Competing simultaneous request.", idempotencyKey: `revision-1b-${stamp}` }),
  ]);
  assert.equal(concurrentRevision.filter(result => result.status === "fulfilled").length, 1, "Only one simultaneous revision request may succeed.");
  assert.equal(await prisma.studioRevision.count({ where: { orderId: order.id } }), 1);
  const revision1 = concurrentRevision.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof requestStudioRevision>>> => result.status === "fulfilled")!.value;
  assert.equal(revision1.included, true);
  await transitionStudioOrder({ orderId: order.id, to: "IN_PROGRESS", actorUserId: engineerUser.id, actorType: "ENGINEER", reason: "Revision work started", correlationId: `revision-work-1-${stamp}` });
  const delivery2 = await delivery(2);
  const revision2 = await requestStudioRevision({ orderPublicId: order.publicId, customerId: customer.id, deliveryId: delivery2.id, feedback: "Reduce the delay throw.", idempotencyKey: `revision-2-${stamp}` });
  assert.equal(revision2.included, true);
  await transitionStudioOrder({ orderId: order.id, to: "IN_PROGRESS", actorUserId: engineerUser.id, actorType: "ENGINEER", reason: "Revision work started", correlationId: `revision-work-2-${stamp}` });
  const delivery3 = await delivery(3);
  const revision3 = await requestStudioRevision({ orderPublicId: order.publicId, customerId: customer.id, deliveryId: delivery3.id, feedback: "Provide a louder alternate master.", idempotencyKey: `revision-3-${stamp}` });
  assert.equal(revision3.paymentRequired, true);
  const revisionPayment = await createStudioRevisionPayment({ orderPublicId: order.publicId, customerId: customer.id, revisionId: revision3.id, idempotencyKey: `revision-payment-${stamp}` });
  await assert.rejects(() => confirmStudioPayment({ razorpayOrderId: revisionPayment.razorpayOrderId, paymentId: `pay-revision-wrong-${stamp}`, amountMinor: 39999, currency: "INR", source: "webhook" }), /amount does not match/i);
  assert.equal((await prisma.studioRevision.findUniqueOrThrow({ where: { id: revision3.id } })).status, "PAYMENT_REQUIRED");
  assert.equal((await prisma.studioPayment.findUniqueOrThrow({ where: { id: revisionPayment.id } })).status, "CREATED");
  await confirmPersistedPayment({ razorpayOrderId: revisionPayment.razorpayOrderId, paymentId: `pay-revision-${stamp}`, amountMinor: 40000, currency: "INR", source: "webhook" });
  await confirmPersistedPayment({ razorpayOrderId: revisionPayment.razorpayOrderId, paymentId: `pay-revision-${stamp}`, amountMinor: 40000, currency: "INR", source: "webhook" });
  assert.equal(await prisma.studioPayment.count({ where: { razorpayPaymentId: `pay-revision-${stamp}` } }), 1);
  assert.equal(await prisma.studioRevision.count({ where: { orderId: order.id, sequence: 3 } }), 1);
  await transitionStudioOrder({ orderId: order.id, to: "IN_PROGRESS", actorUserId: engineerUser.id, actorType: "ENGINEER", reason: "Paid revision work started", correlationId: `revision-work-3-${stamp}` });
  const amendment = await proposeStudioAmendment({ orderPublicId: order.publicId, engineerUserId: engineerUser.id, description: "Create instrumental alternate", amount: 300 });
  const amendmentPayment = await createStudioAmendmentPayment({ orderPublicId: order.publicId, customerId: customer.id, amendmentPublicId: amendment.publicId, idempotencyKey: `amendment-payment-${stamp}` });
  await confirmPersistedPayment({ razorpayOrderId: amendmentPayment.razorpayOrderId, paymentId: `pay-amendment-${stamp}`, amountMinor: 30000, currency: "INR", source: "webhook" });
  assert.equal((await prisma.studioAmendment.findUniqueOrThrow({ where: { id: amendment.id } })).status, "ACCEPTED");
  const delivery4 = await delivery(4);
  await approveStudioDelivery({ orderPublicId: order.publicId, customerId: customer.id, idempotencyKey: `approval-${stamp}` });
  const retainedFiles = await prisma.studioFile.findMany({ where: { orderId: order.id }, include: { asset: true } });
  assert.ok(retainedFiles.filter(file => file.category === "DELIVERY" && file.version < 4).every(file => file.asset.retentionUntil instanceof Date), "Superseded deliveries must receive a cleanup date.");
  assert.equal(retainedFiles.find(file => file.category === "DELIVERY" && file.version === 4)?.asset.retentionUntil, null, "The approved master must remain durable for distribution.");
  const earning = await prisma.studioEarning.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(Number(earning.grossAmount), 2200, "Initial, revision, and accepted amendment revenue must settle together.");
  assert.equal(await prisma.walletTransaction.count({ where: { idempotencyKey: `studio-order:${order.id}:wallet` } }), 1);
  await approveStudioDelivery({ orderPublicId: order.publicId, customerId: customer.id, idempotencyKey: `approval-replay-${stamp}` });
  assert.equal(await prisma.walletTransaction.count({ where: { idempotencyKey: `studio-order:${order.id}:wallet` } }), 1);
  const finalFile = await prisma.studioDeliveryFile.findFirstOrThrow({ where: { deliveryId: delivery4.id } });
  const handoff = await handoffStudioOrderToRelease({ orderPublicId: order.publicId, customerId: customer.id, finalStudioFileId: finalFile.studioFileId });
  const replay = await handoffStudioOrderToRelease({ orderPublicId: order.publicId, customerId: customer.id, finalStudioFileId: finalFile.studioFileId });
  assert.equal(replay.releaseId, handoff.releaseId);
  assert.equal(await prisma.studioReleaseHandoff.count({ where: { orderId: order.id } }), 1);
  const provenance = await prisma.studioReleaseHandoff.findUniqueOrThrow({ where: { orderId: order.id } });
  assert.equal(provenance.rightsMapping, "BEAT_LICENSE:general");
  assert.equal(provenance.beatPurchaseId, purchase.id);
  const release = await prisma.release.findUniqueOrThrow({ where: { id: handoff.releaseId }, include: { tracks: true } });
  assert.match(release.tracks[0].audioUrl ?? "", new RegExp(`/api/assets/${finalFile.studioFileId}|/api/assets/`));
  assert.equal((release.metadata as Record<string, unknown>).contentType, "Non-Exclusive Licensed");
  assert.equal((release.metadata as Record<string, unknown>).license_receipt_url, purchase.licenseUrl);
  const credits = await prisma.trackContribution.findMany({ where: { trackId: release.tracks[0].id } });
  assert.equal(credits.filter(row => row.partyId === party.id && ["MIX_ENGINEER", "MASTERING_ENGINEER"].includes(row.role)).length, 2);
  assert.equal(credits.filter(row => row.partyId === producerParty.id && row.role === "PRODUCER").length, 1);
  const review = await reviewStudioOrder({ orderPublicId: order.publicId, customerId: customer.id, rating: 5, comment: "Clear workflow and excellent master." });
  assert.equal(review.rating, 5);
  assert.equal((await prisma.engineerProfile.findUniqueOrThrow({ where: { id: engineer.id } })).ratingCount, 1);
  const unpaidCancellation = await createStudioOrder({ customerId: customer.id, listingPublicId: listing.publicId, projectTitle: "Unpaid cancellation", idempotencyKey: `cancel-unpaid-order-${stamp}`, termsAccepted: true });
  await cancelStudioOrder({ orderPublicId: unpaidCancellation.publicId, customerId: customer.id, reason: "Changed plans", idempotencyKey: `cancel-unpaid-${stamp}` });
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: unpaidCancellation.id } })).status, "CANCELLED");
  const paidCancellation = await createStudioOrder({ customerId: customer.id, listingPublicId: listing.publicId, projectTitle: "Paid cancellation", idempotencyKey: `cancel-paid-order-${stamp}`, termsAccepted: true });
  const cancellationPayment = await createStudioPayment({ orderPublicId: paidCancellation.publicId, customerId: customer.id, idempotencyKey: `cancel-payment-${stamp}` });
  await confirmStudioPayment({ razorpayOrderId: cancellationPayment.razorpayOrderId, paymentId: `pay-cancel-${stamp}`, amountMinor: 200000, currency: "INR", source: "webhook" });
  await cancelStudioOrder({ orderPublicId: paidCancellation.publicId, customerId: customer.id, reason: "Cancelled before work began", idempotencyKey: `cancel-paid-${stamp}` });
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: paidCancellation.id } })).status, "REFUND_PENDING");
  await runStudioAutomation();
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: paidCancellation.id } })).status, "REFUNDED");
  assert.equal((await prisma.studioPayment.findUniqueOrThrow({ where: { id: cancellationPayment.id } })).status, "REFUNDED");
  async function completedHandoff(projectTitle: string, beatPurchaseId?: number) {
    const ready = await createStudioOrder({ customerId: customer.id, listingPublicId: listing.publicId, projectTitle, beatPurchaseId, idempotencyKey: `handoff-${projectTitle}-${stamp}`, termsAccepted: true });
    const uploaded = await localPrivateStorage.upload({ ownerUserId: engineerUser.id, assetType: "private_studio_delivery", fileName: `${projectTitle}.zip`, mimeType: "application/zip", bytes: Buffer.from(`PK ${projectTitle} ${stamp}`) });
    const file = await prisma.studioFile.create({ data: { orderId: ready.id, assetId: uploaded.id, uploaderId: engineerUser.id, category: "DELIVERY", version: 1 } });
    await prisma.studioDelivery.create({ data: { orderId: ready.id, version: 1, files: { create: { studioFileId: file.id, role: "MASTER" } } } });
    await prisma.studioServiceOrder.update({ where: { id: ready.id }, data: { status: "COMPLETED", currentDeliveryVersion: 1, completedAt: new Date() } });
    const result = await handoffStudioOrderToRelease({ orderPublicId: ready.publicId, customerId: customer.id, finalStudioFileId: file.id });
    return { ready, result, release: await prisma.release.findUniqueOrThrow({ where: { id: result.releaseId } }), provenance: await prisma.studioReleaseHandoff.findUniqueOrThrow({ where: { orderId: ready.id } }) };
  }
  const exclusiveBeat = await prisma.beat.create({ data: { userId: producerUser.id, producerPartyId: producerParty.id, title: "Asmaan Exclusive", bpm: 96, genre: "Hip-Hop", mood: "Atmospheric", keySignature: "C Minor", priceCents: 25000, generalPriceCents: 25000, exclusivePriceCents: 200000, status: "EXCLUSIVELY_SOLD", enabled: false, audioUploadId: beatUpload.id } });
  const exclusivePurchase = await prisma.beatPurchase.create({ data: { userId: customer.id, beatId: exclusiveBeat.id, producerPartyId: producerParty.id, licenseType: "exclusive", licenseUrl: `/api/beat-purchases/exclusive-${stamp}/license`, licenseUploadedAt: new Date(), hasAccess: true } });
  const exclusiveHandoff = await completedHandoff("Exclusive Studio Song", exclusivePurchase.id);
  assert.equal((exclusiveHandoff.release.metadata as Record<string, unknown>).contentType, "Exclusive Licensed");
  assert.equal(exclusiveHandoff.provenance.rightsMapping, "BEAT_LICENSE:exclusive");
  const externalHandoff = await completedHandoff("Original External Production");
  assert.equal((externalHandoff.release.metadata as Record<string, unknown>).contentType, "Original");
  assert.equal(externalHandoff.provenance.rightsMapping, "CUSTOMER_ORIGINAL");
  assert.equal(externalHandoff.provenance.beatPurchaseId, null);
  await prisma.engineerProfile.update({ where: { id: engineer.id }, data: { maxActiveOrders: 1 } });
  const [capacityOrderA, capacityOrderB] = await Promise.all([
    createStudioOrder({ customerId: customer.id, listingPublicId: listing.publicId, projectTitle: "Capacity A", idempotencyKey: `capacity-order-a-${stamp}`, termsAccepted: true }),
    createStudioOrder({ customerId: outsider.id, listingPublicId: listing.publicId, projectTitle: "Capacity B", idempotencyKey: `capacity-order-b-${stamp}`, termsAccepted: true }),
  ]);
  const [capacityPaymentA, capacityPaymentB] = await Promise.all([
    createStudioPayment({ orderPublicId: capacityOrderA.publicId, customerId: customer.id, idempotencyKey: `capacity-payment-a-${stamp}` }),
    createStudioPayment({ orderPublicId: capacityOrderB.publicId, customerId: outsider.id, idempotencyKey: `capacity-payment-b-${stamp}` }),
  ]);
  await Promise.all([
    confirmStudioPayment({ razorpayOrderId: capacityPaymentA.razorpayOrderId, paymentId: `pay-capacity-a-${stamp}`, amountMinor: 200000, currency: "INR", source: "webhook" }),
    confirmStudioPayment({ razorpayOrderId: capacityPaymentB.razorpayOrderId, paymentId: `pay-capacity-b-${stamp}`, amountMinor: 200000, currency: "INR", source: "webhook" }),
  ]);
  const capacityStates = await prisma.studioServiceOrder.findMany({ where: { id: { in: [capacityOrderA.id, capacityOrderB.id] } }, select: { status: true } });
  assert.equal(capacityStates.filter(order => order.status === "AWAITING_ENGINEER_ACCEPTANCE").length, 1, "Capacity one must admit exactly one paid order.");
  assert.equal(capacityStates.filter(order => order.status === "REFUND_PENDING").length, 1, "The capacity race loser must be routed to refund.");
  await prisma.engineerProfile.update({ where: { id: engineer.id }, data: { maxActiveOrders: 10 } });
  console.log("Studio lifecycle integration passed: idempotent quote/payment, acceptance, 2 included revisions, paid revision, delivery, settlement, and release handoff.");
}
main().finally(() => prisma.$disconnect());
