import { releaseSaveFailure } from "@/lib/release-track-save";
import { after, NextResponse } from "next/server";
import { submitRelease } from "@/lib/distribution-service";
import { getSession } from "@/lib/session";
import { getDetailedReleaseById, getDistributionPricing, submitPaidDistributionRelease, updatePaidDistributionRelease } from "@/lib/distribution-db";
import { createNotification, getSubscriptionByUserId, listArtistProfilesByUser, touchArtistProfiles } from "@/lib/db";
import { verifyCapturedRazorpayPayment, verifyRazorpaySignature } from "@/lib/razorpay";
import { distributionSubmitSchema } from "@/lib/validation";
import { emailAppUrl, sendReleaseEmail } from "@/lib/email/email-events";
import { attachDistributionOrderRelease, claimDistributionOrderForSubmission, confirmDistributionEntitlement, confirmDistributionPayment, releaseDistributionOrderClaim } from "@/lib/payment-webhooks";
import { consumeRateLimit } from "@/lib/rate-limit";
import { assertDireNoteAssetFormat } from "@/lib/distribution-asset-format";
import { prisma } from "@/lib/prisma";
import { calculateFirstReleasePrice, FIRST_RELEASE_PROMOTION_CODE, redeemFirstRelease, releaseFirstReleaseReservation, reserveFirstRelease, trackFirstReleaseEvent } from "@/lib/first-release-promotion";
import { recordGrowthEvent } from "@/lib/growth";
import { attachReservedSubscriptionRelease, releaseReservedSubscriptionSlot, reserveSubscriptionReleaseSlot, subscriptionHasEntitlement, subscriptionHasReleaseAllowance } from "@/lib/subscription-billing";
import { distributionOrderPriceMatches } from "@/lib/distribution-order-price";
import { resolvePrivateReleaseArtworkUrl } from "@/lib/release-asset-resolution";
import { checkoutPlan } from "@/lib/distribution-checkout-plan";
import { releaseReviewSnapshotHash } from "@/lib/release-review-snapshot";
import { findReleaseIdentifierConflicts } from "@/lib/release-identifier-conflicts";
import { runPendingDistributionQc } from "@/lib/distribution-auto-qc";
import { getPublicAppUrl } from "@/lib/public-app-url";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rate = await consumeRateLimit({ scope: "distribution-payment-verify", identity: String(session.sub), limit: 12, windowSeconds: 15 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many payment verification attempts." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

  try {
    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") || "{}"));
    const parsed = distributionSubmitSchema.parse(payload);
    if (!parsed.draftReleaseId) return NextResponse.json({ error: "Save and review your release draft before submitting." }, { status: 409 });
    let currentDraftReviewHash: string | null = null;
    if (parsed.draftReleaseId) {
      const reviewedDraft = await prisma.release.findFirst({ where: { id: parsed.draftReleaseId, userId: session.sub }, select: { status: true, reviewConfirmedAt: true, reviewConfirmedBy: true, reviewMetadataHash: true } });
      if (!reviewedDraft) return NextResponse.json({ error: "Draft release not found." }, { status: 404 });
      if (reviewedDraft.status === "DRAFT" && (!reviewedDraft.reviewConfirmedAt || reviewedDraft.reviewConfirmedBy !== session.sub)) return NextResponse.json({ error: "Review confirmation is required before payment or submission." }, { status: 409 });
      currentDraftReviewHash = await releaseReviewSnapshotHash(parsed.draftReleaseId, session.sub);
      if (reviewedDraft.status === "DRAFT") {
        if (!reviewedDraft.reviewMetadataHash || reviewedDraft.reviewMetadataHash !== currentDraftReviewHash) return NextResponse.json({ error: "The release changed after it was reviewed. Review and confirm the latest saved version before submitting." }, { status: 409 });
      }
    }
    const persistedOrder = await prisma.distributionOrder.findUnique({ where: { razorpayOrderId: parsed.razorpay_order_id } });
    if (!persistedOrder || persistedOrder.userId !== session.sub) return NextResponse.json({ error: "Distribution order not found." }, { status: 404 });
    const storedQuote = persistedOrder.quoteSnapshot && typeof persistedOrder.quoteSnapshot === "object" && !Array.isArray(persistedOrder.quoteSnapshot)
      ? persistedOrder.quoteSnapshot as Record<string, unknown>
      : null;
    const isFirstReleaseOffer = storedQuote
      ? storedQuote.promotionCode === FIRST_RELEASE_PROMOTION_CODE
      : parsed.promotionCode === FIRST_RELEASE_PROMOTION_CODE;
    if (persistedOrder.fulfilledAt) {
      if (persistedOrder.releaseId === parsed.draftReleaseId && persistedOrder.paymentStatus === "paid" && persistedOrder.razorpayPaymentId === parsed.razorpay_payment_id) {
        const completed = await getDetailedReleaseById(persistedOrder.releaseId!);
        if (completed && completed.userId === session.sub && !["draft", "awaiting_payment"].includes(completed.status)) return NextResponse.json({ release: completed, replayed: true });
      }
      return NextResponse.json({ error: "This payment or entitlement has already been used or is being submitted. Refresh your releases before retrying." }, { status: 409 });
    }
    if (persistedOrder.releaseId && persistedOrder.releaseId !== parsed.draftReleaseId) return NextResponse.json({ error: "This payment belongs to a different release draft." }, { status: 409 });
    if (storedQuote && (
      storedQuote.releaseId !== parsed.draftReleaseId ||
      storedQuote.reviewMetadataHash !== currentDraftReviewHash ||
      storedQuote.plan !== parsed.metadata.plan ||
      storedQuote.trackCount !== parsed.metadata.tracks.length ||
      storedQuote.releaseType !== parsed.metadata.releaseType ||
      JSON.stringify(storedQuote.platforms) !== JSON.stringify(parsed.metadata.platforms) ||
      storedQuote.youtubeContentIdEnabled !== Boolean(parsed.metadata.youtubeContentIdEnabled) ||
      storedQuote.paymentModel !== parsed.metadata.paymentModel ||
      Number(storedQuote.creditsUsed) !== persistedOrder.creditsUsed
    )) return NextResponse.json({ error: "The saved checkout quote no longer matches this release. Refresh the review and create a new checkout." }, { status: 409 });
    if (checkoutPlan(persistedOrder, "one_time") !== parsed.metadata.plan) return NextResponse.json({ error: "The submitted plan does not match the persisted order. Resume checkout to reload the saved payment plan." }, { status: 400 });
    if ((checkoutPlan(persistedOrder, "one_time") === "one_time") !== (parsed.metadata.paymentModel === "one_time")) return NextResponse.json({ error: "The submitted payment model does not match the persisted order." }, { status: 400 });
    const isSubscriptionEntitlement = parsed.razorpay_order_id.startsWith("sub_entitlement_");
    const normalAmount = getDistributionPricing(parsed.metadata.plan, parsed.metadata.tracks.length, parsed.metadata.releaseType, parsed.metadata.platforms, { youtubeContentIdEnabled: parsed.metadata.youtubeContentIdEnabled });
    const promotionQuote = isFirstReleaseOffer
      ? storedQuote
        ? { originalAmount: Number(storedQuote.subtotal) + Number(storedQuote.firstReleaseDiscount), discountAmount: Number(storedQuote.firstReleaseDiscount), finalAmount: Number(storedQuote.subtotal) }
        : calculateFirstReleasePrice({ plan: parsed.metadata.plan, releaseType: parsed.metadata.releaseType, trackCount: parsed.metadata.tracks.length, normalAmount })
      : null;
    const expectedAmount = storedQuote ? Number(storedQuote.subtotal) : promotionQuote?.finalAmount ?? normalAmount;
    if (isFirstReleaseOffer && storedQuote) {
      const redemptionId = Number(storedQuote.promotionRedemptionId);
      const redemption = Number.isInteger(redemptionId) ? await prisma.promotionRedemption.findUnique({ where: { id: redemptionId } }) : null;
      if (!redemption || redemption.userId !== session.sub || redemption.releaseId !== parsed.draftReleaseId || redemption.status !== "RESERVED" || Number(redemption.finalAmount) !== expectedAmount) {
        return NextResponse.json({ error: "The first-release offer reservation is missing or no longer matches this checkout. Resume checkout before submitting." }, { status: 409 });
      }
    }
    if (!distributionOrderPriceMatches({ amount: persistedOrder.amount, creditsUsed: persistedOrder.creditsUsed, expectedAmount, currency: persistedOrder.currency, subscriptionEntitlement: isSubscriptionEntitlement })) return NextResponse.json({ error: "The submitted release price does not match the persisted order." }, { status: 400 });
    if (isFirstReleaseOffer && persistedOrder.plan !== "one_time") return NextResponse.json({ error: "First-release order is invalid." }, { status: 400 });
    const savedArtistIds = new Set((await listArtistProfilesByUser(session.sub)).map((profile) => profile.id));
    const invalidPrimaryArtist = parsed.metadata.tracks.some((track) =>
      [...track.artistProfileIds, ...(track.featuredArtistProfileIds ?? []), ...(track.remixerProfileIds ?? [])].some((id) => !savedArtistIds.has(id)),
    );
    if (invalidPrimaryArtist) {
      return NextResponse.json({ error: "Select primary, featured and remixer artists from your saved artist cards before submitting." }, { status: 400 });
    }
    const identifierConflicts = await findReleaseIdentifierConflicts({ releaseId: parsed.draftReleaseId, upc: parsed.metadata.upcCode, tracks: parsed.metadata.tracks.map(track => ({ trackNumber: track.trackNumber, isrc: track.isrc, audioUrl: track.uploadedAudioUrl || track.existingAudioUrl })) });
    if (identifierConflicts.length) return NextResponse.json({ error: identifierConflicts[0].message, code: identifierConflicts[0].code, errors: identifierConflicts }, { status: 409 });
    const requirePrivateAsset = (value: string | undefined, label: string) => {
      if (!value) return value;
      if (process.env.NODE_ENV === "production" && !value.startsWith("/api/assets/")) throw new Error(`${label} must use authenticated private storage.`);
      return value;
    };

    if (isSubscriptionEntitlement) {
      const sub = await getSubscriptionByUserId(session.sub);
      if (!subscriptionHasEntitlement(sub)) return NextResponse.json({ error: "No active subscription entitlement found." }, { status: 400 });
      if (!subscriptionHasReleaseAllowance(sub)) return NextResponse.json({ error: "Your subscription release allowance has been used." }, { status: 409 });
      if (parsed.metadata.paymentModel !== "subscription" || parsed.metadata.plan !== checkoutPlan(sub!, "one_time")) return NextResponse.json({ error: "The submitted plan does not match your active subscription." }, { status: 400 });
    } else if (persistedOrder.amount > 0) {
      if (persistedOrder.paymentStatus === "paid") {
        if (!persistedOrder.razorpayPaymentId || persistedOrder.razorpayPaymentId !== parsed.razorpay_payment_id) return NextResponse.json({ error: "The stored payment reference does not match this release." }, { status: 409 });
      } else {
        const valid = verifyRazorpaySignature(parsed.razorpay_order_id, parsed.razorpay_payment_id, parsed.razorpay_signature);
        if (!valid) return NextResponse.json({ error: "Invalid Razorpay signature." }, { status: 400 });
        await verifyCapturedRazorpayPayment({ orderId: parsed.razorpay_order_id, paymentId: parsed.razorpay_payment_id, amountMinor: persistedOrder.amount * 100, currency: persistedOrder.currency });
        await confirmDistributionPayment({ razorpayOrderId: parsed.razorpay_order_id, paymentId: parsed.razorpay_payment_id, userId: session.sub, source: "browser" });
      }
    } else if (!(isFirstReleaseOffer && promotionQuote?.finalAmount === 0 && persistedOrder.creditsUsed === 0 && persistedOrder.razorpayOrderId.startsWith("free_first_release_")) && !(persistedOrder.paymentStatus === "paid" && persistedOrder.creditsUsed > 0 && persistedOrder.razorpayPaymentId === parsed.razorpay_payment_id)) {
      return NextResponse.json({ error: "This zero-value order has no valid release entitlement." }, { status: 400 });
    }

    const artworkUrl = requirePrivateAsset(await resolvePrivateReleaseArtworkUrl({
      userId: session.sub,
      releaseId: parsed.draftReleaseId,
      value: parsed.metadata.uploadedArtworkUrl || parsed.metadata.existingArtworkUrl
    }), "Artwork");
    if (!artworkUrl) {
      return NextResponse.json({ error: "Artwork upload missing." }, { status: 400 });
    }
    await assertDireNoteAssetFormat({ userId: session.sub, url: artworkUrl, kind: "artwork", label: "Cover artwork" });

    const tracks = [];
    for (const track of parsed.metadata.tracks) {
      const audioUrl = requirePrivateAsset(track.uploadedAudioUrl || track.existingAudioUrl, `Audio for ${track.trackTitle}`);
      if (!audioUrl) {
        return NextResponse.json({ error: `Audio upload missing for ${track.trackTitle}.` }, { status: 400 });
      }
      await assertDireNoteAssetFormat({ userId: session.sub, url: audioUrl, kind: "audio", label: `Audio for ${track.trackTitle}` });

      let coverLicenseUrl: string | undefined;
      if (track.isCover) {
        coverLicenseUrl = track.uploadedCoverLicenseUrl ? requirePrivateAsset(track.uploadedCoverLicenseUrl, `Cover licence for ${track.trackTitle}`) : (track.existingCoverLicenseConfirmed ? "previously_uploaded" : undefined);
        if (!coverLicenseUrl && track.coverLicenseConfirmed) {
          return NextResponse.json({ error: `Cover license missing for ${track.trackTitle}.` }, { status: 400 });
        }
      }
      tracks.push({
        trackTitle: track.trackTitle,
        language: track.language,
        lyrics: track.lyrics,
        metadata: { ...track.metadata, artistProfileIds: track.artistProfileIds, featuredArtistProfileIds: track.featuredArtistProfileIds, remixerProfileIds: track.remixerProfileIds },
        version: track.version,
        trackNumber: track.trackNumber,
        primaryArtist: track.primaryArtist,
        featuredArtists: track.featuredArtists,
        additionalPrimaryArtists: track.additionalPrimaryArtists,
        songwriters: track.songwriters,
        composers: track.composers,
        producers: track.producers,
        isrc: track.isrc,
        isCover: track.isCover,
        originalArtist: track.originalArtist,
        originalTrackLink: track.originalTrackLink,
        coverLicenseConfirmed: track.coverLicenseConfirmed,
        coverLicenseUrl,
        audioUrl,
        duration: track.duration,
        bpm: track.bpm,
        musicalKey: track.musicalKey,
        explicitContent: track.explicitContent,
        dolbyAtmos: track.dolbyAtmos,
        contributors: track.contributors
      });
    }

    const artistProfileIds = [...new Set(parsed.metadata.tracks.flatMap((track) => [
      ...(track.artistProfileIds ?? []),
      ...(track.featuredArtistProfileIds ?? []),
      ...(track.remixerProfileIds ?? [])
    ]))];
    await touchArtistProfiles(session.sub, artistProfileIds);

    const resolvedReleaseTitle = parsed.metadata.releaseType === "single" && parsed.metadata.tracks.length === 1
      ? parsed.metadata.tracks[0]?.trackTitle?.trim() || parsed.metadata.releaseTitle?.trim() || "Untitled release"
      : parsed.metadata.releaseTitle?.trim() || parsed.metadata.tracks[0]?.trackTitle || "Untitled release";
    let promotionRedemption: Awaited<ReturnType<typeof reserveFirstRelease>> | null = null;
    if (isFirstReleaseOffer) {
      promotionRedemption = await reserveFirstRelease({ userId: session.sub, releaseId: parsed.draftReleaseId, ...promotionQuote!, attribution: parsed.attribution });
    }
    let release;
    let orderClaimed = false;
    let subscriptionReservation: Awaited<ReturnType<typeof reserveSubscriptionReleaseSlot>> | null = null;
    try {
      if (persistedOrder.amount === 0 && persistedOrder.creditsUsed === 0) {
        await confirmDistributionEntitlement({ razorpayOrderId: parsed.razorpay_order_id, userId: session.sub, paymentId: parsed.razorpay_payment_id });
      }
      await claimDistributionOrderForSubmission({ razorpayOrderId: parsed.razorpay_order_id, userId: session.sub });
      orderClaimed = true;
      if (isSubscriptionEntitlement) subscriptionReservation = await reserveSubscriptionReleaseSlot(session.sub, parsed.draftReleaseId);
      const releaseMetadata = {
        artistName: parsed.metadata.artistName,
        trackName: parsed.metadata.tracks[0]?.trackTitle ?? resolvedReleaseTitle,
        releaseTitle: resolvedReleaseTitle,
        releaseType: parsed.metadata.releaseType,
        contentType: parsed.metadata.contentType,
        sunoReceiptUrl: parsed.metadata.sunoReceiptUrl,
        sunoLink: parsed.metadata.sunoLink,
        licenseReceiptUrl: parsed.metadata.licenseReceiptUrl,
        releasePreviouslyReleased: parsed.metadata.releasePreviouslyReleased,
        youtubeContentIdEnabled: parsed.metadata.youtubeContentIdEnabled,
        youtubeContentIdChannelUrl: parsed.metadata.youtubeContentIdChannelUrl ?? undefined,
        monetisationAccepted: parsed.metadata.monetisationAccepted,
        monetisationClauses: parsed.metadata.monetisationClauses,
        audioUrl: tracks[0]?.audioUrl ?? "",
        artworkUrl,
        releaseDate: parsed.metadata.releaseDate,
        originalReleaseDate: parsed.metadata.originalReleaseDate,
        labelName: parsed.metadata.recordLabelName,
        labelDisplayName: parsed.metadata.labelName ?? parsed.metadata.recordLabelName,
        primaryGenre: parsed.metadata.primaryGenre,
        secondaryGenre: parsed.metadata.secondaryGenre,
        genre: parsed.metadata.primaryGenre,
        mood: parsed.metadata.mood,
        language: parsed.metadata.language,
        platforms: parsed.metadata.platforms,
        territory: parsed.metadata.territory,
        upcCode: parsed.metadata.upcCode,
        releaseTiming: parsed.metadata.releaseTiming,
        ownershipConfirmed: parsed.metadata.legal.ownershipConfirmation,
        noUnauthorizedSamples: parsed.metadata.legal.noInfringement,
        collaboratorsCredited: parsed.metadata.legal.collaboratorsCredited,
        platformCompliant: parsed.metadata.legal.platformGuidelines,
        hymnNotLiable: parsed.metadata.legal.hymnNotLiable,
        agreedToTerms: parsed.metadata.legal.termsAccepted,
        falseMetadataAcknowledged: parsed.metadata.legal.falseMetadataAcknowledged,
        copyrightOwner: parsed.metadata.copyrightOwner,
        publishingRights: parsed.metadata.publishingRights,
        paymentModel: parsed.metadata.paymentModel,
        paymentStatus: "paid" as const,
        autoQc: { status: "pending" },
        distributionPlan: parsed.metadata.plan,
        ...(isFirstReleaseOffer ? { promotionCode: FIRST_RELEASE_PROMOTION_CODE, campaignAttribution: parsed.attribution ?? {} } : {}),
        tracks
      };
      if (parsed.draftReleaseId) {
        const draft = await getDetailedReleaseById(parsed.draftReleaseId);
        if (!draft || draft.userId !== session.sub || !["draft", "awaiting_payment"].includes(draft.status)) throw new Error("The draft attached to this checkout is invalid.");
        release = await updatePaidDistributionRelease({ userId: session.sub, releaseId: parsed.draftReleaseId, metadata: releaseMetadata, verifiedOrderId: parsed.razorpay_order_id, deferStatusNotifications: true });
      } else release = await submitPaidDistributionRelease({
      userId: session.sub,
      razorpayOrderId: parsed.razorpay_order_id,
      razorpayPaymentId: parsed.razorpay_payment_id,
      metadata: releaseMetadata
      });
      if (!release?.id) throw new Error("Release submission did not create a release.");
      await attachDistributionOrderRelease({ razorpayOrderId: parsed.razorpay_order_id, userId: session.sub, releaseId: release.id });
      if (subscriptionReservation) await attachReservedSubscriptionRelease(subscriptionReservation.subscriptionId, release.id);
      if (promotionRedemption) {
        await redeemFirstRelease(promotionRedemption.id, release.id);
        await Promise.all([
          trackFirstReleaseEvent({ event: "promotion_redeemed", userId: session.sub, attribution: parsed.attribution, metadata: { releaseId: release.id } }),
          trackFirstReleaseEvent({ event: "release_submitted", userId: session.sub, attribution: parsed.attribution, metadata: { releaseId: release.id } })
        ]).catch((error) => console.error("First-release analytics failed:", error));
      }
    } catch (error) {
      const persistedRelease = !release && parsed.draftReleaseId ? await prisma.release.findUnique({ where: { id: parsed.draftReleaseId }, select: { status: true } }) : null;
      const submissionPersisted = Boolean(release || (persistedRelease && !["DRAFT", "AWAITING_PAYMENT"].includes(persistedRelease.status)));
      if (!submissionPersisted && orderClaimed) await releaseDistributionOrderClaim({ razorpayOrderId: parsed.razorpay_order_id, userId: session.sub }).catch(() => undefined);
      if (!submissionPersisted && subscriptionReservation) await releaseReservedSubscriptionSlot(subscriptionReservation.subscriptionId, subscriptionReservation.counted, parsed.draftReleaseId).catch(() => undefined);
      if (promotionRedemption && !submissionPersisted) await releaseFirstReleaseReservation(promotionRedemption.id).catch(() => undefined);
      if (promotionRedemption && submissionPersisted) {
        const submittedId = release?.id ?? parsed.draftReleaseId;
        if (submittedId) await redeemFirstRelease(promotionRedemption.id, submittedId).catch(() => undefined);
      }
      throw error;
    }

    const submissionSiteUrl = getPublicAppUrl(request.url);
    after(async () => {
      try { if (await runPendingDistributionQc(release.id, submissionSiteUrl)) await submitRelease(release.id, { siteUrl: submissionSiteUrl }); }
      catch (error) { console.error("Background submission QC deferred to scheduled recovery", { releaseId: release.id, error }); }
    });
    after(async () => {

    await createNotification({
      userId: session.sub,
      title: isFirstReleaseOffer ? "First release submitted" : isSubscriptionEntitlement ? "Subscription release submitted" : "Distribution payment confirmed",
      body: isFirstReleaseOffer ? "Your first-release credit has been applied. Your release is under review." : isSubscriptionEntitlement ? "Your active subscription covered this release submission." : "Your distribution payment is confirmed and your release is in review.",
      type: "order",
      href: release?.id ? `/dashboard/releases?releaseId=${release.id}` : "/dashboard/releases",
      actionLabel: "Open release",
      metadata: {
        releaseId: release?.id ?? null,
        razorpayOrderId: parsed.razorpay_order_id,
        plan: parsed.metadata.plan
      }
    }).catch(() => console.error("Submission notification could not be delivered.", { releaseId: release?.id }));

    if (release?.id) {
      await recordGrowthEvent({ event: "release_submitted", key: `release-submit:${release.id}`, userId: session.sub, properties: { release_id: release.id } });
      await createNotification({
        userId: session.sub,
        title: `Release submitted: ${release.releaseTitle || release.trackName}`,
        body: "Your release is under HYMN review. Our team is checking metadata, artwork, audio, and rights.",
        type: "release",
        href: `/dashboard/releases?releaseId=${release.id}`,
        actionLabel: "View release",
        eventKey: `release:${release.id}:status:under_review`,
        metadata: { releaseId: release.id, status: "under_review" }
      }).catch(() => console.error("Release notification could not be delivered.", { releaseId: release.id }));
      // SMTP completion must not delay the paid customer's confirmation screen.
      const confirmedReleaseId = release.id;
      after(async () => { await sendReleaseEmail("release_submitted", {
        to: session.email,
        userId: session.sub,
        userName: session.name,
        releaseTitle: release.releaseTitle || release.trackName || resolvedReleaseTitle,
        artistName: parsed.metadata.artistName,
        releaseId: release.id,
        releaseStatus: "submitted",
        releaseDate: parsed.metadata.releaseDate,
        manageReleaseUrl: emailAppUrl(`/dashboard/releases/${release.id}`),
        correctionUrl: emailAppUrl(`/dashboard/releases/${release.id}?tab=corrections`)
      }).catch(() => console.error("Release confirmation email could not be delivered.", { releaseId: confirmedReleaseId })); });
    }

    });
    return NextResponse.json({ release, reviewEligibility: { purchaseType: "service", purchaseId: persistedOrder.id, label: `${parsed.metadata.plan} · ${release.releaseTitle || release.trackName || resolvedReleaseTitle}` } }, { status: 201 });
  } catch (error) {
    const transient = releaseSaveFailure(error);
    if (transient) { console.error("Release persistence failed", { error }); return NextResponse.json(transient, { status: 503 }); }
    const message = error instanceof Error ? error.message : "Could not submit distribution release.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


// vercel trigger
// vercel trigger 5
// vercel trigger 6
// vercel trigger 9
