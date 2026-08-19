import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/storage";
import { submitPaidDistributionRelease, markDistributionOrderPaid } from "@/lib/distribution-db";
import { createNotification, getSubscriptionByUserId, touchArtistProfiles } from "@/lib/db";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { distributionSubmitSchema } from "@/lib/validation";
import { isProductionPaymentBypassEnabled } from "@/lib/env";
import { emailAppUrl, sendReleaseEmail } from "@/lib/email/email-events";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") || "{}"));
    const parsed = distributionSubmitSchema.parse(payload);

    const paymentBypassEnabled = isProductionPaymentBypassEnabled();

    if (paymentBypassEnabled) {
      // Skip payment verification
      // Continue the normal submission flow
    } else if (parsed.razorpay_order_id === "sub_active") {
      const sub = await getSubscriptionByUserId(session.sub);
      if (!sub) return NextResponse.json({ error: "No active subscription found." }, { status: 400 });
    } else {
      const valid = verifyRazorpaySignature(parsed.razorpay_order_id, parsed.razorpay_payment_id, parsed.razorpay_signature);
      if (!valid) return NextResponse.json({ error: "Invalid Razorpay signature." }, { status: 400 });
    }

    const artworkUrl = parsed.metadata.uploadedArtworkUrl || parsed.metadata.existingArtworkUrl;
    if (!artworkUrl) {
      return NextResponse.json({ error: "Artwork upload missing." }, { status: 400 });
    }

    const tracks = [];
    for (const track of parsed.metadata.tracks) {
      const audioUrl = track.uploadedAudioUrl || track.existingAudioUrl;
      if (!audioUrl) {
        return NextResponse.json({ error: `Audio upload missing for ${track.trackTitle}.` }, { status: 400 });
      }

      let coverLicenseUrl: string | undefined;
      if (track.isCover) {
        coverLicenseUrl = track.uploadedCoverLicenseUrl || (track.existingCoverLicenseConfirmed ? "previously_uploaded" : undefined);
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

    await markDistributionOrderPaid(parsed.razorpay_order_id, parsed.razorpay_payment_id);
    const artistProfileIds = [...new Set(parsed.metadata.tracks.flatMap((track) => [
      ...(track.artistProfileIds ?? []),
      ...(track.featuredArtistProfileIds ?? []),
      ...(track.remixerProfileIds ?? [])
    ]))];
    await touchArtistProfiles(session.sub, artistProfileIds);

    const resolvedReleaseTitle = parsed.metadata.releaseTitle?.trim() || parsed.metadata.tracks[0]?.trackTitle || "Untitled release";
    const release = await submitPaidDistributionRelease({
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
