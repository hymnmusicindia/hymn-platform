import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { saveUploadedFile } from "@/lib/storage";
import { touchArtistProfiles } from "@/lib/db";
import { getDetailedReleaseById, updatePaidDistributionRelease } from "@/lib/distribution-db";
import type { ReleaseTrack } from "@/lib/types";
import { distributionEditSchema } from "@/lib/validation";

type EditTrackPayload = Omit<ReleaseTrack, "id" | "releaseId" | "createdAt"> & {
  coverLicenseUrl?: string;
  existingAudioUrl?: string;
  existingCoverLicenseConfirmed?: boolean;
  coverLicenseFileKey?: string;
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") || "{}"));
    const parsed = distributionEditSchema.parse(payload);

    const existingRelease = await getDetailedReleaseById(parsed.metadata.editReleaseId);
    if (!existingRelease || (existingRelease.userId !== session.sub && session.role !== "admin" && session.role !== "producer")) {
      return NextResponse.json({ error: "Release not found." }, { status: 404 });
    }

    const artworkUpload = formData.get(parsed.metadata.artworkFileKey);
    const artworkUrl = artworkUpload instanceof File
      ? await saveUploadedFile(artworkUpload, "releases/artwork", "image")
      : parsed.metadata.uploadedArtworkUrl ?? parsed.metadata.existingArtworkUrl ?? existingRelease.artworkUrl;

    if (!artworkUrl) {
      return NextResponse.json({ error: "Artwork upload missing." }, { status: 400 });
    }

    const tracks: EditTrackPayload[] = [];
    for (const track of parsed.metadata.tracks) {
      const audioUpload = formData.get(track.audioFileKey);
      const audioUrl = audioUpload instanceof File
        ? await saveUploadedFile(audioUpload, "releases/audio", "audio")
        : track.uploadedAudioUrl ?? track.existingAudioUrl ?? existingRelease.tracks?.find((item) => item.trackNumber === track.trackNumber)?.audioUrl ?? "";

      if (!audioUrl) {
        return NextResponse.json({ error: `Audio upload missing for ${track.trackTitle}.` }, { status: 400 });
      }

      let coverLicenseUrl: string | undefined;
      if (track.coverLicenseFileKey) {
        const licenseUpload = formData.get(track.coverLicenseFileKey);
        if (licenseUpload instanceof File) {
          coverLicenseUrl = await saveUploadedFile(licenseUpload, "releases/licenses", "file");
        } else if (!(track.existingCoverLicenseConfirmed ?? track.coverLicenseConfirmed)) {
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
        coverLicenseConfirmed: track.coverLicenseConfirmed || track.existingCoverLicenseConfirmed || Boolean(coverLicenseUrl),
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

    const resolvedReleaseTitle = parsed.metadata.releaseTitle?.trim() || parsed.metadata.tracks[0]?.trackTitle || "Untitled release";
    const release = await updatePaidDistributionRelease({
      userId: existingRelease.userId,
      releaseId: parsed.metadata.editReleaseId,
      metadata: {
        artistName: parsed.metadata.artistName,
        trackName: parsed.metadata.tracks[0]?.trackTitle ?? resolvedReleaseTitle,
        releaseTitle: resolvedReleaseTitle,
        releaseType: parsed.metadata.releaseType,
        audioUrl: tracks[0]?.audioUrl ?? existingRelease.audioUrl,
        artworkUrl,
        releaseDate: parsed.metadata.releaseDate,
        originalReleaseDate: parsed.metadata.originalReleaseDate,
        labelName: parsed.metadata.labelName,
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

    if (!release) {
      return NextResponse.json({ error: "Release not found." }, { status: 404 });
    }

    return NextResponse.json({ release });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update distribution release.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
// vercel trigger 6
