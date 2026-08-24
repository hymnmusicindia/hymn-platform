import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDistributionPricing, submitPaidDistributionRelease } from "@/lib/distribution-db";
import { createNotification, getSubscriptionByUserId, listArtistProfilesByUser, touchArtistProfiles } from "@/lib/db";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { distributionSubmitSchema } from "@/lib/validation";
import { isProductionPaymentBypassEnabled } from "@/lib/env";
import { emailAppUrl, sendReleaseEmail } from "@/lib/email/email-events";
import { confirmDistributionPayment } from "@/lib/payment-webhooks";
import { consumeRateLimit } from "@/lib/rate-limit";
import { assertDireNoteAssetFormat } from "@/lib/distribution-asset-format";
import { prisma } from "@/lib/prisma";
import { calculateFirstReleasePrice, FIRST_RELEASE_PROMOTION_CODE, redeemFirstRelease, releaseFirstReleaseReservation, reserveFirstRelease, trackFirstReleaseEvent } from "@/lib/first-release-promotion";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rate = await consumeRateLimit({ scope: "distribution-payment-verify", identity: String(session.sub), limit: 12, windowSeconds: 15 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many payment verification attempts." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

  try {
    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") || "{}"));
    const parsed = distributionSubmitSchema.parse(payload);
    const isFirstReleaseOffer = parsed.promotionCode === FIRST_RELEASE_PROMOTION_CODE;
    const promotionOrder = isFirstReleaseOffer ? await prisma.distributionOrder.findUnique({ where: { razorpayOrderId: parsed.razorpay_order_id } }) : null;
    if (isFirstReleaseOffer && (!promotionOrder || promotionOrder.userId !== session.sub || promotionOrder.plan !== "one_time")) return NextResponse.json({ error: "First-release order not found." }, { status: 404 });
    const savedArtistIds = new Set((await listArtistProfilesByUser(session.sub)).map((profile) => profile.id));
    const invalidPrimaryArtist = parsed.metadata.tracks.some((track) =>
      track.artistProfileIds.some((id) => !savedArtistIds.has(id)),
    );
    if (invalidPrimaryArtist) {
      return NextResponse.json({ error: "Select primary artists from your saved artist cards before submitting." }, { status: 400 });
    }
    const requirePrivateAsset = (value: string | undefined, label: string) => {
      if (!value) return value;
      if (process.env.NODE_ENV === "production" && !value.startsWith("/api/assets/")) throw new Error(`${label} must use authenticated private storage.`);
      return value;
    };

    const paymentBypassEnabled = isProductionPaymentBypassEnabled();

    if (paymentBypassEnabled) {
      // Skip payment verification
      // Continue the normal submission flow
    } else if (parsed.razorpay_order_id === "sub_active") {
      const sub = await getSubscriptionByUserId(session.sub);
      if (!sub) return NextResponse.json({ error: "No active subscription found." }, { status: 400 });
    } else if (!isFirstReleaseOffer || Number(promotionOrder?.amount ?? 0) > 0) {
      const valid = verifyRazorpaySignature(parsed.razorpay_order_id, parsed.razorpay_payment_id, parsed.razorpay_signature);
      if (!valid) return NextResponse.json({ error: "Invalid Razorpay signature." }, { status: 400 });
    }

    const artworkUrl = requirePrivateAsset(parsed.metadata.uploadedArtworkUrl || parsed.metadata.existingArtworkUrl, "Artwork");
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
        explicitContent: track.explicitContent,
        dolbyAtmos: track.dolbyAtmos,
        contributors: track.contributors
      });
    }

    if (parsed.razorpay_order_id !== "sub_active" && (!isFirstReleaseOffer || Number(promotionOrder?.amount ?? 0) > 0)) {
      await confirmDistributionPayment({ razorpayOrderId: parsed.razorpay_order_id, paymentId: parsed.razorpay_payment_id, userId: session.sub, source: "browser" });
    }
    const artistProfileIds = [...new Set(parsed.metadata.tracks.flatMap((track) => [
      ...(track.artistProfileIds ?? []),
      ...(track.featuredArtistProfileIds ?? []),
      ...(track.remixerProfileIds ?? [])
    ]))];
    await touchArtistProfiles(session.sub, artistProfileIds);

    const resolvedReleaseTitle = parsed.metadata.releaseTitle?.trim() || parsed.metadata.tracks[0]?.trackTitle || "Untitled release";
    let promotionRedemption: Awaited<ReturnType<typeof reserveFirstRelease>> | null = null;
    if (isFirstReleaseOffer) {
      const normalAmount = getDistributionPricing(parsed.metadata.plan, parsed.metadata.tracks.length, parsed.metadata.releaseType, parsed.metadata.platforms, { youtubeContentIdEnabled: parsed.metadata.youtubeContentIdEnabled });
      const quote = calculateFirstReleasePrice({ plan: parsed.metadata.plan, releaseType: parsed.metadata.releaseType, trackCount: parsed.metadata.tracks.length, normalAmount });
      if (Number(promotionOrder?.amount) !== quote.finalAmount) throw new Error("First-release order amount is invalid. Please restart checkout.");
      promotionRedemption = await reserveFirstRelease({ userId: session.sub, ...quote, attribution: parsed.attribution });
    }
    let release;
    try {
      release = await submitPaidDistributionRelease({
      userId: session.sub,
      razorpayOrderId: parsed.razorpay_order_id,
      razorpayPaymentId: parsed.razorpay_payment_id,
      metadata: {
        artistName: parsed.metadata.artistName,
        trackName: parsed.metadata.tracks[0]?.trackTitle ?? resolvedReleaseTitle,
        releaseTitle: resolvedReleaseTitle,
        releaseType: parsed.metadata.releaseType,
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
        paymentStatus: "paid",
        distributionPlan: parsed.metadata.plan,
        tracks
      }
      });
      if (!release?.id) throw new Error("Release submission did not create a release.");
      if (promotionRedemption) {
        await redeemFirstRelease(promotionRedemption.id, release.id);
        await Promise.all([
          trackFirstReleaseEvent({ event: "promotion_redeemed", userId: session.sub, attribution: parsed.attribution, metadata: { releaseId: release.id } }),
          trackFirstReleaseEvent({ event: "release_submitted", userId: session.sub, attribution: parsed.attribution, metadata: { releaseId: release.id } })
        ]).catch((error) => console.error("First-release analytics failed:", error));
      }
    } catch (error) {
      if (promotionRedemption) await releaseFirstReleaseReservation(promotionRedemption.id).catch(() => undefined);
      throw error;
    }

    await createNotification({
      userId: session.sub,
      title: parsed.razorpay_order_id === "sub_active" ? "Subscription release submitted" : "Distribution payment confirmed",
      body: parsed.razorpay_order_id === "sub_active" ? "Your active subscription covered this release submission." : "Your distribution payment is confirmed and your release is in review.",
      type: "order",
      href: release?.id ? `/dashboard/releases?releaseId=${release.id}` : "/dashboard/releases",
      actionLabel: "Open release",
      metadata: {
        releaseId: release?.id ?? null,
        razorpayOrderId: parsed.razorpay_order_id,
        plan: parsed.metadata.plan
      }
    });

    if (release?.id) {
      await createNotification({
        userId: session.sub,
        title: `Release submitted: ${release.releaseTitle || release.trackName}`,
        body: "Your release is under HYMN review. Our team is checking metadata, artwork, audio, and rights.",
        type: "release",
        href: `/dashboard/releases?releaseId=${release.id}`,
        actionLabel: "View release",
        eventKey: `release:${release.id}:status:under_review`,
        metadata: { releaseId: release.id, status: "under_review" }
      });
      await sendReleaseEmail("release_submitted", {
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
      });
    }

    return NextResponse.json({ release }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not submit distribution release.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


// vercel trigger
// vercel trigger 5
// vercel trigger 6
// vercel trigger 9
