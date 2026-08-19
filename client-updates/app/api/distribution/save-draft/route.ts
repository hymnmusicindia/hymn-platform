import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/storage";
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

    const artworkUpload = metadata.artworkFileKey ? formData.get(metadata.artworkFileKey) : null;
    const artworkUrl = artworkUpload instanceof File
      ? await saveUploadedFile(artworkUpload, "releases/artwork", "image")
      : metadata.existingArtworkUrl ?? existingRelease?.artworkUrl ?? "";

    const tracks = [];
    for (const track of metadata.tracks ?? []) {
      const audioUpload = track.audioFileKey ? formData.get(track.audioFileKey) : null;
      const existingTrack = existingRelease?.tracks?.find((item) => item.trackNumber === track.trackNumber);
      const audioUrl = audioUpload instanceof File
        ? await saveUploadedFile(audioUpload, "releases/audio", "audio")
        : track.existingAudioUrl ?? existingTrack?.audioUrl ?? "";

      let coverLicenseUrl: string | undefined;
      if (track.coverLicenseFileKey) {
        const licenseUpload = formData.get(track.coverLicenseFileKey);
        if (licenseUpload instanceof File) {
          coverLicenseUrl = await saveUploadedFile(licenseUpload, "releases/licenses", "file");
        }
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
        contributors: track.contributors ?? []
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
        mood: metadata.mood ?? null,
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
        distributionPlan: metadata.plan ?? "pay_per_release",
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
    const message = error instanceof Error ? error.message : "Could not save draft release.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
