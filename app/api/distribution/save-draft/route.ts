import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getDetailedReleaseByUserId, saveDraftDistributionRelease } from "@/lib/distribution-db";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") || "{}"));
    const metadata = payload.metadata ?? {};
    const draftReleaseId = payload.draftReleaseId ? Number(payload.draftReleaseId) : undefined;
    const existingRelease = draftReleaseId ? await getDetailedReleaseByUserId(session.sub, draftReleaseId) : null;
    if (draftReleaseId && !existingRelease) {
      return NextResponse.json({ error: "The release being edited was not found." }, { status: 404 });
    }
    if (existingRelease && existingRelease.status !== "draft") {
      return NextResponse.json({ error: "Move this release to Draft before saving changes." }, { status: 409 });
    }
    const rejectPublicDeliverable = (value: unknown) => {
      const url = String(value || "");
      if (process.env.NODE_ENV === "production" && /^(https?:)?\/\//i.test(url)) throw new Error("Public upload URLs are not accepted for unreleased release assets.");
      return url;
    };

    const artworkUrl = rejectPublicDeliverable(metadata.uploadedArtworkUrl ?? metadata.existingArtworkUrl ?? existingRelease?.artworkUrl ?? "");

    const tracks = [];
    for (const track of metadata.tracks ?? []) {
      const existingTrack = existingRelease?.tracks?.find((item: any) => item.trackNumber === track.trackNumber);
      const audioUrl = rejectPublicDeliverable(track.uploadedAudioUrl ?? track.existingAudioUrl ?? existingTrack?.audioUrl ?? "");

      let coverLicenseUrl: string | undefined;
      if (track.isCover) {
        coverLicenseUrl = track.uploadedCoverLicenseUrl ? rejectPublicDeliverable(track.uploadedCoverLicenseUrl) : (track.existingCoverLicenseConfirmed || track.coverLicenseConfirmed ? "previously_uploaded" : undefined);
      }

      tracks.push({
        trackTitle: track.trackTitle ?? "",
        version: track.version ?? undefined,
        trackNumber: track.trackNumber ?? tracks.length + 1,
        primaryArtist: track.primaryArtist ?? metadata.artistName ?? "",
        featuredArtists: track.featuredArtists ?? undefined,
        additionalPrimaryArtists: track.additionalPrimaryArtists ?? undefined,
        songwriters: track.songwriters ?? metadata.artistName ?? "",
        composers: track.composers ?? metadata.artistName ?? "",
        producers: track.producers ?? metadata.artistName ?? "",
        isrc: track.isrc ?? undefined,
        isCover: Boolean(track.isCover),
        originalArtist: track.originalArtist ?? undefined,
        originalTrackLink: track.originalTrackLink ?? undefined,
        coverLicenseConfirmed: Boolean(track.coverLicenseConfirmed || track.existingCoverLicenseConfirmed || coverLicenseUrl),
        coverLicenseUrl,
        audioUrl,
        duration: track.duration ?? "",
        bpm: track.bpm ?? null,
        musicalKey: track.musicalKey ?? undefined,
        explicitContent: Boolean(track.explicitContent),
        dolbyAtmos: Boolean(track.dolbyAtmos),
        contributors: track.contributors ?? [],
        metadata: {
          ...(track.metadata && typeof track.metadata === "object" ? track.metadata : {}),
          artistProfileIds: Array.isArray(track.artistProfileIds) ? track.artistProfileIds : [],
          featuredArtistProfileIds: Array.isArray(track.featuredArtistProfileIds) ? track.featuredArtistProfileIds : [],
          remixerProfileIds: Array.isArray(track.remixerProfileIds) ? track.remixerProfileIds : []
        }
      });
    }

    const release = await saveDraftDistributionRelease({
      userId: session.sub,
      draftReleaseId,
      metadata: {
        artistName: metadata.artistName ?? "",
        trackName: metadata.tracks?.[0]?.trackTitle ?? metadata.trackName ?? metadata.releaseTitle ?? "",
        releaseTitle: metadata.releaseTitle ?? metadata.tracks?.[0]?.trackTitle ?? "Untitled release",
        releaseType: metadata.releaseType ?? "single",
        audioUrl: tracks[0]?.audioUrl ?? "",
        artworkUrl,
        releaseDate: metadata.releaseDate ?? "",
        originalReleaseDate: metadata.originalReleaseDate ?? null,
        labelName: metadata.labelName ?? metadata.recordLabelName ?? null,
        labelDisplayName: metadata.labelDisplayName ?? metadata.recordLabelName ?? null,
        primaryGenre: metadata.primaryGenre ?? null,
        secondaryGenre: metadata.secondaryGenre ?? null,
        genre: metadata.genre ?? metadata.primaryGenre ?? null,
        mood: typeof metadata.mood === "string" ? metadata.mood.trim() : "",
        language: metadata.language ?? "",
        platforms: metadata.platforms ?? [],
        youtubeContentIdEnabled: Boolean(metadata.youtubeContentIdEnabled),
        youtubeContentIdChannelUrl: metadata.youtubeContentIdChannelUrl ?? "",
        monetisationAccepted: Boolean(metadata.monetisationAccepted),
        monetisationClauses: metadata.monetisationClauses ?? {},
        territory: metadata.territory ?? "Worldwide",
        upcCode: metadata.upcCode ?? null,
        releaseTiming: metadata.releaseTiming ?? "quick_release",
        copyrightOwner: metadata.copyrightOwner ?? "",
        publishingRights: metadata.publishingRights ?? "",
        paymentModel: metadata.paymentModel ?? "one_time",
        distributionPlan: metadata.plan ?? "one_time",
        ownershipConfirmed: Boolean(metadata.legal?.ownershipConfirmation),
        noUnauthorizedSamples: Boolean(metadata.legal?.noInfringement),
        collaboratorsCredited: Boolean(metadata.legal?.collaboratorsCredited),
        platformCompliant: Boolean(metadata.legal?.platformGuidelines),
        hymnNotLiable: Boolean(metadata.legal?.hymnNotLiable),
        agreedToTerms: Boolean(metadata.legal?.termsAccepted),
        falseMetadataAcknowledged: Boolean(metadata.legal?.falseMetadataAcknowledged),
        tracks
      }
    });

    return NextResponse.json({ release }, { status: 201 });
  } catch (error) {
    console.error("Save Draft Error:", error);
    const message = error instanceof Error ? error.message : "Could not save draft release.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
// vercel trigger 4
// vercel trigger 9
