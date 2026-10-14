import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { razorpay, verifyCapturedRazorpayPayment } from "@/lib/razorpay";
import { REVIEW_TERMS_VERSION, PLAYLIST_CATALOGUE_STATUSES, reviewFeeMinor, reviewDeadline, mayReview, REVIEW_NOT_A_FIT_COPY, listingSchema, reviewSubmissionSchema, reviewDecisionSchema } from "@/lib/playlist-review-domain";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { getPublicAppUrl } from "@/lib/public-app-url";
import type { Prisma } from "@prisma/client";

const reviewInclude = { listing: true } as const;
type Tx = Prisma.TransactionClient;
export async function playlistGatewayCall<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Payment provider response timed out. Do not pay again if charged; reconciliation will recover the result.")), 20000); })]); }
  finally { clearTimeout(timer); }
}
async function mail(tx: Tx, eventKey: string, toEmail: string, subject: string, body: string, userId?: number) {
  await tx.playlistReviewMail.upsert({ where: { eventKey }, create: { eventKey, toEmail, subject, body, userId }, update: {} });
}
async function audit(tx: Tx, actorId: number | null, action: string, id: number, metadata: Prisma.InputJsonValue = {}) {
  await tx.auditLog.create({ data: { actorId, actorType: actorId ? "user" : "system", action, entity: "playlist_review", entityId: String(id), metadata } });
}
export async function playlistReviewSnapshot(userId: number, admin = false) {
  const [listings, requests, ownListings, inbox, releasedTracks] = await Promise.all([
    prisma.playlistReviewListing.findMany({ where: { status: "APPROVED" }, orderBy: [{ isHymn: "desc" }, { name: "asc" }], take: 200 }),
    prisma.playlistReviewRequest.findMany({ where: { customerId: userId }, include: reviewInclude, orderBy: { id: "desc" }, take: 100 }),
    prisma.playlistReviewListing.findMany({ where: admin ? {} : { ownerId: userId }, orderBy: { id: "desc" }, take: 200 }),
    prisma.playlistReviewRequest.findMany({ where: { status: { not: "AWAITING_PAYMENT" }, ...(admin ? {} : { listing: { ownerId: userId } }) }, include: reviewInclude, orderBy: [{ dueAt: "asc" }, { id: "desc" }], take: 200 }),
    prisma.track.findMany({ where: { release: { userId, status: { in: [...PLAYLIST_CATALOGUE_STATUSES] } } }, select: { id: true, title: true, primaryArtist: true, isrc: true, release: { select: { id: true, title: true, artistName: true, artworkUrl: true, status: true } } }, orderBy: [{ releaseId: "desc" }, { trackNumber: "asc" }] }),
  ]);
  // Never expose provider payment identifiers to another curator or the catalogue.
  const safe = (rows: typeof requests) => rows.map(({ razorpayPaymentId: _payment, razorpayOrderId: _order, requestKey: _key, ...row }) => row);
  const owners = admin ? await prisma.user.findMany({ where: { id: { in: ownListings.flatMap(row => row.ownerId ? [row.ownerId] : []) } }, select: { id: true, name: true, email: true } }) : [];
  return { releasedTracks, listings: listings.map(({ moderationNote: _note, ...row }) => row), requests: safe(requests), ownListings: ownListings.map(row => ({ ...row, ...(admin ? { curator: owners.find(owner => owner.id === row.ownerId) || null } : {}) })), inbox: safe(inbox), termsVersion: REVIEW_TERMS_VERSION, checkoutAvailable: Boolean(razorpay) };
}
export async function applyCuratorListing(userId: number, input: unknown) {
  const value = listingSchema.parse(input);
  const url = new URL(value.playlistUrl); url.search = "";
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${url.toString()}))`;
    if (await tx.playlistReviewListing.count({ where: { ownerId: userId, status: "PENDING" } }) >= 5) throw new Error("You already have five applications awaiting review.");
    const existing = await tx.playlistReviewListing.findFirst({ where: { playlistUrl: url.toString(), status: { in: ["PENDING", "APPROVED"] } } });
    if (existing) throw new Error("This playlist is already listed or awaiting review.");
    const row = await tx.playlistReviewListing.create({ data: { name: value.name, playlistUrl: url.toString(), description: value.description, genres: value.genres, feeMinor: value.feeRupees * 100, capacity: value.capacity, ownerId: userId, slug: `curator-${crypto.randomUUID()}` } });
    await audit(tx, userId, "PLAYLIST_CURATOR_APPLIED", row.id, { termsVersion: value.termsVersion, ownershipDeclared: true });
    return row;
  });
}
export async function updateCuratorPricing(userId: number, id: number, feeRupees: number, capacity: number) {
  if (!Number.isInteger(feeRupees) || feeRupees < 10 || feeRupees > 10000 || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw new Error("Use a fee of ₹10–₹10,000 and capacity of 1–100 reviews.");
  return prisma.$transaction(async tx => {
    const row = await tx.playlistReviewListing.findUniqueOrThrow({ where: { id } });
    if (row.isHymn || row.ownerId !== userId) throw new Error("Only the playlist owner may change its independent review fee.");
    const result = await tx.playlistReviewListing.update({ where: { id }, data: { feeMinor: feeRupees * 100, capacity } });
    await audit(tx, userId, "PLAYLIST_CURATOR_PRICING_UPDATED", id, { previousFeeMinor: row.feeMinor, feeMinor: feeRupees * 100, capacity });
    return result;
  });
}
export async function moderateCuratorListing(actorId: number | null, id: number, status: "APPROVED" | "DECLINED" | "PAUSED", note: string) {
  if (note.trim().length < 20) throw new Error("Document ownership verification or the moderation reason (at least 20 characters).");
  return prisma.$transaction(async tx => {
    const listing = await tx.playlistReviewListing.findUniqueOrThrow({ where: { id } });
    const row = await tx.playlistReviewListing.update({ where: { id }, data: { status, moderationNote: note.trim() } });
    await audit(tx, actorId, "PLAYLIST_CURATOR_MODERATED", id, { status, note });
    if (listing.ownerId) { const user = await tx.user.findUniqueOrThrow({ where: { id: listing.ownerId } }); await mail(tx, `listing:${id}:${status}:${row.updatedAt.toISOString()}`, user.email, "Your curator listing update", `${listing.name}: ${status.toLowerCase()}. ${note}`, user.id); }
    return row;
  });
}
export async function createReviewCheckout(userId: number, input: unknown) {
  if (!razorpay) throw new Error("Review checkout is not configured. No payment has been taken.");
  const value = reviewSubmissionSchema.parse(input);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422060, ${value.listingId}::integer)`;
    const listing = await tx.playlistReviewListing.findUniqueOrThrow({ where: { id: value.listingId } });
    if (listing.status !== "APPROVED") throw new Error("This curator is not accepting submissions.");
    if (listing.ownerId === userId) throw new Error("You cannot buy a review of your own music from yourself.");
    const linkedTrack = value.trackId ? await tx.track.findFirst({ where: { id: value.trackId, release: { userId, status: { in: [...PLAYLIST_CATALOGUE_STATUSES] } } }, include: { release: true } }) : null;
    if (value.trackId && !linkedTrack) throw new Error("Choose an eligible track from your own HYMN catalogue, or use the external-track option.");
    if (linkedTrack) { value.trackTitle = linkedTrack.title; value.artistName = linkedTrack.primaryArtist || linkedTrack.release.artistName; }
    let row = await tx.playlistReviewRequest.findUnique({ where: { requestKey: value.requestKey } });
    if (row) {
      const created = await tx.auditLog.findFirst({ where: { action: "PLAYLIST_REVIEW_CHECKOUT_CREATED", entity: "playlist_review", entityId: String(row.id) } });
      const previousTrackId = (created?.metadata as { trackId?: number } | null)?.trackId || null;
      if (previousTrackId !== (value.trackId || null)) throw new Error("Track source changed. Start a new submission before paying.");
    }
    if (row && (row.customerId !== userId || row.listingId !== value.listingId || row.trackUrl !== value.trackUrl || row.trackTitle !== value.trackTitle || row.pitch !== value.pitch || row.artistName !== value.artistName)) throw new Error("This checkout key belongs to different submission details. Start a new submission.");
    if (row && row.status !== "AWAITING_PAYMENT") throw new Error("This review has already been paid or closed. Check My submissions.");
    if (!row) {
      const active = await tx.playlistReviewRequest.count({ where: { listingId: listing.id, OR: [{ status: "IN_REVIEW" }, { status: "AWAITING_PAYMENT", createdAt: { gt: new Date(Date.now() - 30 * 60000) } }] } });
      if (active >= listing.capacity) throw new Error("This curator’s review queue is full. Please try another curator or return later.");
      row = await tx.playlistReviewRequest.create({ data: { requestKey: value.requestKey, listingId: listing.id, customerId: userId, trackTitle: value.trackTitle, artistName: value.artistName, trackUrl: value.trackUrl, pitch: value.pitch, termsVersion: value.termsVersion, amountMinor: reviewFeeMinor(listing.isHymn, listing.feeMinor, Boolean(linkedTrack)) } });
      await audit(tx, userId, "PLAYLIST_REVIEW_CHECKOUT_CREATED", row.id, { amountMinor: row.amountMinor, termsVersion: value.termsVersion, accepted: true, trackId: linkedTrack?.id || null, releaseId: linkedTrack?.releaseId || null, trackSource: linkedTrack ? "hymn_catalogue" : "external" });
    }
    if (!row.razorpayOrderId) {
      const order = await playlistGatewayCall(razorpay!.orders.create({ amount: row.amountMinor, currency: "INR", receipt: `playlist_review_${row.id}`, notes: { product: "playlist_review", reviewId: String(row.id), customerId: String(userId) } }));
      row = await tx.playlistReviewRequest.update({ where: { id: row.id }, data: { razorpayOrderId: String(order.id) } });
    }
    return { reviewId: row.id, orderId: row.razorpayOrderId, amount: row.amountMinor, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID };
  }, { timeout: 30000 });
}
export async function confirmReviewPayment(orderId: string, paymentId: string, customerId?: number) {
  const initial = await prisma.playlistReviewRequest.findUniqueOrThrow({ where: { razorpayOrderId: orderId }, include: reviewInclude });
  if (customerId && initial.customerId !== customerId) throw new Error("Payment does not belong to this customer.");
  const payment = await playlistGatewayCall(verifyCapturedRazorpayPayment({ orderId, paymentId, amountMinor: initial.amountMinor, currency: "INR" }));
  const paidAt = new Date(Number(payment.created_at) * 1000);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422061, ${initial.id}::integer)`;
    const row = await tx.playlistReviewRequest.findUniqueOrThrow({ where: { id: initial.id } });
    if (row.razorpayPaymentId && row.razorpayPaymentId !== paymentId) throw new Error("Conflicting payment identifier.");
    if (row.status !== "AWAITING_PAYMENT") return row;
    const result = await tx.playlistReviewRequest.update({ where: { id: row.id }, data: { status: "IN_REVIEW", razorpayPaymentId: paymentId, paidAt, dueAt: reviewDeadline(paidAt) } });
    const artist = await tx.user.findUniqueOrThrow({ where: { id: row.customerId } });
    const curator = initial.listing.ownerId ? await tx.user.findUniqueOrThrow({ where: { id: initial.listing.ownerId } }) : null;
    await mail(tx, `review:${row.id}:paid:artist`, artist.email, "Your music is ready for a thoughtful review", `${row.trackTitle} has been submitted to ${initial.listing.name}. Feedback is due within seven days of payment. Your fee pays for listening and feedback, not playlist placement.`, artist.id);
    await mail(tx, `review:${row.id}:paid:curator`, curator?.email || "hymnmusicindia@gmail.com", "A new track is waiting for your review", `Review ${row.trackTitle} by ${row.artistName} for ${initial.listing.name} by ${result.dueAt!.toISOString()}. Listen at ${row.trackUrl}. Leave a specific remark and an actionable next step, whether or not it fits.`, curator?.id);
    await audit(tx, row.customerId, "PLAYLIST_REVIEW_PAYMENT_CONFIRMED", row.id, { amountMinor: row.amountMinor, dueAt: result.dueAt!.toISOString() });
    return result;
  });
}
export async function decideReview(actorId: number | null, id: number, input: unknown, admin = false) {
  const value = reviewDecisionSchema.parse(input);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422061, ${id}::integer)`;
    const row = await tx.playlistReviewRequest.findUniqueOrThrow({ where: { id }, include: reviewInclude });
    if (!admin && row.listing.ownerId !== actorId) throw new Error("Only the assigned curator can review this submission.");
    if (!mayReview(row)) throw new Error("This review is already completed, unpaid, or past its deadline. Refresh the queue.");
    const changed = await tx.playlistReviewRequest.updateMany({ where: { id, status: "IN_REVIEW", dueAt: { gt: new Date() } }, data: { ...value, reviewedAt: new Date(), payoutStatus: row.listing.isHymn ? "HYMN_REVENUE" : "HELD" } });
    if (changed.count !== 1) throw new Error("The review deadline passed or its status changed. Refresh the queue.");
    const result = await tx.playlistReviewRequest.findUniqueOrThrow({ where: { id } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: row.customerId } });
    const opening = value.status === "NOT_A_FIT" ? REVIEW_NOT_A_FIT_COPY : "Your music caught this curator’s attention. This is a shortlist, not a promise of placement or streams.";
    await mail(tx, `review:${id}:decision`, user.email, value.status === "NOT_A_FIT" ? "Your curator feedback—and your next step" : "Your track caught a curator’s attention", `${opening}\n\n${row.trackTitle} · ${row.listing.name}\n\nCurator feedback: ${value.remark}\n\nYour next step: ${value.nextStep}`, user.id);
    await audit(tx, actorId, "PLAYLIST_REVIEW_COMPLETED", id, { decision: value.status });
    await mail(tx, `review:${id}:feedback-invite`, user.email, "How was your HYMN playlist review?", `Your review of ${row.trackTitle} is complete. Share an honest rating and a few words about the service at ${getPublicAppUrl()}/dashboard?tab=promotions&reviewView=submissions. All ratings are welcome. Public display of your name, profile photo and review is optional and requires your consent.`, user.id);
    return result;
  });
}

export async function raiseReviewConcern(userId: number, id: number, reason: string) {
  if (reason.trim().length < 20 || reason.length > 1500) throw new Error("Describe your concern in 20–1500 characters.");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422061, ${id}::integer)`;
    const row = await tx.playlistReviewRequest.findUniqueOrThrow({ where: { id } });
    if (row.customerId !== userId) throw new Error("Review not found.");
    if (!["IN_REVIEW", "SHORTLISTED", "NOT_A_FIT"].includes(row.status) || (row.reviewedAt && Date.now() - row.reviewedAt.getTime() > 7 * 86400000)) throw new Error("This review is no longer eligible for an in-app dispute. Please contact HYMN support.");
    const result = await tx.playlistReviewRequest.update({ where: { id }, data: { status: "DISPUTED", payoutStatus: "FROZEN", refundReason: reason.trim() } });
    await mail(tx, `review:${id}:dispute`, "hymnmusicindia@gmail.com", "Playlist review needs HYMN support", `Review ${id}: ${reason.trim()}\n\nNo payout should be made while this concern is open.`);
    await audit(tx, userId, "PLAYLIST_REVIEW_DISPUTED", id, { reason: reason.trim(), previousStatus: row.status });
    return result;
  });
}

export async function resolveReviewConcern(actorId: number | null, id: number, resolution: "REFUND" | "UPHOLD", note: string) {
  if (note.trim().length < 20) throw new Error("Explain the resolution (at least 20 characters).");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422061, ${id}::integer)`;
    const row = await tx.playlistReviewRequest.findUniqueOrThrow({ where: { id }, include: reviewInclude });
    if (row.status !== "DISPUTED") throw new Error("No open dispute exists for this review.");
    if (resolution === "UPHOLD" && !row.reviewedAt) throw new Error("An undelivered review cannot be upheld. Refund it.");
    if (resolution === "UPHOLD" && row.refundId) throw new Error("This payment has already been refunded. Do not restore curator earnings.");
    const completed = resolution === "UPHOLD" ? await tx.auditLog.findFirst({ where: { entity: "playlist_review", entityId: String(id), action: "PLAYLIST_REVIEW_COMPLETED" }, orderBy: { createdAt: "desc" } }) : null;
    const originalDecision = (completed?.metadata as { decision?: string } | null)?.decision;
    if (resolution === "UPHOLD" && !["NOT_A_FIT", "SHORTLISTED"].includes(originalDecision || "")) throw new Error("The original decision could not be verified. Investigate before resolving this concern.");
    const result = await tx.playlistReviewRequest.update({ where: { id }, data: { status: resolution === "REFUND" ? "REFUND_PENDING" : originalDecision, refundReason: note.trim(), payoutStatus: resolution === "REFUND" ? "NOT_EARNED" : row.listing.isHymn ? "HYMN_REVENUE" : "HELD" } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: row.customerId } });
    await mail(tx, `review:${id}:resolution:${resolution}`, user.email, "HYMN has reviewed your concern", `${note}\n\n${resolution === "REFUND" ? "Your fee is queued for refund to the original payment method." : "The delivered review was upheld. Editorial selection remains independent."}`, user.id);
    await audit(tx, actorId, "PLAYLIST_REVIEW_DISPUTE_RESOLVED", id, { resolution, note }); return result;
  });
}

export async function recordCuratorSettlement(actorId: number | null, id: number, reference: string) {
  if (reference.trim().length < 8 || reference.length > 200) throw new Error("Provide the real bank/provider settlement reference.");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422061, ${id}::integer)`;
    const row = await tx.playlistReviewRequest.findUniqueOrThrow({ where: { id }, include: reviewInclude });
    if (row.listing.isHymn || !["NOT_A_FIT", "SHORTLISTED"].includes(row.status) || row.payoutStatus !== "HELD" || !row.reviewedAt || Date.now() - row.reviewedAt.getTime() <= 7 * 86400000) throw new Error("Only completed independent reviews past the seven-day dispute hold can be settled.");
    const credential = row.listing.ownerId ? await tx.payoutCredential.findUnique({ where: { userId: row.listing.ownerId } }) : null;
    if (credential?.status !== "verified" || !credential.verifiedAt) throw new Error("Verify the curator’s payout credentials before recording settlement.");
    await audit(tx, actorId, "PLAYLIST_CURATOR_SETTLEMENT_RECORDED", id, { reference, amountMinor: row.amountMinor, curatorId: row.listing.ownerId });
    return tx.playlistReviewRequest.update({ where: { id }, data: { payoutStatus: "PAID", payoutReference: reference } });
  });
}

export async function runPlaylistReviewAutomation() {
  const result = { reconciled: 0, expired: 0, refunded: 0, reminders: 0, sent: 0, errors: [] as string[] };
  const stopAt = Date.now() + 240000;
  // Reconcile even when a browser closes before payment verification.
  if (razorpay) for (const row of await prisma.playlistReviewRequest.findMany({ where: { status: "AWAITING_PAYMENT", razorpayOrderId: { not: null } }, orderBy: { updatedAt: "asc" }, take: 30 })) {
    if (Date.now() > stopAt) { result.errors.push("Automation budget reached; remaining work is deferred."); return result; }
    try { const payments = await playlistGatewayCall(razorpay.orders.fetchPayments(row.razorpayOrderId!)); const captured = payments.items.find(p => p.status === "captured"); if (captured) { await confirmReviewPayment(row.razorpayOrderId!, captured.id); result.reconciled++; } } catch { result.errors.push(`Payment reconciliation failed for review ${row.id}`); }
    finally { await prisma.playlistReviewRequest.updateMany({ where: { id: row.id }, data: { updatedAt: new Date() } }); }
  }
  for (const row of await prisma.playlistReviewRequest.findMany({ where: { status: "IN_REVIEW", dueAt: { lte: new Date() } }, take: 100 })) {
    const changed = await prisma.playlistReviewRequest.updateMany({ where: { id: row.id, status: "IN_REVIEW", dueAt: { lte: new Date() } }, data: { status: "REFUND_PENDING", refundReason: "The seven-day review deadline was missed.", payoutStatus: "NOT_EARNED" } }); result.expired += changed.count;
  }
  if (razorpay) for (const row of await prisma.playlistReviewRequest.findMany({ where: { status: "REFUND_PENDING", razorpayPaymentId: { not: null } }, orderBy: { updatedAt: "asc" }, take: 30 })) {
    if (Date.now() > stopAt) { result.errors.push("Automation budget reached; remaining work is deferred."); return result; }
    try {
      // Recover a provider refund before issuing another after a lost response.
      const prior = await playlistGatewayCall(razorpay.payments.fetchMultipleRefund(row.razorpayPaymentId!));
      const total = prior.items.filter(r => r.status === "processed").reduce((sum, r) => sum + Number(r.amount), 0);
      if (total < row.amountMinor && prior.items.some(r => r.status !== "processed" && r.status !== "failed")) continue;
      const refund = total >= row.amountMinor ? prior.items.find(r => r.status === "processed")! : await playlistGatewayCall(razorpay.payments.refund(row.razorpayPaymentId!, { amount: row.amountMinor - total, notes: { reviewId: String(row.id), reason: "review_refund" } }));
      if (refund.status !== "processed") continue;
      await prisma.$transaction(async tx => {
        await tx.playlistReviewRequest.update({ where: { id: row.id }, data: { status: "REFUNDED", refundId: refund.id, payoutStatus: "NOT_EARNED" } });
        const user = await tx.user.findUniqueOrThrow({ where: { id: row.customerId } });
        await mail(tx, `review:${row.id}:refund`, user.email, "Your review fee has been refunded", `The curator did not complete your review in seven days. Your ₹${row.amountMinor / 100} fee was refunded to the original payment method; bank processing times may vary. This missed deadline says nothing about your music.`, user.id);
        await audit(tx, null, "PLAYLIST_REVIEW_REFUNDED", row.id, { refundId: refund.id });
      }); result.refunded++;
    } catch { result.errors.push(`Refund needs attention for review ${row.id}`); }
    finally { await prisma.playlistReviewRequest.updateMany({ where: { id: row.id }, data: { updatedAt: new Date() } }); }
  }
  for (const row of await prisma.playlistReviewRequest.findMany({ where: { status: "IN_REVIEW", dueAt: { gt: new Date(), lte: new Date(Date.now() + 86400000) } }, include: reviewInclude, orderBy: { updatedAt: "asc" }, take: 100 })) {
    const user = row.listing.ownerId ? await prisma.user.findUnique({ where: { id: row.listing.ownerId } }) : null;
    await prisma.$transaction(async tx => { await mail(tx, `review:${row.id}:deadline`, user?.email || "hymnmusicindia@gmail.com", "Review reminder: one day remaining", `${row.trackTitle} needs your listening notes and next-step feedback before ${row.dueAt!.toISOString()}. Late reviews are refunded.`, user?.id); await tx.playlistReviewRequest.updateMany({ where: { id: row.id }, data: { updatedAt: new Date() } }); }); result.reminders++;
  }
  for (const job of await prisma.playlistReviewMail.findMany({ where: { status: "PENDING", availableAt: { lte: new Date() }, attempts: { lt: 8 } }, orderBy: { id: "asc" }, take: 100 })) {
    if (Date.now() > stopAt) { result.errors.push("Automation budget reached; remaining work is deferred."); return result; }
    const curatorMail = /:(curator|deadline)$/.test(job.eventKey);
    const target = !job.userId ? "/admin/playlist-reviews" : curatorMail ? "/dashboard?tab=promotions&reviewView=curator" : "/dashboard?tab=promotions&reviewView=submissions";
    const model = { title: job.subject, body: job.body, ctaLabel: "Open your review workspace", ctaUrl: `${getPublicAppUrl()}${target}` };
    const delivery = await sendTransactionalEmail({ to: job.toEmail, subject: job.subject, template: "playlist-review", html: emailLayout(model), text: emailText(model), eventKey: `${job.eventKey}:attempt:${job.attempts}`, userId: job.userId ?? undefined, entityType: "playlist_review" });
    const existing = delivery.status === "duplicate_skipped" ? await prisma.emailLog.findUnique({ where: { eventKey: `${job.eventKey}:attempt:${job.attempts}` }, select: { status: true } }) : null;
    const sent = delivery.status === "sent" || existing?.status === "sent";
    await prisma.playlistReviewMail.update({ where: { id: job.id }, data: { status: sent ? "SENT" : "PENDING", attempts: { increment: 1 }, availableAt: new Date(Date.now() + 15 * 60000) } }); if (sent) result.sent++; else result.errors.push(`Email delivery pending: ${job.id}`);
  }
  return result;
}
