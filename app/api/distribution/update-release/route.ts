import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { localPrivateStorage, type PrivateAssetType } from "@/lib/private-storage";
import { listArtistProfilesByUser, touchArtistProfiles } from "@/lib/db";
import { getDetailedReleaseById, updatePaidDistributionRelease } from "@/lib/distribution-db";
import type { ReleaseTrack } from "@/lib/types";
import { distributionEditSchema } from "@/lib/validation";
import { assertDireNoteAssetFormat } from "@/lib/distribution-asset-format";

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
    if (!["draft", "changes_requested", "rejected", "under_review"].includes(existingRelease.status)) {
      return NextResponse.json({ error: "This release cannot be edited in its current status." }, { status: 409 });
    }
    const savedArtistIds = new Set((await listArtistProfilesByUser(existingRelease.userId)).map((profile) => profile.id));
    const invalidPrimaryArtist = parsed.metadata.tracks.some((track) =>
      track.artistProfileIds.some((id) => !savedArtistIds.has(id)),
    );
    if (invalidPrimaryArtist) {
      return NextResponse.json({ error: "Select primary artists from your saved artist cards before submitting." }, { status: 400 });
    }

    if (parsed.metadata.releaseTiming === "schedule_release") {
      const earliest = new Date();
      earliest.setHours(0, 0, 0, 0);
      earliest.setDate(earliest.getDate() + 20);
      const minimumScheduledDate = `${earliest.getFullYear()}-${String(earliest.getMonth() + 1).padStart(2, "0")}-${String(earliest.getDate()).padStart(2, "0")}`;
      if (parsed.metadata.releaseDate < minimumScheduledDate) {
        return NextResponse.json({ error: `Scheduled releases must be at least 20 days from today. Choose ${minimumScheduledDate} or later.`, minimumScheduledDate }, { status: 400 });
      }
    }

    const savePrivate = async (file: File, assetType: PrivateAssetType) => (await localPrivateStorage.upload({ ownerUserId: session.sub, releaseId: existingRelease.id, assetType, fileName: file.name, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) })).downloadPath;
    const artworkUpload = formData.get(parsed.metadata.artworkFileKey);
    const artworkUrl = artworkUpload instanceof File
      ? await savePrivate(artworkUpload, "private_unreleased_artwork")
      : parsed.metadata.uploadedArtworkUrl ?? parsed.metadata.existingArtworkUrl ?? existingRelease.artworkUrl;

    if (!artworkUrl) {
      return NextResponse.json({ error: "Artwork upload missing." }, { status: 400 });
    }
    await assertDireNoteAssetFormat({ userId: existingRelease.userId, url: artworkUrl, kind: "artwork", label: "Cover artwork" });

    const tracks: EditTrackPayload[] = [];
    for (const track of parsed.metadata.tracks) {
      const audioUpload = formData.get(track.audioFileKey);
      const audioUrl = audioUpload instanceof File
        ? await savePrivate(audioUpload, "private_audio_master")
        : track.uploadedAudioUrl ?? track.existingAudioUrl ?? existingRelease.tracks?.find((item) => item.trackNumber === track.trackNumber)?.audioUrl ?? "";

      if (!audioUrl) {
        return NextResponse.json({ error: `Audio upload missing for ${track.trackTitle}.` }, { status: 400 });
      }
      await assertDireNoteAssetFormat({ userId: existingRelease.userId, url: audioUrl, kind: "audio", label: `Audio for ${track.trackTitle}` });

      let coverLicenseUrl: string | undefined;
      if (track.coverLicenseFileKey) {
        const licenseUpload = formData.get(track.coverLicenseFileKey);
        if (licenseUpload instanceof File) {
          coverLicenseUrl = await savePrivate(licenseUpload, "private_cover_licence");
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
        originalReleaseDate: parsed.metadata.releasePreviouslyReleased ? parsed.metadata.originalReleaseDate : undefined,
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
// vercel trigger 9
