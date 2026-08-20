import {
  createReleaseAuditLog,
  getDetailedReleaseById,
  logDistributionEvent,
  markReleaseDistributionSuccess,
  updateDetailedReleaseStatus
} from "@/lib/distribution-db";
import type { Release, ReleaseTrack } from "@/lib/types";

export type DistributionValidationIssue = {
  field: string;
  message: string;
};

export type DistributorPayload = {
  client_id: string;
  release: Record<string, unknown>;
  tracks: Array<Record<string, unknown>>;
};

type DistributorResponse = {
  raw: unknown;
  distributorReleaseId?: string | null;
  upc?: string | null;
  warnings: string[];
  trackIsrcs: Array<{ trackNumber?: number; trackTitle?: string; isrc?: string | null; distributorStatus?: string | null }>;
  status: "sent_to_distributor" | "processing" | "delivered";
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for distributor submission.`);
  return value;
}

function hasFirstAndLastName(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function splitNames(value?: string | null) {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function publicUrl(value: string | undefined | null, siteUrl?: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = siteUrl?.trim() || process.env.PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.APP_URL?.trim();
  if (!base) return "";
  return new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, base).toString();
}

function validateContributorList(label: string, names: string[], issues: DistributionValidationIssue[], trackNumber: number) {
  if (!names.length) {
    issues.push({ field: `tracks.${trackNumber}.${label}`, message: `Track ${trackNumber} requires at least one ${label}.` });
    return;
  }
  for (const name of names) {
    if (!hasFirstAndLastName(name)) {
      issues.push({ field: `tracks.${trackNumber}.${label}`, message: `${label} "${name}" must include first and last name.` });
    }
  }
}

export function validateRelease(release: Release, options: { siteUrl?: string } = {}) {
  const issues: DistributionValidationIssue[] = [];
  const tracks = release.tracks ?? [];
  const artworkUrl = publicUrl(release.artworkUrl, options.siteUrl);

  if (!release.releaseTitle?.trim()) issues.push({ field: "releaseTitle", message: "Release title is required." });
  if (!release.artistName?.trim()) issues.push({ field: "artistName", message: "Primary artist is required." });
  if (!["single", "ep", "album"].includes(release.releaseType)) issues.push({ field: "releaseType", message: "Release type is invalid." });
  if (!release.primaryGenre?.trim()) issues.push({ field: "primaryGenre", message: "Genre is required." });
  if (!release.secondaryGenre?.trim()) issues.push({ field: "secondaryGenre", message: "Subgenre is required." });
  if (!release.language?.trim()) issues.push({ field: "language", message: "Language is required." });
  if (!release.releaseDate?.trim()) issues.push({ field: "releaseDate", message: "Release date is required." });
  if (!release.labelName?.trim() && !release.labelDisplayName?.trim()) issues.push({ field: "labelName", message: "Label name is required." });
  if (!release.copyrightOwner?.trim()) issues.push({ field: "copyrightOwner", message: "Copyright line / owner is required." });
  if (!artworkUrl) issues.push({ field: "artworkUrl", message: "Cover artwork must resolve to a public URL. Configure PUBLIC_SITE_URL for local uploads." });
  if (!tracks.length) issues.push({ field: "tracks", message: "At least one track is required." });
  if (release.releaseType === "single" && tracks.length !== 1) issues.push({ field: "tracks", message: "Singles must have exactly 1 track." });
  if ((release.releaseType === "ep" || release.releaseType === "album") && tracks.length < 2) issues.push({ field: "tracks", message: "EPs and albums must have at least 2 tracks." });

  tracks.forEach((track, index) => {
    const trackNumber = track.trackNumber || index + 1;
    const audioUrl = publicUrl(track.audioUrl, options.siteUrl);
    if (!track.trackTitle?.trim()) issues.push({ field: `tracks.${trackNumber}.trackTitle`, message: `Track ${trackNumber} requires a title.` });
    if (!track.primaryArtist?.trim()) issues.push({ field: `tracks.${trackNumber}.primaryArtist`, message: `Track ${trackNumber} requires a primary artist.` });
    if (!audioUrl) issues.push({ field: `tracks.${trackNumber}.audioUrl`, message: `Track ${trackNumber} audio must resolve to a public URL.` });
    validateContributorList("songwriters", splitNames(track.songwriters), issues, trackNumber);
    validateContributorList("composers", splitNames(track.composers), issues, trackNumber);
    if (track.isCover && !track.coverLicenseConfirmed) issues.push({ field: `tracks.${trackNumber}.coverLicense`, message: `Track ${trackNumber} requires cover/license proof.` });
  });

  return { ok: issues.length === 0, issues };
}

function mapArtists(track: ReleaseTrack) {
  return {
    primary: splitNames(track.primaryArtist),
    featuring: splitNames(track.featuredArtists),
    additional_primary: splitNames(track.additionalPrimaryArtists)
  };
}

export function buildDistributorPayload(release: Release, options: { siteUrl?: string } = {}): DistributorPayload {
  const clientId = requiredEnv("DISTRIBUTOR_CLIENT_ID");
  return {
    client_id: clientId,
    release: {
      id: release.id,
      album_name: release.releaseTitle,
      release_name: release.trackName || release.releaseTitle,
      release_type: release.releaseType,
      genre: release.primaryGenre,
      subgenre: release.secondaryGenre,
      language: release.language,
      release_date: release.releaseDate,
      original_release_date: release.originalReleaseDate ?? null,
      label_name: release.labelName ?? release.labelDisplayName ?? null,
      copyright_line: release.copyrightOwner ?? null,
      phonographic_copyright_line: release.publishingRights ?? release.copyrightOwner ?? null,
      upc: release.upcCode ?? null,
      youtube_content_id: Boolean(release.youtubeContentIdEnabled),
      owner_email: null,
      artwork_url: publicUrl(release.artworkUrl, options.siteUrl),
      platforms: release.platforms ?? [],
      territory: release.territory ?? "Worldwide"
    },
    tracks: (release.tracks ?? []).map((track) => ({
      track_number: track.trackNumber,
      track_name: track.trackTitle,
      track_version: track.version ?? null,
      isrc: track.isrc ?? null,
      audio_url: publicUrl(track.audioUrl, options.siteUrl),
      genre: release.primaryGenre,
      subgenre: release.secondaryGenre,
      language: release.language,
      preview_start: null,
      explicit_lyrics: track.explicitContent,
      previously_released: Boolean(release.originalReleaseDate),
      artists: mapArtists(track),
      producer_credits: splitNames(track.producers),
      songwriters: splitNames(track.songwriters).map((name) => ({ full_name: name })),
      composers: splitNames(track.composers).map((name) => ({ full_name: name })),
      cover: {
        is_cover: track.isCover,
        original_artist: track.originalArtist ?? null,
        original_track_link: track.originalTrackLink ?? null,
        license_url: publicUrl(track.coverLicenseUrl, options.siteUrl) || null
      }
    }))
  };
}

function parseDistributorResponse(data: unknown): DistributorResponse {
  const record = (data ?? {}) as Record<string, any>;
  const releaseRecord = (record.release ?? record.data ?? record) as Record<string, any>;
  const tracks = (releaseRecord.tracks ?? record.tracks ?? []) as Array<Record<string, any>>;
  return {
    raw: data,
    distributorReleaseId: releaseRecord.id ?? releaseRecord.release_id ?? releaseRecord.distributor_release_id ?? null,
    upc: releaseRecord.upc ?? releaseRecord.upc_code ?? record.upc ?? null,
    warnings: Array.isArray(record.warnings) ? record.warnings.map(String) : [],
    trackIsrcs: tracks.map((track) => ({
      trackNumber: Number(track.track_number ?? track.sequence ?? 0) || undefined,
      trackTitle: track.track_name ?? track.title,
      isrc: track.isrc ?? null,
      distributorStatus: track.status ?? null
    })),
    status: releaseRecord.status === "delivered" ? "delivered" : releaseRecord.status === "processing" ? "processing" : "sent_to_distributor"
  };
}

export async function submitRelease(releaseId: number, options: { actorId?: number | null; siteUrl?: string; retry?: boolean } = {}) {
  const release = await getDetailedReleaseById(releaseId);
  if (!release) throw new Error("Release not found.");

  await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: options.retry ? "DISTRIBUTION_RETRY_STARTED" : "APPROVE_RELEASE_STARTED" });

  const validation = validateRelease(release, { siteUrl: options.siteUrl });
  if (!validation.ok) {
    await updateDetailedReleaseStatus(releaseId, "failed", "Distributor validation failed.");
    await logDistributionEvent({
      releaseId,
      requestPayload: null,
      responsePayload: null,
      errors: validation.issues.map((issue) => issue.message),
      success: false
    });
    await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: "DISTRIBUTION_VALIDATION_FAILED", details: validation.issues });
    return { release: await getDetailedReleaseById(releaseId), validation, submitted: false };
  }

  const endpoint = requiredEnv("DISTRIBUTOR_RELEASE_ENDPOINT");
  const apiPin = requiredEnv("DISTRIBUTOR_API_PIN");
  const payload = buildDistributorPayload(release, { siteUrl: options.siteUrl });
  await updateDetailedReleaseStatus(releaseId, "queued_for_distribution", "Validated and queued for distributor API.");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-ID": process.env.DISTRIBUTOR_CLIENT_ID ?? "",
        "X-API-PIN": apiPin
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 408;
      await updateDetailedReleaseStatus(releaseId, retryable ? "queued_for_distribution" : "failed", `Distributor API returned ${response.status}.`);
      await logDistributionEvent({ releaseId, requestPayload: payload, responsePayload: data, errors: [`HTTP ${response.status}`], success: false });
      await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: retryable ? "DISTRIBUTION_RETRYABLE_ERROR" : "DISTRIBUTION_FAILED", details: { status: response.status } });
      return { release: await getDetailedReleaseById(releaseId), validation, submitted: false, retryable };
    }

    const parsed = parseDistributorResponse(data);
    const updatedRelease = await markReleaseDistributionSuccess({
      releaseId,
      status: parsed.status,
      distributorReleaseId: parsed.distributorReleaseId,
      upc: parsed.upc,
      trackIsrcs: parsed.trackIsrcs
    });
    await logDistributionEvent({ releaseId, requestPayload: payload, responsePayload: data, warnings: parsed.warnings, success: true });
    await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: "DISTRIBUTION_SUBMITTED", details: { upc: parsed.upc, distributorReleaseId: parsed.distributorReleaseId } });
    return { release: updatedRelease, validation, submitted: true, retryable: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Distributor submission failed.";
    await updateDetailedReleaseStatus(releaseId, "queued_for_distribution", message);
    await logDistributionEvent({ releaseId, requestPayload: payload, responsePayload: null, errors: [message], success: false });
    await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: "DISTRIBUTION_NETWORK_ERROR", details: { message } });
    return { release: await getDetailedReleaseById(releaseId), validation, submitted: false, retryable: true };
  }
}

export async function retrySubmission(releaseId: number, options: { actorId?: number | null; siteUrl?: string } = {}) {
  return submitRelease(releaseId, { ...options, retry: true });
}

export const DistributionService = {
  validateRelease,
  buildDistributorPayload,
  submitRelease,
  retrySubmission,
  logDistributionEvent
};
