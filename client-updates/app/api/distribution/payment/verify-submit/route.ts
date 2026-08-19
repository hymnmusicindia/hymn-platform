import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/storage";
import { submitPaidDistributionRelease, markDistributionOrderPaid } from "@/lib/distribution-db";
import { touchArtistProfiles } from "@/lib/db";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { distributionSubmitSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") || "{}"));
    const parsed = distributionSubmitSchema.parse(payload);

    const valid = verifyRazorpaySignature(parsed.razorpay_order_id, parsed.razorpay_payment_id, parsed.razorpay_signature);
    if (!valid) return NextResponse.json({ error: "Invalid Razorpay signature." }, { status: 400 });

    const artwork = formData.get(parsed.metadata.artworkFileKey);
    if (!(artwork instanceof File)) {
      return NextResponse.json({ error: "Artwork upload missing." }, { status: 400 });
    }
    const artworkUrl = await saveUploadedFile(artwork, "releases/artwork", "image");

    const tracks = [];
    for (const track of parsed.metadata.tracks) {
      const audioFile = formData.get(track.audioFileKey);
      if (!(audioFile instanceof File)) {
        return NextResponse.json({ error: `Audio upload missing for ${track.trackTitle}.` }, { status: 400 });
      }
      const audioUrl = await saveUploadedFile(audioFile, "releases/audio", "audio");
      let coverLicenseUrl: string | undefined;
      if (track.coverLicenseFileKey) {
        const licenseFile = formData.get(track.coverLicenseFileKey);
        if (!(licenseFile instanceof File)) {
          return NextResponse.json({ error: `Cover license missing for ${track.trackTitle}.` }, { status: 400 });
        }
        coverLicenseUrl = await saveUploadedFile(licenseFile, "releases/licenses", "file");
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

    return NextResponse.json({ release }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not submit distribution release.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

