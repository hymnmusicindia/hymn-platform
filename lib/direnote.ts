import type { ArtistProfile, Release } from "@/lib/types";
import {
  DIRENOTE_CONTENT_TYPES,
  DIRENOTE_GENRES,
  DIRENOTE_LANGUAGES,
  DIRENOTE_SUBGENRES_BY_GENRE,
  normalizeDireNoteGenre,
  type DireNoteContentType
} from "@/lib/direnote-config";
import { getDireNoteConfig } from "@/lib/direnote/direnote-config";
import { getPublicAppUrl } from "@/lib/public-app-url";
export { submitToDireNote, getDireNoteReleaseInformation, getDireNoteRevenueReport } from "@/lib/direnote/direnote-client";

export type DireNoteArtist = {
  name: string;
  spotify_url?: string;
  apple_url?: string;
  youtube_url?: string;
  instagram_url?: string;
};

export type DireNoteContributor = {
  name: string;
  ipi?: string;
  iprs_member?: "Yes" | "No";
  instagram_url?: string;
  x_url?: string;
};

export type DireNoteTrack = {
  trackName: string;
  audio_url: string;
  trackGenre?: string;
  trackSubgenre?: string;
  trackLanguage?: string;
  isrc?: string;
  trackVersion?: string;
  previewStart?: string;
  vocalist?: string;
  explicitLyrics: "Yes" | "No";
  trackLyrics?: string;
  previouslyReleased: "Yes" | "No";
  producers?: string[];
  artists?: DireNoteArtist[];
  featuring_artists?: DireNoteArtist[];
  contributors?: Array<{ name: string; role: string }>;
  songwriters: DireNoteContributor[];
  composers: DireNoteContributor[];
};

export type DireNotePayload = {
  pin: string;
  client_id: string;
  albumname: string;
  albumVersion?: string;
  typeOfRelease: "Single" | "EP" | "Album";
  albumGenre: string;
  albumSubgenre: string;
  albumLanguage: string;
  albumMood?: string;
  contenttype: DireNoteContentType;
  trackReleaseDate: string;
  originalReleaseDate?: string;
  presaveSpotify?: string;
  presaveApple?: string;
  exclusiveSpotify?: string;
  exclusiveApple?: string;
  labelName: string;
  cLine: string;
  pLine: string;
  upc?: string;
  youtubeContentID?: "Yes" | "No";
  releasePreviouslyReleased: "Yes" | "No";
  addrequest?: string;
  owner_email?: string;
  cover_art_url: string;
  artists: DireNoteArtist[];
  featuring_artists?: DireNoteArtist[];
  suno_receipt_url?: string;
  sunoLink?: string;
  license_receipt_url?: string;
  tracks: DireNoteTrack[];
};

export type DireNoteSuccessResponse = {
  success: true;
  message?: string;
  album_name?: string;
  upc?: string;
  track_count?: number;
  release_date?: string;
  release_id?: string;
  distributor_release_id?: string;
  cover_art?: string;
  tracks?: Array<{ track_name?: string; isrc?: string; wav_file?: string; status?: string }>;
  warnings?: string[];
  [key: string]: unknown;
};

export type DireNoteErrorResponse = {
  success?: false;
  message?: string;
  error?: string;
  errors?: unknown;
  warnings?: string[];
  [key: string]: unknown;
};

export type DireNoteParsedResponse = {
  raw: unknown;
  success: boolean;
  message: string;
  upc?: string | null;
  distributorReleaseId?: string | null;
  warnings: string[];
  trackIsrcs: Array<{ trackNumber?: number; trackTitle?: string; isrc?: string | null; distributorStatus?: string | null }>;
  status: "sent_to_distributor" | "processing" | "delivered";
};

export type DireNoteValidationIssue = {
  field: string;
  message: string;
  severity?: "error" | "warning";
  suggestion?: string;
};

type ExtendedRelease = Release & Record<string, any>;

type BuildOptions = {
  siteUrl?: string;
  ownerEmail?: string | null;
  artistProfiles?: ArtistProfile[];
  adminConfirmedExistingArtists?: boolean;
};

function splitNames(value?: string | null) {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function hasFirstAndLastName(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function isPublicHttpUrl(value?: string | null) {
  try {
    const url = new URL(value?.trim() ?? "");
    return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname) && !url.hostname.endsWith(".local");
  } catch { return false; }
}

function assetFileName(value?: string | null) {
  try {
    const url = new URL(value?.trim() ?? "");
    return url.searchParams.get("filename") || url.pathname.split("/").pop() || "";
  } catch {
    return value?.split(/[?#]/)[0].split("/").pop() ?? "";
  }
}

function publicUrl(value: string | undefined | null, siteUrl?: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || /^(blob:|file:|data:)/i.test(trimmed)) return "";
  if (isPublicHttpUrl(trimmed)) return trimmed;
  const base = getPublicAppUrl(siteUrl);
  return new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, base).toString();
}

function releaseMeta(release: ExtendedRelease) {
  return { ...release, ...(release.metadata && typeof release.metadata === "object" ? release.metadata : {}) } as Record<string, any>;
}

function normalizeType(value: Release["releaseType"]) {
  if (value === "ep") return "EP";
  if (value === "album") return "Album";
  return "Single";
}

function normalizeContentType(release: ExtendedRelease): DireNoteContentType {
  const meta = releaseMeta(release);
  const raw = String(meta.contenttype ?? meta.contentType ?? meta.ownershipType ?? meta.rightsType ?? meta.licenseType ?? meta.contentOwnershipType ?? "").toLowerCase();
  if (raw.includes("ai")) return "AI Generated";
  if (raw.includes("non") || raw.includes("beat") || raw.includes("license")) return "Non-Exclusive Licensed";
  return "Original/Exclusive Licensed";
}

function getProofUrl(release: ExtendedRelease, keys: string[], siteUrl?: string) {
  const meta = releaseMeta(release);
  for (const key of keys) {
    const resolved = publicUrl(meta[key], siteUrl);
    if (resolved) return resolved;
  }
  return undefined;
}

function pickArtistProfile(name: string, profiles: ArtistProfile[] = []) {
  const normalized = name.trim().toLowerCase();
  return profiles.find((profile) => profile.name.trim().toLowerCase() === normalized);
}

function toDireNoteArtist(name: string, profiles: ArtistProfile[] = [], release?: ExtendedRelease): DireNoteArtist {
  const profile = pickArtistProfile(name, profiles);
  const meta = release ? releaseMeta(release) : {};
  const artistMeta = meta.artistLinks?.[name] ?? meta.artistLinks?.[name.trim().toLowerCase()] ?? {};
  return {
    name,
    spotify_url: profile?.spotifyUrl ?? artistMeta.spotify_url ?? artistMeta.spotifyUrl ?? undefined,
    apple_url: profile?.appleUrl ?? artistMeta.apple_url ?? artistMeta.appleUrl ?? undefined,
    youtube_url: profile?.youtubeUrl ?? artistMeta.youtube_url ?? artistMeta.youtubeUrl ?? meta.youtubeArtistUrl ?? undefined,
    instagram_url: profile?.instagramUrl ?? artistMeta.instagram_url ?? artistMeta.instagramUrl ?? meta.instagramUrl ?? undefined
  };
}

function contributors(value?: string | null, structured?: Array<Record<string, any>>, role?: string): DireNoteContributor[] {
  const matching = structured?.filter((item) => !role || item.role === role) ?? [];
  if (matching.length) return matching.map((item) => ({ name: item.name ?? item.legalName ?? "", ipi: item.ipi || undefined, iprs_member: item.iprsMember === true || item.iprsMember === "Yes" ? "Yes" : "No", instagram_url: item.instagramUrl || item.instagram_url || undefined, x_url: item.xUrl || item.x_url || undefined }));
  return splitNames(value).map((name) => ({ name, iprs_member: "No" }));
}

export function redactDireNotePayload(payload: DireNotePayload) {
  return { ...payload, pin: "[REDACTED]", client_id: "[REDACTED]" };
}

const DIRENOTE_SENSITIVE_KEY = /(?:api[_-]?key|client[_-]?secret|client[_-]?id|authorization|bearer|token|password|pin|secret)/i;
const DIRENOTE_MAX_DIAGNOSTIC_STRING_LENGTH = 4_000;

/**
 * Produces an admin-safe diagnostic record. Provider replies are useful for
 * troubleshooting, but must never become a path for credentials to reach the
 * database or browser (including when a provider nests them in an error).
 */
export function redactDireNoteDiagnostic(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > DIRENOTE_MAX_DIAGNOSTIC_STRING_LENGTH
      ? `${value.slice(0, DIRENOTE_MAX_DIAGNOSTIC_STRING_LENGTH)}…[TRUNCATED]`
      : value;
  }
  if (Array.isArray(value)) return value.map(redactDireNoteDiagnostic);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      DIRENOTE_SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactDireNoteDiagnostic(item)
    ]));
  }
  return value;
}

export function buildDireNotePayload(release: Release, options: BuildOptions = {}): DireNotePayload {
  const extended = release as ExtendedRelease;
  const meta = releaseMeta(extended);
  const primaryArtists = splitNames(release.artistName || release.tracks?.[0]?.primaryArtist).map((name) => toDireNoteArtist(name, options.artistProfiles, extended));
  const featuringArtists = splitNames(release.tracks?.flatMap((track) => splitNames(track.featuredArtists)).join(",")).map((name) => toDireNoteArtist(name, options.artistProfiles, extended));
  const contenttype = normalizeContentType(extended);
  const normalizedGenre = normalizeDireNoteGenre(release.primaryGenre || release.genre, release.secondaryGenre);
  const isPreviouslyReleased = release.releasePreviouslyReleased !== undefined ? Boolean(release.releasePreviouslyReleased) : meta.releasePreviouslyReleased !== undefined ? Boolean(meta.releasePreviouslyReleased) : Boolean(meta.previouslyReleased);
  const moodCandidate = release.mood || meta.mood || meta.formData?.mood || "";
  const mood = typeof moodCandidate === "string" ? moodCandidate.trim() : "";

  const payload: DireNotePayload = {
    pin: getDireNoteConfig().pin || "",
    client_id: getDireNoteConfig().clientId || "",
    albumname: release.releaseTitle,
    albumVersion: meta.albumVersion ?? meta.version ?? meta.edition ?? undefined,
    typeOfRelease: normalizeType(release.releaseType),
    albumGenre: normalizedGenre.genre,
    albumSubgenre: normalizedGenre.subgenre,
    albumLanguage: release.language || "",
    albumMood: mood || undefined,
    contenttype,
    trackReleaseDate: release.releaseDate,
    originalReleaseDate: isPreviouslyReleased ? (release.originalReleaseDate || undefined) : undefined,
    presaveSpotify: meta.presaveSpotify ?? meta.spotifyPresaveDate ?? undefined,
    presaveApple: meta.presaveApple ?? meta.applePresaveDate ?? undefined,
    exclusiveSpotify: meta.exclusiveSpotify ?? meta.spotifyExclusiveDate ?? undefined,
    exclusiveApple: meta.exclusiveApple ?? meta.appleExclusiveDate ?? undefined,
    labelName: release.labelName || release.labelDisplayName || "",
    cLine: release.copyrightOwner ?? "",
    pLine: release.publishingRights ?? "",
    upc: release.upcCode || undefined,
    youtubeContentID: typeof release.youtubeContentIdEnabled === "boolean" ? (release.youtubeContentIdEnabled ? "Yes" : "No") : undefined,
    releasePreviouslyReleased: isPreviouslyReleased ? "Yes" : "No",
    addrequest: meta.adminInstructions ?? meta.reviewNote ?? meta.addrequest ?? undefined,
    owner_email: options.ownerEmail || meta.ownerEmail || undefined,
    cover_art_url: publicUrl(release.artworkUrl, options.siteUrl),
    artists: primaryArtists,
    featuring_artists: featuringArtists,
    tracks: (release.tracks ?? []).map((track) => ({
      trackName: track.trackTitle,
      audio_url: publicUrl(track.audioUrl, options.siteUrl),
      trackGenre: normalizedGenre.genre || undefined,
      trackSubgenre: normalizedGenre.subgenre || undefined,
      trackLanguage: release.language || undefined,
      isrc: track.isrc || undefined,
      trackVersion: track.version || "",
      previewStart: String((track as any).previewStart || 30),
      vocalist: (track as any).vocalist || undefined,
      explicitLyrics: track.explicitContent ? "Yes" : "No",
      trackLyrics: (track as any).lyrics || (track as any).trackLyrics || undefined,
      previouslyReleased: ((track as any).previouslyReleased || isPreviouslyReleased) ? "Yes" : "No",
      producers: splitNames((track as any).producers ?? (track as any).producer),
      artists: splitNames(track.primaryArtist || release.artistName).map((name) => toDireNoteArtist(name, options.artistProfiles, extended)),
      featuring_artists: splitNames(track.featuredArtists).map((name) => toDireNoteArtist(name, options.artistProfiles, extended)),
      songwriters: contributors(track.songwriters, track.contributors as any, "songwriter"),
      composers: contributors(track.composers, track.contributors as any, "composer"),
      contributors: Array.isArray(track.contributors) ? track.contributors.map((contributor: any) => ({ name: String(contributor.name ?? contributor.legalName ?? "").trim(), role: String(contributor.role ?? "").trim() })).filter((contributor) => contributor.name && contributor.role) : undefined
    }))
  };

  if (contenttype === "AI Generated") {
    payload.suno_receipt_url = getProofUrl(extended, ["suno_receipt_url", "sunoReceiptUrl"], options.siteUrl);
    payload.sunoLink = meta.sunoLink ?? meta.suno_link ?? undefined;
  }
  if (contenttype === "Non-Exclusive Licensed") {
    payload.license_receipt_url = getProofUrl(extended, ["license_receipt_url", "licenseReceiptUrl", "licenseDocumentUrl", "beatLicenseUrl"], options.siteUrl);
  }

  return payload;
}

function pushMissing(issues: DireNoteValidationIssue[], field: string, value: unknown, message: string) {
  const missing = value == null || String(value).trim() === "";
  if (missing) issues.push({ field, message, severity: "error" });
  return missing;
}

function validatePublicPdf(issues: DireNoteValidationIssue[], field: string, value?: string) {
  if (!value) return;
  if (!isPublicHttpUrl(value)) issues.push({ field, message: `${field} must be a public HTTP(S) URL.` });
  if (!/\.pdf$/i.test(assetFileName(value))) issues.push({ field, message: `${field} must link to a PDF file.` });
}

function validateArtists(issues: DireNoteValidationIssue[], artists: DireNoteArtist[] | undefined, path: string, requireInstagram: boolean) {
  for (const [index, artist] of (artists ?? []).entries()) {
    pushMissing(issues, `${path}.${index}.name`, artist.name, "Artist name is required.");
    if (requireInstagram) pushMissing(issues, `${path}.${index}.instagram_url`, artist.instagram_url, "Instagram profile link is required for artist verification and DireNote artist provisioning.");
    for (const [field, value] of Object.entries(artist).filter(([field]) => field.endsWith("_url"))) {
      if (value && !isPublicHttpUrl(value)) issues.push({ field: `${path}.${index}.${field}`, message: `${field} must be a public HTTP(S) URL.` });
    }
  }
}

function parseDateOnly(value?: string) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysFromToday(value?: string) {
  const date = parseDateOnly(value);
  if (!date) return null;
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((date.getTime() - start) / 86400000);
}

function isBefore(left?: string, right?: string) {
  const leftDate = parseDateOnly(left);
  const rightDate = parseDateOnly(right);
  return Boolean(leftDate && rightDate && leftDate.getTime() < rightDate.getTime());
}

export function validateDireNotePayload(payload: DireNotePayload, options: { adminConfirmedExistingArtists?: boolean } = {}) {
  const issues: DireNoteValidationIssue[] = [];
  const warnings: DireNoteValidationIssue[] = [];

  pushMissing(issues, "pin", payload.pin, "DireNote API PIN is not configured.");
  pushMissing(issues, "client_id", payload.client_id, "DireNote client ID is not configured.");
  if (!payload.owner_email?.trim()) warnings.push({ field: "owner_email", message: "Owner email is missing. DireNote can still process the release, but HYMN recommends attaching the user email for processing communication.", severity: "warning", suggestion: "Attach the HYMN account email before submission." });
  pushMissing(issues, "albumname", payload.albumname, "Album name is required.");
  pushMissing(issues, "typeOfRelease", payload.typeOfRelease, "Release type is required.");
  pushMissing(issues, "albumGenre", payload.albumGenre, "Album genre is required.");
  pushMissing(issues, "albumLanguage", payload.albumLanguage, "Album language is required.");
  if (pushMissing(issues, "albumMood", payload.albumMood, "Mood is missing. Select a mood before sending to DireNote.")) {
    issues[issues.length - 1].suggestion = "Select a mood in the release metadata.";
  }
  pushMissing(issues, "contenttype", payload.contenttype, "Content type is required.");
  pushMissing(issues, "trackReleaseDate", payload.trackReleaseDate, "Release date is required.");
  pushMissing(issues, "labelName", payload.labelName, "Label name is required.");
  pushMissing(issues, "cLine", payload.cLine, "Copyright line is required.");
  pushMissing(issues, "pLine", payload.pLine, "Publishing line is required.");
  if (!pushMissing(issues, "cover_art_url", payload.cover_art_url, "Cover artwork must resolve to a public URL.")) {
    if (!isPublicHttpUrl(payload.cover_art_url)) issues.push({ field: "cover_art_url", message: "Cover artwork must be a public HTTP(S) URL." });
    else if (!/\.jpe?g$/i.test(assetFileName(payload.cover_art_url))) issues.push({ field: "cover_art_url", message: "DireNote cover artwork must be JPEG. Convert PNG to JPEG before submission." });
  }

  if (!DIRENOTE_GENRES.includes(payload.albumGenre as any)) issues.push({ field: "albumGenre", message: `Genre "${payload.albumGenre}" is not in DireNote allowed values.` });
  if (!DIRENOTE_SUBGENRES_BY_GENRE[payload.albumGenre]?.includes(payload.albumSubgenre)) issues.push({ field: "albumSubgenre", message: `Subgenre "${payload.albumSubgenre}" is not valid for ${payload.albumGenre}.` });
  if (!DIRENOTE_LANGUAGES.includes(payload.albumLanguage as any)) issues.push({ field: "albumLanguage", message: `Language "${payload.albumLanguage}" is not in DireNote allowed values.` });
  if (!DIRENOTE_CONTENT_TYPES.includes(payload.contenttype)) issues.push({ field: "contenttype", message: "DireNote content type is invalid." });
  if (!payload.artists.length) issues.push({ field: "artists", message: "At least one primary artist is required." });

  if (payload.typeOfRelease === "Single") {
    if (payload.tracks.length !== 1) issues.push({ field: "tracks", message: "Singles must have exactly 1 track." });
    if (payload.tracks[0]?.trackName !== payload.albumname) issues.push({ field: "albumname", message: "For Singles, albumname must exactly match the only track's trackName." });
  }
  if ((payload.typeOfRelease === "EP" || payload.typeOfRelease === "Album") && payload.tracks.length < 2) issues.push({ field: "tracks", message: `${payload.typeOfRelease}s must have at least 2 tracks.` });
  if (payload.releasePreviouslyReleased === "Yes") {
    pushMissing(issues, "upc", payload.upc, "Previously released releases require their existing UPC.");
    payload.tracks.forEach((track, index) => pushMissing(issues, `tracks.${index}.isrc`, track.isrc, `Previously released track ${index + 1} requires its existing ISRC.`));
  }

  const releaseDays = daysFromToday(payload.trackReleaseDate);
  if (releaseDays == null) issues.push({ field: "trackReleaseDate", message: "Release date is invalid." });
  else if (releaseDays < 2) issues.push({ field: "trackReleaseDate", message: "DireNote requires trackReleaseDate to be at least 2 days from today." });

  if (payload.presaveSpotify && !isBefore(payload.presaveSpotify, payload.trackReleaseDate)) issues.push({ field: "presaveSpotify", message: "Spotify presave date must be before trackReleaseDate." });
  if (payload.presaveApple && !isBefore(payload.presaveApple, payload.trackReleaseDate)) issues.push({ field: "presaveApple", message: "Apple presave date must be before trackReleaseDate." });
  if (payload.exclusiveSpotify && (daysFromToday(payload.exclusiveSpotify) ?? -1) <= 0) issues.push({ field: "exclusiveSpotify", message: "Spotify exclusive date must be a future date." });
  if (payload.exclusiveApple && (daysFromToday(payload.exclusiveApple) ?? -1) <= 0) issues.push({ field: "exclusiveApple", message: "Apple exclusive date must be a future date." });
  if (payload.originalReleaseDate) {
    if ((daysFromToday(payload.originalReleaseDate) ?? 1) >= 0) issues.push({ field: "originalReleaseDate", message: "originalReleaseDate must be in the past." });
    if (payload.releasePreviouslyReleased !== "Yes") issues.push({ field: "releasePreviouslyReleased", message: "originalReleaseDate should only be used for re-releases." });
  }

  if (payload.contenttype === "AI Generated") {
    pushMissing(issues, "suno_receipt_url", payload.suno_receipt_url, "AI Generated releases require suno_receipt_url.");
    pushMissing(issues, "sunoLink", payload.sunoLink, "AI Generated releases require sunoLink.");
  }
  if (payload.contenttype === "Non-Exclusive Licensed") {
    pushMissing(issues, "license_receipt_url", payload.license_receipt_url, "Non-Exclusive Licensed releases require license_receipt_url.");
  }
  validatePublicPdf(issues, "suno_receipt_url", payload.suno_receipt_url);
  validatePublicPdf(issues, "license_receipt_url", payload.license_receipt_url);

  // DireNote needs Instagram only when it must provision an artist. A trusted
  // admin may confirm that a linked profile already exists; customers cannot
  // set this server-side option themselves.
  const requireInstagram = !options.adminConfirmedExistingArtists;
  validateArtists(issues, payload.artists, "artists", requireInstagram);
  validateArtists(issues, payload.featuring_artists, "featuring_artists", requireInstagram);

  payload.tracks.forEach((track, index) => {
    const number = index + 1;
    pushMissing(issues, `tracks.${index}.trackName`, track.trackName, `Track ${number} requires a title.`);
    const missingAudioUrl = pushMissing(issues, `tracks.${index}.audio_url`, track.audio_url, `Track ${number} audio URL is required.`);
    if (!track.songwriters.length) issues.push({ field: `tracks.${index}.songwriters`, message: `Track ${number} requires at least one songwriter.` });
    if (!track.composers.length) issues.push({ field: `tracks.${index}.composers`, message: `Track ${number} requires at least one composer.` });
    if (!missingAudioUrl) {
      if (!isPublicHttpUrl(track.audio_url)) issues.push({ field: `tracks.${index}.audio_url`, message: `Track ${number} audio must be a public HTTP(S) URL.` });
      else if (!/\.(wav|mp3)$/i.test(assetFileName(track.audio_url))) issues.push({ field: `tracks.${index}.audio_url`, message: `Track ${number} audio must be WAV or MP3.` });
    }
    if (track.explicitLyrics === "Yes" && !track.trackLyrics?.trim()) issues.push({ field: `tracks.${index}.trackLyrics`, message: "Explicit tracks require lyrics before DireNote submission." });
    if (track.trackGenre && !DIRENOTE_GENRES.includes(track.trackGenre as any)) issues.push({ field: `tracks.${index}.trackGenre`, message: `Track ${number} genre is not DireNote-compatible.` });
    if (track.trackSubgenre && track.trackGenre && !DIRENOTE_SUBGENRES_BY_GENRE[track.trackGenre]?.includes(track.trackSubgenre)) issues.push({ field: `tracks.${index}.trackSubgenre`, message: `Track ${number} subgenre is not valid for ${track.trackGenre}.` });
    if (track.trackLanguage && !DIRENOTE_LANGUAGES.includes(track.trackLanguage as any)) issues.push({ field: `tracks.${index}.trackLanguage`, message: `Track ${number} language is not DireNote-compatible.` });
    validateArtists(issues, track.artists, `tracks.${index}.artists`, requireInstagram);
    validateArtists(issues, track.featuring_artists, `tracks.${index}.featuring_artists`, requireInstagram);
    for (const contributor of [...track.songwriters, ...track.composers]) {
      if (!hasFirstAndLastName(contributor.name)) issues.push({ field: `tracks.${index}.credits`, message: "Songwriter/Composer must include first and last name. Stage names or mononyms are not accepted by DireNote." });
    }
  });

  const uniqueIssues = Array.from(new Map(issues.map((issue) => [`${issue.field}:${issue.message}`, issue])).values());
  const uniqueWarnings = Array.from(new Map(warnings.map((issue) => [`${issue.field}:${issue.message}`, issue])).values());
  return { ok: uniqueIssues.length === 0, issues: uniqueIssues.map((issue) => ({ ...issue, severity: "error" as const })), warnings: uniqueWarnings.map((issue) => ({ ...issue, severity: "warning" as const })) };
}

export function parseDireNoteResponse(response: unknown): DireNoteParsedResponse {
  const record = (response ?? {}) as DireNoteSuccessResponse | DireNoteErrorResponse;
  const nested = [record, (record as any).data, (record as any).result, (record as any).release].find((value) => value && typeof value === "object" && (value.upc || value.UPC || value.tracks)) as any ?? record;
  const success = record.success === true || nested.success === true;
  const tracks = Array.isArray(nested.tracks) ? nested.tracks : Array.isArray((record as any).tracks) ? (record as any).tracks : [];
  const upc = nested.upc ?? nested.UPC ?? nested.upc_code ?? nested.upcCode ?? (record as any).upc ?? (record as any).UPC;
  return {
    raw: response,
    success,
    message: String(record.message ?? record.error ?? (success ? "DireNote accepted release." : "DireNote rejected release.")),
    upc: typeof upc === "string" || typeof upc === "number" ? String(upc).trim() || null : null,
    distributorReleaseId: typeof nested.distributor_release_id === "string" ? nested.distributor_release_id : typeof nested.release_id === "string" ? nested.release_id : null,
    warnings: Array.isArray(record.warnings) ? record.warnings.map(String) : [],
    trackIsrcs: tracks.map((track: any, index: number) => ({
      trackNumber: index + 1,
      trackTitle: track.track_name ?? track.trackName ?? track.title,
      isrc: track.isrc ?? track.ISRC ?? null,
      distributorStatus: track.status ?? null
    })),
    status: "processing"
  };
}

// vercel trigger

// vercel trigger
// vercel trigger 4
// vercel trigger 8
// vercel trigger 9

// vercel trigger 14
