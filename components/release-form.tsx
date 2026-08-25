"use client";

import clsx from "clsx";
import {
  AlertCircle,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Clock3,
  Crown,
  Disc3,
  LoaderCircle,
  Search,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  GripVertical,
  LockKeyhole,
  Plus,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { ArtistPicker } from "@/components/artist-picker";
import { AudioWaveform } from "@/components/audio-waveform";
import { GenreSelector } from "@/components/genre-selector";
import { MoodSelector } from "@/components/mood-selector";
import {
  ContributorsModal,
  CountrySelector,
  MonetisationConsentModal,
  SuccessState,
  YoutubeContentIdModal,
  createMonetisationClauseState,
  type ContributorDraft,
  type ContributorModalState,
  type MonetisationClauseState,
  ArtworkWarning,
} from "@/components/release-form-support";

type PrivateUploadType = "private_audio_master" | "private_unreleased_artwork" | "private_cover_licence";

function uploadPrivateAsset(file: File, assetType: PrivateUploadType, options: { releaseId?: number; signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {}) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/assets");
    request.responseType = "json";
    request.upload.onprogress = (event) => options.onProgress?.(event.loaded, event.total || file.size);
    request.onerror = () => reject(new Error("Could not reach the upload service."));
    request.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    request.onload = () => {
      const body = typeof request.response === "string"
        ? (() => { try { return JSON.parse(request.response); } catch { return {}; } })()
        : request.response || {};
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(body.error || `Private upload failed (HTTP ${request.status || "unknown"}).`));
        return;
      }
      if (!body.asset?.downloadPath) {
        reject(new Error("The upload completed without a download path."));
        return;
      }
      resolve(body.asset.downloadPath);
    };
    options.signal?.addEventListener("abort", () => request.abort(), { once: true });
    const form = new FormData();
    form.set("file", file);
    form.set("assetType", assetType);
    if (options.releaseId) form.set("releaseId", String(options.releaseId));
    request.send(form);
  });
}

async function uploadPrivateAudio(file: File, options: { releaseId?: number; signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {}) {
  const size = 8 * 1024 * 1024;
  const total = Math.ceil(file.size / size);
  const uploadId = crypto.randomUUID();
  const uploaded = new Array<number>(total).fill(0);
  let nextIndex = 0;

  const uploadChunk = async (index: number) => {
    const start = index * size;
    const chunk = file.slice(start, Math.min(start + size, file.size));
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/assets/chunk");
      request.responseType = "json";
      request.upload.onprogress = (event) => {
        uploaded[index] = Math.min(event.loaded, chunk.size);
        options.onProgress?.(uploaded.reduce((sum, value) => sum + value, 0), file.size);
      };
      request.onerror = () => reject(new Error("Could not reach the chunk upload service."));
      request.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
      request.onload = () => {
        const body = typeof request.response === "string"
          ? (() => { try { return JSON.parse(request.response); } catch { return {}; } })()
          : request.response || {};
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(body.error || `Audio upload failed (HTTP ${request.status || "unknown"}).`));
          return;
        }
        uploaded[index] = chunk.size;
        options.onProgress?.(uploaded.reduce((sum, value) => sum + value, 0), file.size);
        resolve();
      };
      options.signal?.addEventListener("abort", () => request.abort(), { once: true });
      const form = new FormData();
      form.set("chunk", chunk, `${index}.part`);
      form.set("uploadId", uploadId);
      form.set("fileName", file.name);
      form.set("mimeType", file.type);
      form.set("byteSize", String(file.size));
      form.set("index", String(index));
      form.set("total", String(total));
      if (options.releaseId) form.set("releaseId", String(options.releaseId));
      request.send(form);
    });
  };

  const workers = Array.from({ length: Math.min(3, total) }, async () => {
    while (nextIndex < total) {
      const index = nextIndex++;
      await uploadChunk(index);
    }
  });
  await Promise.all(workers);

  const response = await fetch("/api/assets/chunk/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({ uploadId, fileName: file.name, mimeType: file.type, byteSize: file.size, total, releaseId: options.releaseId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Could not finalize audio upload (HTTP ${response.status}).`);
  if (!body.asset?.downloadPath) throw new Error("Hostinger received the audio but did not finalize it.");
  return body.asset.downloadPath as string;
}
import { ArtworkSquareDropzone } from "@/components/artwork-square-dropzone";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ContextualHelp } from "@/components/contextual-help";
import {
  findDistributionPlan,
  type DistributionPlanOption,
} from "@/lib/distribution-plans";
import {
  getTrackPricingQuote,
  getUgcAddonPrice,
} from "@/lib/distribution-pricing";
import {
  socialPlatforms,
  storePlatforms,
  versionOptions,
} from "@/lib/release-config";
import type {
  ArtistProfile,
  ContributorCredit,
  DistributionQueueSummary,
  Release,
} from "@/lib/types";
import { DIRENOTE_LANGUAGES } from "@/lib/direnote-config";
import type { ReleasePrefillSuggestion } from "@/lib/release-prefill";

type TrackDraft = {
  id: string;
  trackNumber: number;
  trackTitle: string;
  existingIsrcCode: string;
  versionPreset: string;
  customVersion: string;
  primaryArtistIds: number[];
  primaryArtistQuery: string;
  featuredArtists: string;
  remixers: string;
  songwriters: ContributorDraft[];
  composers: ContributorDraft[];
  producers: ContributorDraft[];
  isCover: boolean;
  originalArtist: string;
  originalTrackLink: string;
  coverLicenseFile: File | null;
  coverLicenseFileName: string;
  existingCoverLicenseConfirmed: boolean;
  audioFile: File | null;
  audioFileName: string;
  existingAudioUrl: string;
  audioUploadStatus: "idle" | "uploading" | "uploaded" | "failed";
  requiresAudioReplacement: boolean;
  audioPreviewUrl: string;
  duration: string;
  titleLanguage: string;
  explicitContent: boolean;
  dolbyAtmos: boolean;
};

type ReleaseDraft = {
  releasePreviouslyReleased: boolean;
  upcCode: string;
  existingIsrcCode: string;
  releaseTitle: string;
  recordLabelName: string;
  primaryGenre: string;
  secondaryGenre: string;
  mood: string;
  language: string;
  territory: "Worldwide" | "Selected countries";
  selectedCountries: string[];
  releaseTiming: "quick_release" | "schedule_release";
  scheduledReleaseDate: string;
  copyrightOwner: string;
  publishingRights: string;
};

type LegalState = {
  ownershipConfirmation: boolean;
  noInfringement: boolean;
  collaboratorsCredited: boolean;
  platformGuidelines: boolean;
  hymnNotLiable: boolean;
  termsAccepted: boolean;
  falseMetadataAcknowledged: boolean;
  fraudWarningAccepted: boolean;
};

type ValidationIssue = {
  key: string;
  step: number;
  message: string;
  trackIndex?: number;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const steps = [
  "Add music",
  "Artists",
  "Release info",
  "Tracks",
  "Artwork & audio",
  "Delivery",
  "",
  "Review & submit",
] as const;
const visibleStepIndexes = [1, 0, 3, 2, 4, 5, 7] as const;
const menuStepIndexes = [3, 2, 4, 5, 7] as const;
const COPYRIGHT_OWNER_PREFERENCES_KEY = "hymn:copyright-owner-preferences";
const defaultLegalState: LegalState = {
  ownershipConfirmation: false,
  noInfringement: false,
  collaboratorsCredited: false,
  platformGuidelines: false,
  hymnNotLiable: false,
  termsAccepted: false,
  falseMetadataAcknowledged: false,
  fraudWarningAccepted: false,
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createContributor(): ContributorDraft {
  return {
    id: createId(),
    legalName: "",
    artistName: "",
    ipi: "",
    iprsMember: false,
    instagramUrl: "",
    xUrl: "",
  };
}

function createTrack(trackNumber = 1): TrackDraft {
  return {
    id: createId(),
    trackNumber,
    trackTitle: "",
    existingIsrcCode: "",
    versionPreset: "Original",
    customVersion: "",
    primaryArtistIds: [],
    primaryArtistQuery: "",
    featuredArtists: "",
    remixers: "",
    songwriters: [createContributor()],
    composers: [createContributor()],
    producers: [createContributor()],
    isCover: false,
    originalArtist: "",
    originalTrackLink: "",
    coverLicenseFile: null,
    coverLicenseFileName: "",
    existingCoverLicenseConfirmed: false,
    audioFile: null,
    audioFileName: "",
    existingAudioUrl: "",
    audioUploadStatus: "idle",
    requiresAudioReplacement: false,
    audioPreviewUrl: "",
    duration: "",
    titleLanguage: "English",
    explicitContent: false,
    dolbyAtmos: false,
  };
}

function isPlaceholderTrackTitle(value: string) {
  return /^(?:track\s*\d+|untitled(?:\s+(?:track|single|release))?)$/i.test(value.trim());
}

function correctionMentions(release: Release | null | undefined, pattern: RegExp) {
  return Boolean(release?.reviewIssues?.fields.some((issue) => pattern.test(`${issue.field} ${issue.label} ${issue.note ?? ""}`)));
}
function fileNameFromUrl(value: string) {
  if (!value) return "";
  const clean = value.split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return decodeURIComponent(parts[parts.length - 1] || "");
}

function splitContributorNames(value?: string | null) {
  const names = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) return [createContributor()];
  return names.map((name) => ({
    id: createId(),
    legalName: name,
    artistName: "",
  }));
}

function safeRevokePreviewUrl(value: string) {
  if (value.startsWith("blob:")) URL.revokeObjectURL(value);
}

function createInitialReleaseDraft(
  initialRelease: Release | null | undefined,
  minimumScheduledDate: string,
  prefillSuggestions: ReleasePrefillSuggestion[] = [],
): ReleaseDraft {
  if (!initialRelease) {
    const suggested = Object.fromEntries(prefillSuggestions.map((item) => [item.field, item.value]));
    return {
      releasePreviouslyReleased: false,
      upcCode: "",
      existingIsrcCode: "",
      releaseTitle: "",
      recordLabelName: suggested.recordLabelName ?? "",
      primaryGenre: suggested.primaryGenre ?? "",
      secondaryGenre: suggested.secondaryGenre ?? "",
      mood: "",
      language: suggested.language ?? "",
      territory: "Worldwide",
      selectedCountries: [],
      releaseTiming: "quick_release",
      scheduledReleaseDate: minimumScheduledDate,
      copyrightOwner: suggested.copyrightOwner ?? "",
      publishingRights: suggested.publishingRights ?? "",
    };
  }

  const territory =
    initialRelease.territory && initialRelease.territory !== "Worldwide"
      ? "Selected countries"
      : "Worldwide";
  const existingScheduledDate = initialRelease.releaseDate?.slice(0, 10) ?? "";
  return {
    releasePreviouslyReleased: Boolean(
      initialRelease.releasePreviouslyReleased,
    ),
    upcCode: initialRelease.upcCode ?? "",
    existingIsrcCode: initialRelease.tracks?.[0]?.isrc ?? "",
    releaseTitle: initialRelease.releaseTitle?.trim() || "",
    recordLabelName:
      initialRelease.labelName?.trim() ||
      initialRelease.labelDisplayName?.trim() ||
      "",
    primaryGenre:
      initialRelease.primaryGenre?.trim() || initialRelease.genre?.trim() || "",
    secondaryGenre:
      initialRelease.secondaryGenre?.trim() ||
      initialRelease.primaryGenre?.trim() ||
      initialRelease.genre?.trim() ||
      "",
    mood:
      typeof initialRelease.mood === "string" ? initialRelease.mood.trim() : "",
    language: initialRelease.language || "",
    territory: territory as ReleaseDraft["territory"],
    selectedCountries:
      territory === "Selected countries"
        ? (initialRelease.territory
            ?.split(",")
            .map((country) => country.trim())
            .filter(Boolean) ?? [])
        : [],
    releaseTiming:
      initialRelease.releaseTiming === "schedule_release"
        ? "schedule_release"
        : "quick_release",
    scheduledReleaseDate:
      initialRelease.releaseTiming === "schedule_release" &&
      existingScheduledDate >= minimumScheduledDate
        ? existingScheduledDate
        : minimumScheduledDate,
    copyrightOwner: initialRelease.copyrightOwner?.trim() || "",
    publishingRights: initialRelease.publishingRights?.trim() || "",
  };
}

function createInitialLegalState(
  initialRelease: Release | null | undefined,
): LegalState {
  if (!initialRelease) return defaultLegalState;
  return {
    ownershipConfirmation: Boolean(initialRelease.ownershipConfirmed),
    noInfringement: Boolean(initialRelease.noUnauthorizedSamples),
    collaboratorsCredited: Boolean(initialRelease.collaboratorsCredited),
    platformGuidelines: Boolean(initialRelease.platformCompliant),
    hymnNotLiable: Boolean(initialRelease.hymnNotLiable),
    termsAccepted: Boolean(initialRelease.agreedToTerms),
    falseMetadataAcknowledged: Boolean(
      initialRelease.falseMetadataAcknowledged,
    ),
    fraudWarningAccepted: true,
  };
}

function LogoImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={clsx("block object-contain", className)}
      referrerPolicy="no-referrer"
      loading="lazy"
    />
  );
}

function PlatformLogo({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  if (platform === "Spotify") {
    return (
      <LogoImage
        src="/assets/store-logos/spotify.png"
        alt="Spotify"
        className={className}
      />
    );
  }
  if (platform === "Apple Music") {
    return (
      <LogoImage
        src="/assets/store-logos/apple-music.png"
        alt="Apple Music"
        className={className}
      />
    );
  }
  if (platform === "Amazon Music") {
    return (
      <LogoImage
        src="/assets/store-logos/amazon-music.svg"
        alt="Amazon Music"
        className={className}
      />
    );
  }
  if (platform === "YouTube Music") {
    return (
      <LogoImage
        src="/assets/store-logos/youtube-music.svg"
        alt="YouTube Music"
        className={className}
      />
    );
  }
  if (platform === "JioSaavn") {
    return (
      <span className="jiosaavn-mark relative block h-10 w-10 overflow-hidden" title="JioSaavn">
        <LogoImage
          src="/assets/store-logos/jiosaavn.svg"
          alt="JioSaavn"
          className="absolute left-1 top-1 h-8 w-auto max-w-none object-left"
        />
      </span>
    );
  }
  if (platform === "Gaana") {
    return (
      <LogoImage
        src="/assets/store-logos/gaana.png"
        alt="Gaana"
        className={className}
      />
    );
  }
  if (platform === "Instagram / Facebook") {
    return (
      <LogoImage
        src="/assets/store-logos/meta.png"
        alt="Meta"
        className={className}
      />
    );
  }
  if (platform === "TikTok") {
    return (
      <LogoImage
        src="/assets/store-logos/tiktok-color.png"
        alt="TikTok"
        className={className}
      />
    );
  }
  if (platform === "150+ More Stores") {
    return (
      <span className="more-stores-mark relative block h-[54px] w-16" title="150+ stores">
        <LogoImage
          src="/assets/store-logos/distribution-network-v2.svg"
          alt="150+ stores"
          className="h-[54px] w-16"
        />
      </span>
    );
  }
  return null;
}

function createTracksFromRelease(
  initialRelease: Release | null | undefined,
): TrackDraft[] {
  const sourceTracks = initialRelease?.tracks?.length
    ? initialRelease.tracks
    : initialRelease
      ? [
          {
            id: 1,
            releaseId: initialRelease.id,
            trackTitle:
              initialRelease.trackName || initialRelease.releaseTitle || "",
            version: undefined,
            trackNumber: 1,
            primaryArtist: initialRelease.artistName,
            featuredArtists: undefined,
            additionalPrimaryArtists: undefined,
            songwriters: initialRelease.artistName,
            composers: initialRelease.artistName,
            producers: initialRelease.artistName,
            isrc: undefined,
            isCover: false,
            originalArtist: undefined,
            originalTrackLink: undefined,
            coverLicenseConfirmed: false,
            audioUrl: initialRelease.audioUrl,
            duration: "",
            bpm: null,
            musicalKey: undefined,
            explicitContent: false,
            dolbyAtmos: false,
            createdAt: initialRelease.createdAt,
          },
        ]
      : [];

  return (sourceTracks.length ? sourceTracks : [null]).map((track, index) => {
    const version = (track?.version?.trim() ||
      "Original") as (typeof versionOptions)[number];
    const legacyExplicitVersion = version.toLowerCase() === "explicit";
    const trackMetadata = track?.metadata && typeof track.metadata === "object"
      ? track.metadata as Record<string, unknown>
      : {};
    const savedPrimaryArtistIds = Array.isArray(trackMetadata.artistProfileIds)
      ? trackMetadata.artistProfileIds.filter((id): id is number => Number.isInteger(id) && Number(id) > 0)
      : [];
    return {
      id: createId(),
      trackNumber: track?.trackNumber ?? index + 1,
      trackTitle:
        track?.trackTitle && !isPlaceholderTrackTitle(track.trackTitle)
          ? track.trackTitle.trim()
          : "",
      existingIsrcCode: track?.isrc?.trim() || "",
      versionPreset: legacyExplicitVersion
        ? "Original"
        : versionOptions.includes(version)
          ? version
          : "Other",
      customVersion:
        legacyExplicitVersion || versionOptions.includes(version) ? "" : version,
      primaryArtistIds: savedPrimaryArtistIds,
      primaryArtistQuery: "",
      featuredArtists: track?.featuredArtists?.trim() || "",
      remixers: track?.additionalPrimaryArtists?.trim() || "",
      songwriters: splitContributorNames(track?.songwriters),
      composers: splitContributorNames(track?.composers),
      producers: splitContributorNames(track?.producers),
      isCover: Boolean(track?.isCover),
      originalArtist: track?.originalArtist?.trim() || "",
      originalTrackLink: track?.originalTrackLink?.trim() || "",
      coverLicenseFile: null,
      coverLicenseFileName: track?.coverLicenseConfirmed
        ? "Existing license proof"
        : "",
      existingCoverLicenseConfirmed: Boolean(track?.coverLicenseConfirmed),
      audioFile: null,
      audioFileName: fileNameFromUrl(
        track?.audioUrl || initialRelease?.audioUrl || "",
      ),
      existingAudioUrl: track?.audioUrl || initialRelease?.audioUrl || "",
      audioUploadStatus:
        track?.audioUrl || initialRelease?.audioUrl ? "uploaded" : "idle",
      requiresAudioReplacement: correctionMentions(initialRelease, new RegExp(`audio|tracks\\.${index}\\.audio_url`, "i")),
      audioPreviewUrl: track?.audioUrl || initialRelease?.audioUrl || "",
      duration: track?.duration?.trim() || "",
      titleLanguage:
        typeof track?.metadata === "object" &&
        track?.metadata &&
        "titleLanguage" in track.metadata
          ? String(
              (track.metadata as Record<string, unknown>).titleLanguage ||
                "English",
            )
          : "English",
      explicitContent: Boolean(track?.explicitContent) || legacyExplicitVersion,
      dolbyAtmos: Boolean(track?.dolbyAtmos),
    };
  });
}
function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function contributorsValid(entries: ContributorDraft[]) {
  return (
    entries.length > 0 &&
    entries.every((entry) => entry.legalName.trim().split(/\s+/).length >= 2)
  );
}

function contributorNames(entries: ContributorDraft[]) {
  return entries
    .map((entry) => entry.legalName.trim())
    .filter(Boolean)
    .join(", ");
}

function contributorCredits(
  role: ContributorCredit["role"],
  entries: ContributorDraft[],
): ContributorCredit[] {
  return entries
    .map((entry) => ({
      role,
      legalName: entry.legalName.trim(),
      artistName: entry.artistName.trim() || undefined,
      ipi: entry.ipi?.trim() || undefined,
      iprsMember: Boolean(entry.iprsMember),
      instagramUrl: entry.instagramUrl?.trim() || undefined,
      xUrl: entry.xUrl?.trim() || undefined,
    }))
    .filter((entry) => entry.legalName);
}

function releaseTypeFromCount(trackCount: number) {
  if (trackCount <= 1) return "single" as const;
  if (trackCount <= 4) return "ep" as const;
  return "album" as const;
}

async function getAudioDuration(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const duration = await new Promise<number>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error("Could not read audio duration."));
      audio.src = objectUrl;
    });
    return Number.isFinite(duration) ? formatDuration(duration) : "";
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function readAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

async function validateArtwork(file: File) {
  if (file.type !== "image/jpeg" || !/\.(jpe?g)$/i.test(file.name))
    throw new Error("Distribution requirement: Cover artwork must be in JPG / JPEG format only (no PNG or other file types).");
  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.width, height: image.height });
        image.onerror = () =>
          reject(new Error("Could not read artwork dimensions."));
        image.src = objectUrl;
      },
    );
    if (dimensions.width !== dimensions.height)
      throw new Error("Distribution requirement: Cover artwork must be a perfect square (1:1).");
    if (dimensions.width < 3000 || dimensions.height < 3000)
      throw new Error("Distribution requirement: Cover artwork must be at least 3000 x 3000 pixels.");
    return dimensions;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileFormat(file?: File | null, fallbackName?: string) {
  const source = file?.type || fallbackName?.split(".").pop() || "";
  return source
    .replace(/^audio\//, "")
    .replace(/^image\//, "")
    .toUpperCase();
}

async function detectArtworkWarning(file: File) {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const result = await worker.recognize(file);
    await worker.terminate();
    const text = result.data.text.replace(/\s+/g, " ").trim();
    if (text.length >= 18 && (result.data.confidence ?? 0) >= 30)
      return "Cover art may be rejected due to excessive text.";
  } catch {
    return null;
  }
  return null;
}

function socialPlatformSelected(platforms: string[]) {
  return socialPlatforms.some((platform) => platforms.includes(platform.name));
}

const languageOptions = [...DIRENOTE_LANGUAGES];

function SearchableSelect({
  label,
  value,
  options,
  placeholder,
  invalid,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter(
      (option, index, list) =>
        list.indexOf(option) === index &&
        (!normalized || option.toLowerCase().includes(normalized)),
    );
  }, [options, query]);

  function closePicker() {
    setOpen(false);
    setQuery("");
  }

  const picker = open ? (
    <div className="genre-picker-backdrop fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
      <section role="dialog" aria-modal="true" aria-label={`Choose ${label.toLowerCase()}`} className="genre-picker-modal flex max-h-[82vh] w-full flex-col overflow-hidden rounded-t-[1.5rem] border shadow-2xl sm:max-w-lg sm:rounded-[1.5rem]" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-semibold" style={{ color: "var(--text)" }}>Choose {label.toLowerCase()}</h3>
          <button type="button" onClick={closePicker} aria-label={`Close ${label.toLowerCase()} picker`} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-soft)] hover:text-[var(--text)]"><X className="h-4 w-4" /></button>
        </header>
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-soft)" }} /><input className="field pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}s`} autoFocus /></div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-2">
          {filtered.map((option) => (
            <button key={option} type="button" className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--bg-soft)]" style={{ color: "var(--text)" }} onClick={() => { onChange(option); closePicker(); }}>
              <span>{option}</span>{option === value ? <Check className="h-4 w-4 text-[var(--accent)]" /> : null}
            </button>
          ))}
          {filtered.length === 0 ? <p className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-soft)" }}>No {label.toLowerCase()} found.</p> : null}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div>
      <label
        className="mb-2 block text-sm font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </label>
      <button
        type="button"
        className={clsx(
          "field flex min-h-[52px] items-center justify-between gap-3 text-left",
          invalid ? "field-invalid" : "",
        )}
        onClick={() => setOpen(true)}
      >
        <span style={{ color: value ? "var(--text)" : "var(--text-soft)" }}>
          {value || placeholder}
        </span>
        <ChevronDown
          className="h-4 w-4"
          style={{ color: "var(--text-soft)" }}
        />
      </button>
      {picker && typeof document !== "undefined" ? createPortal(picker, document.body) : null}
    </div>
  );
}

function StepIntro({
  title,
  meta,
}: {
  title: ReactNode;
  meta?: string;
}) {
  return (
    <header className="release-step-intro flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h2
          className="text-2xl font-semibold md:text-3xl"
          style={{ color: "var(--text)" }}
        >
          {title}
        </h2>
      </div>
      {meta ? (
        <span
          className="release-step-meta w-fit border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em]"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-soft)",
            color: "var(--text-muted)",
          }}
        >
          {meta}
        </span>
      ) : null}
    </header>
  );
}

export function ReleaseForm({
  selectedPlan,
  hasActiveSubscription = false,
  initialRelease,
  firstReleaseOffer = false,
  campaignAttribution = {},
  prefillSuggestions = [],
}: {
  selectedPlan: DistributionPlanOption;
  hasActiveSubscription?: boolean;
  initialRelease?: Release | null;
  firstReleaseOffer?: boolean;
  campaignAttribution?: Record<string, string>;
  prefillSuggestions?: ReleasePrefillSuggestion[];
}) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const quickReleaseDate = useMemo(
    () => toDateInputValue(addDays(today, 3)),
    [today],
  );
  const minimumScheduledDate = useMemo(
    () => toDateInputValue(addDays(today, 20)),
    [today],
  );
  const [step, setStep] = useState(initialRelease ? 7 : 1);
  const trackCampaignEvent = (event: string, metadata?: Record<string, unknown>) => {
    if (!firstReleaseOffer) return;
    void fetch("/api/promotions/first-release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, attribution: campaignAttribution, metadata }) }).catch(() => undefined);
  };
  const [stepMotion, setStepMotion] = useState("step-adjacent-forward");
  const [stepTransitioning, setStepTransitioning] = useState(false);
  const stepTransitionRef = useRef(false);
  const stepTransitionTimerRef = useRef<number | null>(null);
  const [mobileStepMenuOpen, setMobileStepMenuOpen] = useState(false);
  const [expandedTrack, setExpandedTrack] = useState(0);
  const [artistRemovalCandidateId, setArtistRemovalCandidateId] = useState<number | null>(null);
  const [trackArtistRemovalCandidate, setTrackArtistRemovalCandidate] = useState<string | null>(null);
  const audioPreviewObjectUrlsRef = useRef<Set<string>>(new Set());
  const [draggedTrackIndex, setDraggedTrackIndex] = useState<number | null>(null);
  const [versionPickerTrack, setVersionPickerTrack] = useState<number | null>(null);
  const [legalDetailsOpen, setLegalDetailsOpen] = useState(
    () => !Object.values(createInitialLegalState(initialRelease)).every(Boolean),
  );
  const [queue, setQueue] = useState<DistributionQueueSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<"waiting" | "saving" | "saved" | "error">(
    initialRelease ? "saved" : "waiting",
  );
  const [attemptedStep, setAttemptedStep] = useState<number | null>(null);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(() => new Set());
  const [validationErrorKeys, setValidationErrorKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [knownProfiles, setKnownProfiles] = useState<
    Record<number, ArtistProfile>
  >({});
  useEffect(() => {
    fetch("/api/artists")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setKnownProfiles(Object.fromEntries(((data.artists ?? []) as ArtistProfile[]).map((profile) => [profile.id, profile]))))
      .catch(() => undefined);
  }, []);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(
    initialRelease?.artworkUrl ?? null,
  );
  const [persistedArtworkUrl, setPersistedArtworkUrl] = useState<string | null>(
    initialRelease?.artworkUrl ?? null,
  );
  const [artworkDimensions, setArtworkDimensions] = useState<string | null>(
    null,
  );
  const [artworkError, setArtworkError] = useState<string | null>(() =>
    correctionMentions(initialRelease, /artwork|cover_art_url/i)
      ? "Replace the artwork with a DireNote-compliant JPG/JPEG file (square and at least 3000 x 3000 pixels)."
      : null,
  );
  const [artworkWarning, setArtworkWarning] = useState<string | null>(null);
  const [artworkScanning, setArtworkScanning] = useState(false);
  const [contributorsModal, setContributorsModal] =
    useState<ContributorModalState>({
      open: false,
      trackIndex: null,
      songwriters: [createContributor()],
      composers: [createContributor()],
      producers: [createContributor()],
    });
  const [monetisationModalOpen, setMonetisationModalOpen] = useState(false);
  const [youtubeContentIdModalOpen, setYoutubeContentIdModalOpen] =
    useState(false);
  const [draftReleaseId, setDraftReleaseId] = useState<number | null>(() =>
    initialRelease?.id ?? null,
  );
  const [socialConsentAccepted, setSocialConsentAccepted] = useState(
    () =>
      initialRelease?.monetisationAccepted ??
      (initialRelease?.platforms?.length
        ? socialPlatformSelected(initialRelease.platforms)
        : false),
  );
  const [monetisationClauses, setMonetisationClauses] =
    useState<MonetisationClauseState>(() => {
      const base = createMonetisationClauseState();
      if (!initialRelease?.monetisationClauses) return base;
      return {
        ...base,
        ...Object.fromEntries(
          Object.entries(initialRelease.monetisationClauses).filter(
            ([key]) => key in base,
          ),
        ),
      } as MonetisationClauseState;
    });
  const [youtubeContentIdEnabled, setYoutubeContentIdEnabled] = useState(() =>
    Boolean(initialRelease?.youtubeContentIdEnabled),
  );
  const [youtubeContentIdChannelUrl, setYoutubeContentIdChannelUrl] = useState(
    () => initialRelease?.youtubeContentIdChannelUrl ?? "",
  );
  const [release, setRelease] = useState<ReleaseDraft>(() =>
    createInitialReleaseDraft(initialRelease, minimumScheduledDate, prefillSuggestions),
  );
  const [pendingPrefills, setPendingPrefills] = useState(() => new Set(prefillSuggestions.map((item) => item.field)));
  const [preferencesStatus, setPreferencesStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [legal, setLegal] = useState<LegalState>(() =>
    createInitialLegalState(initialRelease),
  );
  const [savedCopyrightOwners, setSavedCopyrightOwners] = useState<string[]>(
    [],
  );
  const defaultStorePlatforms = useMemo(
    () =>
      storePlatforms.map((platform) => platform.name),
    [],
  );
  const [platforms, setPlatforms] = useState<string[]>(
    initialRelease?.platforms?.length
      ? initialRelease.platforms
      : defaultStorePlatforms,
  );
  const [tracks, setTracks] = useState<TrackDraft[]>(() =>
    createTracksFromRelease(initialRelease),
  );
  const [submittedRelease, setSubmittedRelease] = useState<Release | null>(
    null,
  );
  const [shakingField, setShakingField] = useState<string | null>(null);
  const isEditing = Boolean(initialRelease);
  useEffect(() => () => {
    if (stepTransitionTimerRef.current != null) window.clearTimeout(stepTransitionTimerRef.current);
  }, []);
  const scheduledDateWasMoved = Boolean(
    initialRelease?.releaseTiming === "schedule_release" &&
      initialRelease.releaseDate &&
      initialRelease.releaseDate.slice(0, 10) < minimumScheduledDate,
  );
  const draftCreationRef = useRef(false);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const releaseType = useMemo(
    () => releaseTypeFromCount(tracks.length),
    [tracks.length],
  );
  const requiresReleaseTitle = releaseType !== "single";
  const displayedReleaseTitle = useMemo(
    () =>
      releaseType === "single"
        ? tracks[0]?.trackTitle.trim() || "Untitled single"
        : release.releaseTitle.trim() ||
          (releaseType === "ep" ? "Untitled EP" : "Untitled Album"),
    [release.releaseTitle, releaseType, tracks],
  );
  const selectedReleaseDate =
    release.releaseTiming === "schedule_release"
      ? release.scheduledReleaseDate
      : quickReleaseDate;
  const releaseDateValid =
    release.releaseTiming === "quick_release" ||
    (Boolean(release.scheduledReleaseDate) &&
      release.scheduledReleaseDate >= minimumScheduledDate);
  const currentPlan = findDistributionPlan(selectedPlan);
  const subscriptionCovered = hasActiveSubscription && selectedPlan !== "one_time";
  const customLabelAllowed = selectedPlan === "yearly_plus";
  const trackPricingQuote = useMemo(
    () => getTrackPricingQuote(tracks.length),
    [tracks.length],
  );

  useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(COPYRIGHT_OWNER_PREFERENCES_KEY) || "[]",
      );
      if (Array.isArray(stored))
        setSavedCopyrightOwners(
          stored
            .filter(
              (item): item is string =>
                typeof item === "string" && Boolean(item.trim()),
            )
            .slice(0, 8),
        );
    } catch {
      setSavedCopyrightOwners([]);
    }
  }, []);

  function saveCopyrightOwnerPreference() {
    const owner = release.copyrightOwner.trim();
    if (!owner) return;
    const next = [
      owner,
      ...savedCopyrightOwners.filter(
        (item) => item.toLowerCase() !== owner.toLowerCase(),
      ),
    ].slice(0, 8);
    setSavedCopyrightOwners(next);
    window.localStorage.setItem(
      COPYRIGHT_OWNER_PREFERENCES_KEY,
      JSON.stringify(next),
    );
  }

  function removeCopyrightOwnerPreference(owner: string) {
    const next = savedCopyrightOwners.filter((item) => item !== owner);
    setSavedCopyrightOwners(next);
    window.localStorage.setItem(
      COPYRIGHT_OWNER_PREFERENCES_KEY,
      JSON.stringify(next),
    );
  }
  const ugcAddOnAmount = useMemo(
    () =>
      getUgcAddonPrice(platforms, selectedPlan, { youtubeContentIdEnabled }),
    [platforms, selectedPlan, youtubeContentIdEnabled],
  );
  const distributionBaseAmount =
    selectedPlan === "one_time"
      ? trackPricingQuote.basePrice
      : currentPlan.price;
  const distributionAmount =
    (selectedPlan === "one_time"
      ? trackPricingQuote.finalPrice
      : currentPlan.price) + ugcAddOnAmount;
  const firstReleaseDiscount = firstReleaseOffer && selectedPlan === "one_time" && releaseType === "single" && tracks.length === 1 ? Math.min(99, distributionAmount - ugcAddOnAmount) : 0;
  const finalDistributionAmount = Math.max(0, distributionAmount - firstReleaseDiscount);
  const legalComplete = useMemo(
    () => Object.values(legal).every(Boolean),
    [legal],
  );
  function setLegalDeclarationAccepted(accepted: boolean) {
    setLegal({
      ownershipConfirmation: accepted,
      noInfringement: accepted,
      collaboratorsCredited: accepted,
      platformGuidelines: accepted,
      hymnNotLiable: accepted,
      termsAccepted: accepted,
      falseMetadataAcknowledged: accepted,
      fraudWarningAccepted: accepted,
    });
  }
  const storeSelections = useMemo(
    () =>
      storePlatforms
        .filter((platform) => platforms.includes(platform.name))
        .map((platform) => platform.name),
    [platforms],
  );
  const territoryValue =
    release.selectedCountries.length > 0
      ? `Worldwide excluding ${release.selectedCountries.join(", ")}`
      : "Worldwide";
  const audioComplete =
    tracks.length > 0 &&
    tracks.every(
      (track) =>
        track.audioUploadStatus === "uploaded" &&
        Boolean(track.existingAudioUrl),
    );
  const metadataComplete = Boolean(
    displayedReleaseTitle.trim() &&
      release.recordLabelName.trim() &&
      release.primaryGenre &&
      release.secondaryGenre &&
      release.mood.trim() &&
      release.language.trim() &&
      platforms.length > 0 &&
      release.copyrightOwner.trim(),
  );
  const creditsComplete = tracks.every(
    (track) =>
      contributorsValid(track.songwriters) &&
      contributorsValid(track.composers) &&
      contributorsValid(track.producers),
  );
  const readinessItems = [
    {
      label: "Artwork Uploaded",
      shortLabel: "Artwork",
      complete: Boolean(artworkFile || artworkPreview),
    },
    { label: "Audio Uploaded", shortLabel: "Audio", complete: audioComplete },
    {
      label: "Metadata Complete",
      shortLabel: "Metadata",
      complete: metadataComplete,
    },
    {
      label: "Credits Complete",
      shortLabel: "Credits",
      complete: creditsComplete,
    },
    {
      label: "Legal Complete",
      shortLabel: "Legal Confirmation",
      complete: legalComplete,
    },
    {
      label: "Distribution Ready",
      shortLabel: "Distribution",
      complete:
        metadataComplete &&
        audioComplete &&
        creditsComplete &&
        legalComplete &&
        Boolean(artworkFile || artworkPreview),
    },
  ];
  const readinessScore = Math.round(
    (readinessItems.filter((item) => item.complete).length /
      readinessItems.length) *
      100,
  );
  const autosaveEligible = readinessScore >= 70;
  const autosaveLabel = !autosaveEligible
    ? "Manual save only"
    : autosaveStatus === "saving"
      ? "Saving…"
      : autosaveStatus === "error"
        ? "Save failed"
        : autosaveStatus === "saved"
          ? "Saved"
          : "Changes pending";
  const autosaveSnapshot = useMemo(
    () => ({
      title: displayedReleaseTitle,
      artistName: (tracks[0]?.primaryArtistIds ?? [])
        .map((id) => knownProfiles[id]?.name)
        .filter(Boolean)
        .join(", "),
      genre: release.primaryGenre,
      releaseDate: selectedReleaseDate,
      artworkUrl:
        artworkPreview && !artworkPreview.startsWith("data:")
          ? artworkPreview
          : undefined,
      audioUrl: tracks[0]?.existingAudioUrl || undefined,
      metadata: {
        ...release,
        releaseType,
        platforms,
        youtubeContentIdEnabled,
        youtubeContentIdChannelUrl,
        legal,
        draftCompletionPercent: readinessScore,
        missingFields: readinessItems
          .filter((item) => !item.complete)
          .map((item) => item.label),
        tracks: tracks.map((track, index) => ({
          trackTitle: track.trackTitle,
          trackNumber: index + 1,
          primaryArtist: track.primaryArtistIds
            .map((id) => knownProfiles[id]?.name)
            .filter(Boolean)
            .join(", "),
          artistProfileIds: track.primaryArtistIds,
          featuredArtists: track.featuredArtists,
          songwriters: contributorNames(track.songwriters),
          composers: contributorNames(track.composers),
          producers: contributorNames(track.producers),
          audioUrl: track.existingAudioUrl,
          audioFileName: track.audioFileName,
          duration: track.duration,
          bpm: null,
          musicalKey: "",
          explicitContent: track.explicitContent,
          contributors: [
            ...contributorCredits("songwriter", track.songwriters),
            ...contributorCredits("composer", track.composers),
            ...contributorCredits("producer", track.producers),
          ],
        })),
      },
    }),
    [
      artworkPreview,
      displayedReleaseTitle,
      knownProfiles,
      legal,
      platforms,
      readinessScore,
      release,
      releaseType,
      selectedReleaseDate,
      tracks,
      youtubeContentIdChannelUrl,
      youtubeContentIdEnabled,
    ],
  );
  useEffect(() => {
    fetch("/api/distribution/queue")
      .then((response) => response.json())
      .then((data) => setQueue(data.summary))
      .catch(() => setQueue(null));
  }, []);

  useEffect(() => {
    if (!autosaveEligible || initialRelease || draftReleaseId || draftCreationRef.current) return;
    draftCreationRef.current = true;
    fetch("/api/distribution/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: displayedReleaseTitle }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not start draft.");
        return data;
      })
      .then((data) => {
        const id = Number(data.draft?.id);
        if (id > 0) {
          setDraftReleaseId(id);
          const campaignQuery = firstReleaseOffer
            ? `&campaign=first-release${Object.entries(campaignAttribution).map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("")}`
            : "";
          router.replace(`/distribution/start?edit=${id}${campaignQuery}`);
        }
      })
      .catch(() => {
        draftCreationRef.current = false;
      });
  }, [autosaveEligible, campaignAttribution, displayedReleaseTitle, draftReleaseId, firstReleaseOffer, initialRelease, router]);

  useEffect(() => {
    if (!autosaveEligible || !draftReleaseId || submitting || submittedRelease) return;
    setAutosaveStatus("waiting");
    const timer = window.setTimeout(() => {
      setAutosaveStatus("saving");
      fetch(`/api/distribution/drafts/${draftReleaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(autosaveSnapshot),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Autosave failed");
          setAutosaveStatus("saved");
        })
        .catch(() => setAutosaveStatus("error"));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [autosaveEligible, autosaveSnapshot, draftReleaseId, submittedRelease, submitting]);

  useEffect(() => {
    if (customLabelAllowed) return;
    setRelease((current) =>
      current.recordLabelName.trim()
        ? current
        : { ...current, recordLabelName: "HYMN Music" },
    );
  }, [customLabelAllowed]);

  useEffect(() => {
    const src = "https://checkout.razorpay.com/v1/checkout.js";
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => () => {
    audioPreviewObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioPreviewObjectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    setMobileStepMenuOpen(false);
  }, [step]);

  const registerField = (key: string) => (node: HTMLElement | null) => {
    fieldRefs.current[key] = node;
  };
  const fieldClass = (key: string, invalid: boolean) =>
    clsx(
      "field",
      invalid || validationErrorKeys.has(key) ? "field-invalid" : "",
      shakingField === key ? "field-shake" : "",
    );

  function triggerFieldFocus(issue: ValidationIssue) {
    if (issue.trackIndex != null) setExpandedTrack(issue.trackIndex);
    goToStep(issue.step);
    setShakingField(issue.key);
    window.setTimeout(() => {
      const target = fieldRefs.current[issue.key];
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement
      )
        target.focus();
    }, 80);
    window.setTimeout(
      () =>
        setShakingField((current) => (current === issue.key ? null : current)),
      420,
    );
  }

  const upsertKnownProfile = (profile: ArtistProfile) =>
    setKnownProfiles((current) => ({ ...current, [profile.id]: profile }));
  const profilesFor = (ids: number[]) =>
    ids.map((id) => knownProfiles[id]).filter(Boolean);
  const namesFor = (ids: number[]) =>
    profilesFor(ids)
      .map((profile) => profile.name)
      .join(", ");
  const primaryArtistName =
    namesFor(tracks[0]?.primaryArtistIds ?? []);
  const updateTrack = (index: number, patch: Partial<TrackDraft>) =>
    setTracks((current) =>
      current.map((track, trackIndex) =>
        trackIndex === index ? { ...track, ...patch } : track,
      ),
    );
  const updatePrimaryArtistsForAllTracks = (primaryArtistIds: number[]) =>
    setTracks((current) => current.map((track) => ({
      ...track,
      primaryArtistIds,
      primaryArtistQuery: "",
    })));
  const setTrackList = (updater: (current: TrackDraft[]) => TrackDraft[]) =>
    setTracks((current) =>
      updater(current).map((track, index) => ({
        ...track,
        trackNumber: index + 1,
      })),
    );
  const addTrack = () => {
    if (firstReleaseOffer) return;
    setTrackList((current) => [...current, { ...createTrack(current.length + 1), primaryArtistIds: current[0]?.primaryArtistIds ?? [] }]);
    setExpandedTrack(tracks.length);
  };

  function movePrimaryArtist(from: number, direction: -1 | 1) {
    const target = from + direction;
    const ids = tracks[0]?.primaryArtistIds ?? [];
    if (target < 0 || target >= ids.length) return;
    const reordered = [...ids];
    [reordered[from], reordered[target]] = [reordered[target], reordered[from]];
    updatePrimaryArtistsForAllTracks(reordered);
  }

  function resolvePrefill(field: ReleasePrefillSuggestion["field"], keep: boolean) {
    if (!keep) setRelease((current) => ({ ...current, [field]: "" }));
    setPendingPrefills((current) => { const next = new Set(current); next.delete(field); return next; });
  }

  function approveSafePrefills() {
    const sensitive = new Set<ReleasePrefillSuggestion["field"]>(["copyrightOwner", "publishingRights"]);
    setPendingPrefills((current) => new Set([...current].filter((field) => sensitive.has(field))));
  }

  async function saveCurrentReleaseDefaults() {
    setPreferencesStatus("saving");
    try {
      const response = await fetch("/api/distribution/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultArtistProfileId: tracks[0]?.primaryArtistIds[0], preferredTitleLanguage: release.language, preferredGenre: release.primaryGenre, preferredSubgenre: release.secondaryGenre, rightsDefaults: { compositionOwner: release.copyrightOwner, masterRecordingOwner: release.publishingRights, defaultLabelName: release.recordLabelName, defaultCLineName: release.copyrightOwner, defaultPLineName: release.publishingRights } }) });
      if (!response.ok) throw new Error("Could not save defaults.");
      setPreferencesStatus("saved");
    } catch { setPreferencesStatus("error"); }
  }

  async function clearReleaseDefaults() {
    if (!window.confirm("Clear your saved distribution and rights defaults? Existing drafts will not change.")) return;
    setPreferencesStatus("saving");
    try {
      const response = await fetch("/api/distribution/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) });
      if (!response.ok) throw new Error("Could not clear defaults.");
      setPreferencesStatus("idle");
    } catch { setPreferencesStatus("error"); }
  }

  function removeTrack(index: number) {
    setTrackList((current) => {
      const target = current[index];
      if (target?.audioPreviewUrl) {
        safeRevokePreviewUrl(target.audioPreviewUrl);
        audioPreviewObjectUrlsRef.current.delete(target.audioPreviewUrl);
      }
      return current.filter((_, trackIndex) => trackIndex !== index);
    });
    setExpandedTrack((value) =>
      Math.max(0, Math.min(value, tracks.length - 2)),
    );
  }

  function clearTrackAudio(index: number) {
    const target = tracks[index];
    if (target?.audioPreviewUrl) {
      safeRevokePreviewUrl(target.audioPreviewUrl);
      audioPreviewObjectUrlsRef.current.delete(target.audioPreviewUrl);
    }
    updateTrack(index, {
      audioFile: null,
      audioFileName: "",
      existingAudioUrl: "",
      audioPreviewUrl: "",
      audioUploadStatus: "idle",
      duration: "",
      requiresAudioReplacement: false,
    });
  }

  function moveTrack(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= tracks.length) return;
    setTrackList((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setExpandedTrack(target);
  }

  function reorderTrack(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= tracks.length || to >= tracks.length) return;
    setTrackList((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((track, index) => ({ ...track, trackNumber: index + 1 }));
    });
    setExpandedTrack((current) => {
      if (current === from) return to;
      if (from < to && current > from && current <= to) return current - 1;
      if (to < from && current >= to && current < from) return current + 1;
      return current;
    });
  }

  function togglePlatform(platform: string, type: "store" | "social") {
    const active = platforms.includes(platform);
    if (type === "social" && !socialConsentAccepted) {
      return;
    }
    setPlatforms((current) => {
      const next = active
        ? current.filter((item) => item !== platform)
        : [...current, platform];
      if (platform === "YouTube Music" && !next.includes(platform)) {
        setYoutubeContentIdEnabled(false);
        setYoutubeContentIdChannelUrl("");
        setYoutubeContentIdModalOpen(false);
      }
      return next;
    });
  }

  function openYoutubeContentIdModal() {
    if (!socialConsentAccepted) return;
    if (!platforms.includes("YouTube Music")) {
      setPlatforms((current) => [...current, "YouTube Music"]);
    }
    setYoutubeContentIdModalOpen(true);
  }

  async function handleAudioFile(
    index: number,
    file: File,
    controls: {
      signal: AbortSignal;
      reportProgress: (loaded: number, total: number) => void;
    },
  ) {
    const supportedMime = ["audio/wav", "audio/x-wav", "audio/mpeg"].includes(file.type);
    if (!supportedMime || !/\.(wav|mp3)$/i.test(file.name)) {
      throw new Error("DireNote requires WAV or MP3 audio. FLAC and other formats are not accepted.");
    }
    const currentTrack = tracks[index];
    if (currentTrack?.audioPreviewUrl) {
      safeRevokePreviewUrl(currentTrack.audioPreviewUrl);
      audioPreviewObjectUrlsRef.current.delete(currentTrack.audioPreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    audioPreviewObjectUrlsRef.current.add(previewUrl);
    const duration = await getAudioDuration(file).catch(() => {
      throw new Error("Could not read the uploaded audio.");
    });
    updateTrack(index, {
      audioFile: file,
      audioFileName: file.name,
      existingAudioUrl: "",
      audioPreviewUrl: previewUrl,
      duration,
      audioUploadStatus: "uploading",
      requiresAudioReplacement: false,
    });
    try {
      const downloadPath = await uploadPrivateAudio(file, {
        signal: controls.signal,
        onProgress: controls.reportProgress,
      });
      updateTrack(index, {
        audioFile: null,
        audioFileName: file.name,
        existingAudioUrl: downloadPath,
        audioPreviewUrl: previewUrl,
        duration,
        audioUploadStatus: "uploaded",
      });
      trackCampaignEvent("audio_uploaded", { trackIndex: index });
    } catch (error) {
      updateTrack(index, { audioUploadStatus: "failed", requiresAudioReplacement: true });
      throw error;
    }
  }

  function handleCoverLicense(index: number, file: File | null) {
    if (!file)
      return updateTrack(index, {
        coverLicenseFile: null,
        coverLicenseFileName: "",
      });
    if (file.type !== "application/pdf") {
      setStatus("Cover license must be uploaded as a PDF.");
      return updateTrack(index, {
        coverLicenseFile: null,
        coverLicenseFileName: "",
      });
    }
    updateTrack(index, {
      coverLicenseFile: file,
      coverLicenseFileName: file.name,
      existingCoverLicenseConfirmed: true,
    });
  }

  async function handleArtwork(file: File) {
    let dimensions: { width: number; height: number };
    try {
      dimensions = await validateArtwork(file);
    } catch (error) {
      setArtworkFile(null);
      setArtworkDimensions(null);
      setArtworkError(
        error instanceof Error ? error.message : "Artwork validation failed.",
      );
      throw error;
    }
    if (artworkPreview) safeRevokePreviewUrl(artworkPreview);
    setPersistedArtworkUrl(null);
    setArtworkFile(file);
    setArtworkPreview(await readAsDataUrl(file));
    setArtworkDimensions(`${dimensions.width} x ${dimensions.height}`);
    setArtworkError(null);
    trackCampaignEvent("artwork_uploaded");
    const qualityWarnings = [
      dimensions.width !== dimensions.height
        ? "This artwork is not square and may be rejected or cropped by music stores."
        : null,
      dimensions.width < 3000 || dimensions.height < 3000
        ? "This artwork is below 3000 x 3000 pixels and may look blurry or be rejected by music stores."
        : null,
    ].filter(Boolean) as string[];
    setArtworkWarning(qualityWarnings.join(" ") || null);
    setArtworkScanning(true);
    void detectArtworkWarning(file).then((warning) => {
      setArtworkWarning(
        [qualityWarnings.join(" "), warning].filter(Boolean).join(" ") || null,
      );
      setArtworkScanning(false);
    });

    try {
      const downloadPath = await uploadPrivateAsset(file, "private_unreleased_artwork", {
        releaseId: draftReleaseId ?? initialRelease?.id,
      });
      setPersistedArtworkUrl(downloadPath);
      setArtworkPreview(downloadPath);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `${error.message} The local preview is still available; please try selecting the artwork again before leaving.`
          : "Could not save cover artwork. Please try selecting it again before leaving.",
      );
    }
  }

  function openContributors(index: number) {
    const track = tracks[index];
    setContributorsModal({
      open: true,
      trackIndex: index,
      songwriters: track.songwriters,
      composers: track.composers,
      producers: track.producers,
    });
  }

  function closeContributors() {
    setContributorsModal((current) => ({
      ...current,
      open: false,
      trackIndex: null,
    }));
  }

  function trackIssue(
    track: TrackDraft,
    index: number,
  ): ValidationIssue | null {
    if (!track.trackTitle.trim() || isPlaceholderTrackTitle(track.trackTitle))
      return {
        step: 3,
        key: `track-${index}-title`,
        trackIndex: index,
        message: "Enter the actual title for every track before continuing.",
      };
    if (track.requiresAudioReplacement)
      return {
        step: 3,
        key: `track-${index}-audio`,
        trackIndex: index,
        message: "Replace this audio master with a DireNote-compliant WAV or MP3 file.",
      };
    if (track.versionPreset === "Other" && !track.customVersion.trim())
      return {
        step: 3,
        key: `track-${index}-version`,
        trackIndex: index,
        message: "Enter the custom version label for tracks using Other.",
      };
    if (track.primaryArtistIds.length > 3)
      return {
        step: 3,
        key: `track-${index}-artists`,
        trackIndex: index,
        message: "Each track needs 1 to 3 primary artist profiles.",
      };
    if (track.primaryArtistIds.length === 0)
      return {
        step: 3,
        key: `track-${index}-artists`,
        trackIndex: index,
        message: "Select at least one saved primary artist card for every track.",
      };
    if (
      !contributorsValid(track.songwriters) ||
      !contributorsValid(track.composers) ||
      !contributorsValid(track.producers)
    )
      return {
        step: 3,
        key: `track-${index}-contributors`,
        trackIndex: index,
        message:
          "Each track needs songwriter, composer, and producer legal names.",
      };
    if (!track.audioFile && !track.existingAudioUrl && !track.audioPreviewUrl)
      return {
        step: 3,
        key: `track-${index}-audio`,
        trackIndex: index,
        message: "Upload audio for every track before continuing.",
      };
    if (track.isCover && !track.originalArtist.trim())
      return {
        step: 3,
        key: `track-${index}-original-artist`,
        trackIndex: index,
        message: "Cover songs need the original artist name.",
      };
    if (track.isCover && !track.originalTrackLink.trim())
      return {
        step: 3,
        key: `track-${index}-original-link`,
        trackIndex: index,
        message: "Cover songs need a reference link to the original release.",
      };
    if (
      track.isCover &&
      !track.coverLicenseFile &&
      !track.existingCoverLicenseConfirmed
    )
      return {
        step: 3,
        key: `track-${index}-cover-license`,
        trackIndex: index,
        message: "Cover songs need a PDF license or rights proof upload.",
      };
    return null;
  }

  const releaseInfoIssues = (): ValidationIssue[] =>
    [
      pendingPrefills.size > 0
        ? { step: 2, key: "prefill-review", message: `Review ${pendingPrefills.size} suggested field${pendingPrefills.size === 1 ? "" : "s"} before continuing.` }
        : null,
      release.releasePreviouslyReleased && !release.upcCode.trim()
        ? {
            step: 2,
            key: "existing-upc",
            message:
              "Existing UPC is required for a previously released release.",
          }
        : null,
      release.releasePreviouslyReleased &&
      tracks.some((track) => !track.existingIsrcCode.trim())
        ? {
            step: 2,
            key: "existing-isrc",
            message:
              "Each track requires its existing ISRC for a previously released release.",
          }
        : null,
      requiresReleaseTitle && !release.releaseTitle.trim()
        ? {
            step: 2,
            key: "release-title",
            message:
              releaseType === "ep"
                ? "Add an EP name before continuing."
                : "Add an album name before continuing.",
          }
        : null,
      !release.recordLabelName.trim()
        ? {
            step: 2,
            key: "record-label",
            message: "Enter the record label or imprint name.",
          }
        : null,
      !release.primaryGenre || !release.secondaryGenre
        ? {
            step: 2,
            key: "genre-picker",
            message: "Choose both a genre and subgenre before continuing.",
          }
        : null,
      !release.mood.trim()
        ? {
            step: 2,
            key: "mood",
            message: "Please select a mood for this release.",
          }
        : null,
      !release.language.trim()
        ? {
            step: 2,
            key: "language",
            message: "Language is required before continuing.",
          }
        : null,
      !releaseDateValid
        ? {
            step: 2,
            key: "release-date",
            message: "Scheduled releases must be at least 20 days from today.",
          }
        : null,
    ].filter((issue): issue is ValidationIssue => Boolean(issue));
  const releaseInfoIssue = (): ValidationIssue | null =>
    releaseInfoIssues()[0] ?? null;

  const artworkIssue = (): ValidationIssue | null =>
    !artworkPreview || artworkError
      ? {
          step: 0,
          key: "artwork-upload",
          message: artworkError || "Upload cover artwork before continuing.",
        }
      : null;

  const destinationsIssues = (): ValidationIssue[] =>
    [
      platforms.length === 0
        ? {
            step: 6,
            key: "store-selection",
            message: "Choose at least one store or social destination.",
          }
        : null,
      !release.copyrightOwner.trim()
        ? {
            step: 5,
            key: "copyright-owner",
            message: "Copyright owner is required before continuing.",
          }
        : null,
      !release.publishingRights.trim()
        ? {
            step: 5,
            key: "publishing-rights",
            message: "P-Line is required before continuing.",
          }
        : null,
      socialPlatformSelected(platforms) && !socialConsentAccepted
        ? {
            step: 5,
            key: "social-confirmation",
            message: "Enable monetisation before selecting UGC platforms.",
          }
        : null,
      platforms.includes("YouTube Music") &&
      youtubeContentIdEnabled &&
      !youtubeContentIdChannelUrl.trim()
        ? {
            step: 5,
            key: "youtube-content-id-url",
            message: "Add your YouTube channel URL for Content ID.",
          }
        : null,
      !Object.values(legal).every(Boolean)
        ? {
            step: 5,
            key: "legal-checks",
            message:
              "Complete the final legal confirmations before continuing.",
          }
        : null,
    ].filter((issue): issue is ValidationIssue => Boolean(issue));
  const destinationsIssue = (): ValidationIssue | null =>
    destinationsIssues()[0] ?? null;

  const validationIssues = [
    ...tracks
      .map((track, index) => trackIssue(track, index))
      .filter((issue): issue is ValidationIssue => Boolean(issue)),
    ...releaseInfoIssues(),
    artworkIssue(),
    ...destinationsIssues(),
  ].filter((issue): issue is ValidationIssue => Boolean(issue));
  const primaryArtistComplete = Boolean(tracks[0]?.primaryArtistIds.length);
  const audioAssetsComplete = tracks.every((track) => Boolean(track.audioFile || track.existingAudioUrl || track.audioPreviewUrl));
  const stepChecks = [
    audioAssetsComplete && Boolean(artworkPreview) && !artworkError,
    primaryArtistComplete,
    !releaseInfoIssue(),
    tracks.every((track, index) => !trackIssue(track, index)),
    !artworkIssue() && audioAssetsComplete,
    !destinationsIssues().some((issue) => issue.step === 5),
    !destinationsIssues().some((issue) => issue.step === 6),
    validationIssues.length === 0,
  ];
  const validationIssueCount = validationIssues.length;
  const completion = Math.round(
    (visibleStepIndexes.filter((index) => stepChecks[index]).length /
      visibleStepIndexes.length) *
      100,
  );
  const artistCount = new Set(
    tracks.flatMap((track) => [
      ...track.primaryArtistIds.map((id) => `profile:${id}`),
    ]),
  ).size;
  const showErrors = attemptedStep === step || submitting;
  const stepValidity = steps.map((_, index) =>
    stepChecks[index]
      ? "complete"
      : validationIssues.some((issue) => issue.step === index)
        ? "invalid"
        : "neutral",
  );

  function firstIssueForStep(stepIndex: number): ValidationIssue | null {
    if (stepIndex === 0) return artworkIssue();
    if (stepIndex === 1 && !primaryArtistComplete) return { step: 1, key: "release-primary-artists", message: "Select at least one saved primary artist profile." };
    if (stepIndex === 2) return releaseInfoIssue();
    if (stepIndex === 3)
      return (
        tracks.map((track, index) => trackIssue(track, index)).find(Boolean) ??
        null
      );
    if (stepIndex === 4) return artworkIssue() ?? tracks.map((track, index) => trackIssue(track, index)).find((issue) => issue?.key.endsWith("-audio")) ?? null;
    if (stepIndex === 5 || stepIndex === 6) return destinationsIssues().find((issue) => issue.step === stepIndex) ?? null;
    return (
      [3, 2, 4, 5, 6].map((index) => firstIssueForStep(index)).find(Boolean) ??
      null
    );
  }

  function stepButtonStyles(index: number) {
    const rawValidity = stepValidity[index];
    const validity = rawValidity === "invalid" && !visitedSteps.has(index) ? "neutral" : rawValidity;
    const isCurrent = step === index;
    const style =
      validity === "complete"
        ? {
            borderColor: "rgba(34,197,94,0.45)",
            background: "rgba(34,197,94,0.14)",
            color: "rgb(22,163,74)",
          }
        : validity === "invalid"
          ? {
              borderColor: "rgba(248,113,113,0.45)",
              background: "rgba(248,113,113,0.12)",
              color: "rgb(239,68,68)",
            }
          : isCurrent
            ? { background: "var(--accent)", color: "var(--accent-foreground)" }
            : {
                borderColor: "var(--border)",
                background: "transparent",
                color: "var(--text-muted)",
              };
    const className = clsx(
      "release-step-button pressable hover-lift rounded-xl px-3 py-3 text-xs font-semibold uppercase tracking-[0.16em]",
      isCurrent && "is-current",
      validity === "complete" && "is-complete",
      validity === "invalid" && "is-invalid",
      isCurrent && validity !== "complete" && validity !== "invalid"
        ? ""
        : "border",
    );
    return { className, style, validity, isCurrent };
  }

  function jumpToStep(index: number) {
    const issue = visitedSteps.has(index) ? firstIssueForStep(index) : null;
    if (issue) {
      setAttemptedStep(index);
      setValidationErrorKeys((current) => new Set([...current, issue.key]));
      setStatus(issue.message);
      triggerFieldFocus(issue);
    } else {
      setAttemptedStep(null);
      setStatus(null);
      goToStep(index);
    }
    setMobileStepMenuOpen(false);
  }

  function goToStep(nextStep: number) {
    if (step === nextStep || stepTransitionRef.current) return;
    stepTransitionRef.current = true;
    setStepTransitioning(true);
    if (stepTransitionTimerRef.current != null) window.clearTimeout(stepTransitionTimerRef.current);
    stepTransitionTimerRef.current = window.setTimeout(() => {
      stepTransitionRef.current = false;
      setStepTransitioning(false);
      stepTransitionTimerRef.current = null;
    }, 750);
    setVisitedSteps((current) => new Set([...current, step]));
    const currentVisibleIndex = visibleStepIndexes.indexOf(
      step as (typeof visibleStepIndexes)[number],
    );
    const nextVisibleIndex = visibleStepIndexes.indexOf(
      nextStep as (typeof visibleStepIndexes)[number],
    );
    const distance = Math.abs(nextVisibleIndex - currentVisibleIndex);
    const kind = distance > 1 ? "jump" : "adjacent";
    const direction = nextVisibleIndex > currentVisibleIndex ? "forward" : "back";
    setStepMotion(`step-${kind}-${direction}`);
    setStep(nextStep);
    if (nextStep === 7) trackCampaignEvent("review_reached");
    else if (step === 3 && nextStep !== 3) trackCampaignEvent("metadata_completed");
  }

  function advanceStep() {
    const issue = firstIssueForStep(step);
    if (issue) {
      setAttemptedStep(step);
      setValidationErrorKeys((current) => new Set([...current, issue.key]));
      setStatus(issue.message);
      triggerFieldFocus(issue);
      return;
    }
    setAttemptedStep(null);
    setStatus(null);
    if (step === 1) {
      goToStep(0);
      return;
    }
    if (step === 0) {
      goToStep(3);
      return;
    }
    const currentIndex = visibleStepIndexes.indexOf(
      step as (typeof visibleStepIndexes)[number],
    );
    goToStep(visibleStepIndexes[Math.min(currentIndex + 1, visibleStepIndexes.length - 1)]);
  }

  function continueFromArtists() {
    if (stepTransitionRef.current) return;
    if (!primaryArtistComplete) {
      const issue = { step: 1, key: "release-primary-artists", message: "Select at least one saved primary artist profile." };
      setAttemptedStep(1);
      setValidationErrorKeys((current) => new Set([...current, issue.key]));
      setStatus(issue.message);
      triggerFieldFocus(issue);
      return;
    }
    stepTransitionRef.current = true;
    setStepTransitioning(true);
    setAttemptedStep(null);
    setStatus(null);
    setVisitedSteps((current) => new Set([...current, 1]));
    setStepMotion("step-adjacent-forward");
    setStep(0);
    if (stepTransitionTimerRef.current != null) window.clearTimeout(stepTransitionTimerRef.current);
    stepTransitionTimerRef.current = window.setTimeout(() => {
      stepTransitionRef.current = false;
      setStepTransitioning(false);
      stepTransitionTimerRef.current = null;
    }, 750);
  }

  function continueFromMusic() {
    if (stepTransitionTimerRef.current != null) window.clearTimeout(stepTransitionTimerRef.current);
    stepTransitionRef.current = false;
    setStepTransitioning(false);
    setAttemptedStep(null);
    setStatus(null);
    setVisitedSteps((current) => new Set([...current, 0]));
    setStepMotion("step-adjacent-forward");
    setStep(3);
  }

  async function uploadFilesDirectly() {
    const filesToUpload: {
      name: string;
      file: File;
      assetType: "private_unreleased_artwork" | "private_audio_master" | "private_cover_licence";
      setter: (url: string) => void;
    }[] = [];
    let artworkUrl: string | undefined;
    if (artworkFile && !persistedArtworkUrl)
      filesToUpload.push({
        name: `artwork-${Date.now()}-${artworkFile.name.replace(/[^a-zA-Z0-9.-]/g, "")}`,
        file: artworkFile,
        assetType: "private_unreleased_artwork",
        setter: (url) => (artworkUrl = url),
      });

    const trackAudioUrls: (string | undefined)[] = new Array(
      tracks.length,
    ).fill(undefined);
    const trackLicenseUrls: (string | undefined)[] = new Array(
      tracks.length,
    ).fill(undefined);

    tracks.forEach((track, i) => {
      if (track.audioFile)
        filesToUpload.push({
          name: `audio-${i}-${Date.now()}-${track.audioFile.name.replace(/[^a-zA-Z0-9.-]/g, "")}`,
          file: track.audioFile,
          assetType: "private_audio_master",
          setter: (url) => (trackAudioUrls[i] = url),
        });
      if (track.coverLicenseFile)
        filesToUpload.push({
          name: `license-${i}-${Date.now()}-${track.coverLicenseFile.name.replace(/[^a-zA-Z0-9.-]/g, "")}`,
          file: track.coverLicenseFile,
          assetType: "private_cover_licence",
          setter: (url) => (trackLicenseUrls[i] = url),
        });
    });

    if (filesToUpload.length === 0)
      return { artworkUrl, trackAudioUrls, trackLicenseUrls };

    let completedFiles = 0;
    for (const item of filesToUpload) {
      const downloadPath = item.assetType === "private_audio_master"
        ? await uploadPrivateAudio(item.file, { releaseId: initialRelease?.id })
        : await uploadPrivateAsset(item.file, item.assetType, { releaseId: initialRelease?.id });
      item.setter(downloadPath);
      completedFiles++;
      setUploadProgress(Math.round((completedFiles / filesToUpload.length) * 100));
    }
    setUploadProgress(100);
    return { artworkUrl, trackAudioUrls, trackLicenseUrls };
  }

  async function verifyAndUpdateRelease(payload: any) {
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    const response = await fetch("/api/distribution/update-release", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Update failed.");
    return data;
  }

  async function submitEditedRelease() {
    setStatus("Uploading files...");
    const uploaded = await uploadFilesDirectly();
    setStatus("Submitting changes...");

    const payload = {
      metadata: {
        editReleaseId: initialRelease?.id ?? 0,
        artistName: primaryArtistName,
        releaseTitle: displayedReleaseTitle,
        releaseType,
        releasePreviouslyReleased: release.releasePreviouslyReleased,
        upcCode: release.releasePreviouslyReleased
          ? release.upcCode.trim()
          : undefined,
        releaseDate: selectedReleaseDate,
        originalReleaseDate: release.scheduledReleaseDate,
        recordLabelName: release.recordLabelName,
        labelName: release.recordLabelName,
        primaryGenre: release.primaryGenre,
        secondaryGenre: release.secondaryGenre,
        mood: release.mood,
        language: release.language,
        territory: territoryValue,
        releaseTiming: release.releaseTiming,
        platforms,
        copyrightOwner: release.copyrightOwner,
        publishingRights: release.publishingRights,
        youtubeContentIdEnabled,
        youtubeContentIdChannelUrl,
        monetisationAccepted: socialConsentAccepted,
        monetisationClauses,
        legal,
        paymentModel: selectedPlan === "one_time" ? "one_time" : "subscription",
        plan: selectedPlan,
        artworkFileKey: "artwork",
        existingArtworkUrl: persistedArtworkUrl ?? initialRelease?.artworkUrl ?? undefined,
        uploadedArtworkUrl: uploaded.artworkUrl,
        tracks: tracks.map((track, index) => ({
          trackTitle: track.trackTitle,
          isrc: release.releasePreviouslyReleased
            ? track.existingIsrcCode.trim()
            : undefined,
          version:
            track.versionPreset === "Other"
              ? track.customVersion
              : track.versionPreset,
          trackNumber: index + 1,
          primaryArtist:
            namesFor(track.primaryArtistIds.slice(0, 1)),
          featuredArtists: track.featuredArtists.trim() || undefined,
          additionalPrimaryArtists: track.remixers.trim() || undefined,
          songwriters: contributorNames(track.songwriters),
          composers: contributorNames(track.composers),
          producers: contributorNames(track.producers),
          contributors: [
            ...contributorCredits("songwriter", track.songwriters),
            ...contributorCredits("composer", track.composers),
            ...contributorCredits("producer", track.producers),
          ],
          isCover: track.isCover,
          originalArtist: track.originalArtist,
          originalTrackLink: track.originalTrackLink,
          coverLicenseConfirmed: track.coverLicenseFile
            ? true
            : track.existingCoverLicenseConfirmed,
          coverLicenseFileKey: track.coverLicenseFile
            ? `cover-license-${index}`
            : undefined,
          existingCoverLicenseConfirmed: track.existingCoverLicenseConfirmed,
          existingAudioUrl: track.existingAudioUrl || undefined,
          audioFileKey: `audio-${index}`,
          duration: track.duration,
          explicitContent: track.explicitContent,
          dolbyAtmos: track.dolbyAtmos,
          metadata: { titleLanguage: track.titleLanguage },
          artistProfileIds: track.primaryArtistIds,
          uploadedAudioUrl: uploaded.trackAudioUrls[index],
          uploadedCoverLicenseUrl: uploaded.trackLicenseUrls[index],
        })),
      },
    };

    return await verifyAndUpdateRelease(payload);
  }
  async function verifyAndSubmitRelease(payload: any) {
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    const response = await fetch("/api/distribution/payment/verify-submit", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Submission failed.");
    return data;
  }

  async function saveDraftRelease() {
    setSubmitting(true);
    setUploadProgress(0);
    setStatus("Saving draft...");
    try {
      const uploaded = await uploadFilesDirectly();
      setStatus("Saving draft...");

      const payload = {
        draftReleaseId,
        metadata: {
          artistName: primaryArtistName,
          trackName: tracks[0]?.trackTitle.trim() || displayedReleaseTitle,
          releaseTitle: displayedReleaseTitle,
          releaseType,
          releasePreviouslyReleased: release.releasePreviouslyReleased,
          upcCode: release.releasePreviouslyReleased
            ? release.upcCode.trim()
            : undefined,
          releaseDate: selectedReleaseDate,
          originalReleaseDate: initialRelease?.originalReleaseDate ?? null,
          recordLabelName: release.recordLabelName,
          labelName: release.recordLabelName,
          labelDisplayName: release.recordLabelName,
          primaryGenre: release.primaryGenre,
          secondaryGenre: release.secondaryGenre,
          genre: release.primaryGenre,
          mood: release.mood,
          language: release.language,
          territory: territoryValue,
          releaseTiming: release.releaseTiming,
          platforms,
          copyrightOwner: release.copyrightOwner,
          publishingRights: release.publishingRights,
          youtubeContentIdEnabled,
          youtubeContentIdChannelUrl,
          monetisationAccepted: socialConsentAccepted,
          monetisationClauses,
          legal,
          paymentModel:
            selectedPlan === "one_time" ? "one_time" : "subscription",
          plan: selectedPlan,
          ...(firstReleaseOffer ? { promotionCode: "FIRST_RELEASE_FREE", attribution: campaignAttribution } : {}),
          artworkFileKey: "artwork",
          existingArtworkUrl: persistedArtworkUrl ?? initialRelease?.artworkUrl ?? undefined,
          uploadedArtworkUrl: uploaded.artworkUrl,
          tracks: tracks.map((track, index) => ({
            trackTitle: track.trackTitle,
            isrc: release.releasePreviouslyReleased
              ? track.existingIsrcCode.trim()
              : undefined,
            version:
              track.versionPreset === "Other"
                ? track.customVersion
                : track.versionPreset,
            trackNumber: index + 1,
            primaryArtist:
              namesFor(track.primaryArtistIds.slice(0, 1)),
            featuredArtists: track.featuredArtists.trim() || undefined,
            additionalPrimaryArtists: track.remixers.trim() || undefined,
            songwriters: contributorNames(track.songwriters),
            composers: contributorNames(track.composers),
            producers: contributorNames(track.producers),
            contributors: [
              ...contributorCredits("songwriter", track.songwriters),
              ...contributorCredits("composer", track.composers),
              ...contributorCredits("producer", track.producers),
            ],
            isCover: track.isCover,
            originalArtist: track.originalArtist,
            originalTrackLink: track.originalTrackLink,
            coverLicenseConfirmed: Boolean(
              track.coverLicenseFile || track.existingCoverLicenseConfirmed,
            ),
            coverLicenseFileKey: track.coverLicenseFile
              ? `cover-license-${index}`
              : undefined,
            existingCoverLicenseConfirmed: track.existingCoverLicenseConfirmed,
            existingAudioUrl: track.existingAudioUrl || undefined,
            audioFileKey: `audio-${index}`,
            duration: track.duration,
            explicitContent: track.explicitContent,
            dolbyAtmos: track.dolbyAtmos,
            metadata: { titleLanguage: track.titleLanguage },
            artistProfileIds: track.primaryArtistIds,
            uploadedAudioUrl: uploaded.trackAudioUrls[index],
            uploadedCoverLicenseUrl: uploaded.trackLicenseUrls[index],
          })),
        },
      };

      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));

      const response = await fetch("/api/distribution/save-draft", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save draft.");
      const savedId = Number(data.release?.id ?? draftReleaseId ?? 0);
      if (savedId > 0) {
        setDraftReleaseId(savedId);
      }
      setStatus("Draft saved. Opening Your Releases...");
      router.push("/dashboard/releases");
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save draft.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRelease(
    orderId: string,
    paymentId: string,
    signature: string,
  ) {
    setStatus("Uploading files...");
    const uploaded = await uploadFilesDirectly();
    setStatus("Submitting release...");

    const payload = {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      ...(firstReleaseOffer ? { promotionCode: "FIRST_RELEASE_FREE", attribution: campaignAttribution } : {}),
      metadata: {
        artistName: primaryArtistName,
        releaseTitle: displayedReleaseTitle,
        releaseType,
        releasePreviouslyReleased: release.releasePreviouslyReleased,
        upcCode: release.releasePreviouslyReleased
          ? release.upcCode.trim()
          : undefined,
        releaseDate: selectedReleaseDate,
        recordLabelName: release.recordLabelName,
        primaryGenre: release.primaryGenre,
        secondaryGenre: release.secondaryGenre,
        mood: release.mood,
        language: release.language,
        territory: territoryValue,
        releaseTiming: release.releaseTiming,
        platforms,
        copyrightOwner: release.copyrightOwner,
        publishingRights: release.publishingRights,
        youtubeContentIdEnabled,
        youtubeContentIdChannelUrl,
        monetisationAccepted: socialConsentAccepted,
        monetisationClauses,
        legal,
        paymentModel: selectedPlan === "one_time" ? "one_time" : "subscription",
        plan: selectedPlan,
        artworkFileKey: "artwork",
        existingArtworkUrl: persistedArtworkUrl ?? initialRelease?.artworkUrl ?? undefined,
        uploadedArtworkUrl: uploaded.artworkUrl,
        tracks: tracks.map((track, index) => ({
          trackTitle: track.trackTitle,
          isrc: release.releasePreviouslyReleased
            ? track.existingIsrcCode.trim()
            : undefined,
          version:
            track.versionPreset === "Other"
              ? track.customVersion
              : track.versionPreset,
          trackNumber: index + 1,
          primaryArtist:
            namesFor(track.primaryArtistIds.slice(0, 1)),
          featuredArtists: track.featuredArtists.trim() || undefined,
          additionalPrimaryArtists: track.remixers.trim() || undefined,
          songwriters: contributorNames(track.songwriters),
          composers: contributorNames(track.composers),
          producers: contributorNames(track.producers),
          contributors: [
            ...contributorCredits("songwriter", track.songwriters),
            ...contributorCredits("composer", track.composers),
            ...contributorCredits("producer", track.producers),
          ],
          isCover: track.isCover,
          originalArtist: track.originalArtist,
          originalTrackLink: track.originalTrackLink,
          coverLicenseConfirmed: Boolean(track.coverLicenseFile),
          coverLicenseFileKey: track.coverLicenseFile
            ? `cover-license-${index}`
            : undefined,
          audioFileKey: `audio-${index}`,
          duration: track.duration,
          explicitContent: track.explicitContent,
          dolbyAtmos: track.dolbyAtmos,
          metadata: { titleLanguage: track.titleLanguage },
          artistProfileIds: track.primaryArtistIds,
          uploadedAudioUrl: uploaded.trackAudioUrls[index],
          uploadedCoverLicenseUrl: uploaded.trackLicenseUrls[index],
        })),
      },
    };

    return await verifyAndSubmitRelease(payload);
  }

  async function handleFinalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationIssues.length > 0) {
      const issue = validationIssues[0];
      setValidationErrorKeys(new Set(validationIssues.map((item) => item.key)));
      setAttemptedStep(issue.step);
      setStatus(
        `${validationIssues.length} validation issue${validationIssues.length === 1 ? "" : "s"} found. Fix the highlighted fields before submitting.`,
      );
      triggerFieldFocus(issue);
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);
    setStatus(null);
    try {
      if (isEditing) {
        const data = await submitEditedRelease();
        setSubmittedRelease(data.release);
        setUploadProgress(100);
        return;
      }

      const orderResponse = await fetch(
        "/api/distribution/payment/create-order",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: selectedPlan,
            paymentModel:
              selectedPlan === "one_time" ? "one_time" : "subscription",
            trackCount: tracks.length,
            releaseType,
            platforms,
            youtubeContentIdEnabled,
            ...(firstReleaseOffer ? { promotionCode: "FIRST_RELEASE_FREE" } : {}),
          }),
        },
      );
      const orderData = await orderResponse.json();
      if (!orderResponse.ok)
        throw new Error(orderData.error || "Unable to create payment order.");

      if (orderData.requiresPayment === false) {
        const coveredBySubscription = orderData.subscriptionCovered === true;
        const data = await submitRelease(
          orderData.orderId,
          coveredBySubscription ? `subscription_${Date.now()}` : `free_first_release_${Date.now()}`,
          coveredBySubscription ? "subscription:active" : "free:first-release",
        );
        setSubmittedRelease(data.release);
        setUploadProgress(100);
        return;
      }

      const RazorpayCheckout = window.Razorpay;
      if (!RazorpayCheckout || String(orderData.key).startsWith("dev_")) {
        const paymentId = `dev_dist_payment_${Date.now()}`;
        const data = await submitRelease(
          orderData.orderId,
          paymentId,
          `dev:${orderData.orderId}:${paymentId}`,
        );
        setSubmittedRelease(data.release);
        setUploadProgress(100);
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const razorpay = new RazorpayCheckout({
          key: orderData.key,
          amount: orderData.amount,
          currency: orderData.currency,
          order_id: orderData.orderId,
          name: "HYMN Distribution",
          description: `Distribution checkout - Rs ${orderData.displayAmount}`,
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const data = await submitRelease(
                orderData.orderId,
                response.razorpay_payment_id,
                response.razorpay_signature,
              );
              setSubmittedRelease(data.release);
              setUploadProgress(100);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          modal: { ondismiss: () => reject(new Error("Checkout cancelled.")) },
          theme: { color: "#7db7ff" },
        });
        razorpay.open();
      });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    tracks.forEach((track) => {
      safeRevokePreviewUrl(track.audioPreviewUrl);
      audioPreviewObjectUrlsRef.current.delete(track.audioPreviewUrl);
    });
    if (artworkPreview) safeRevokePreviewUrl(artworkPreview);
    setStep(initialRelease ? 7 : 1);
    setStepMotion("step-adjacent-forward");
    setMobileStepMenuOpen(false);
    setExpandedTrack(0);
    setSubmitting(false);
    setUploadProgress(0);
    setStatus(null);
    setAttemptedStep(null);
    setArtworkFile(null);
    setArtworkPreview(initialRelease?.artworkUrl ?? null);
    setPersistedArtworkUrl(initialRelease?.artworkUrl ?? null);
    setArtworkDimensions(null);
    setArtworkError(
      correctionMentions(initialRelease, /artwork|cover_art_url/i)
        ? "Replace the artwork with a DireNote-compliant JPG/JPEG file (square and at least 3000 x 3000 pixels)."
        : null,
    );
    setArtworkWarning(null);
    setArtworkScanning(false);
    setMonetisationModalOpen(false);
    setYoutubeContentIdModalOpen(false);
    setDraftReleaseId(
      initialRelease?.id ?? null,
    );
    setSocialConsentAccepted(
      initialRelease?.monetisationAccepted ??
        (initialRelease?.platforms?.length
          ? socialPlatformSelected(initialRelease.platforms)
          : true),
    );
    setMonetisationClauses(() => {
      const base = createMonetisationClauseState();
      if (!initialRelease?.monetisationClauses) return base;
      return {
        ...base,
        ...Object.fromEntries(
          Object.entries(initialRelease.monetisationClauses).filter(
            ([key]) => key in base,
          ),
        ),
      } as MonetisationClauseState;
    });
    setYoutubeContentIdEnabled(
      Boolean(initialRelease?.youtubeContentIdEnabled),
    );
    setYoutubeContentIdChannelUrl(
      initialRelease?.youtubeContentIdChannelUrl ?? "",
    );
    setPlatforms(
      initialRelease?.platforms?.length
        ? initialRelease.platforms
        : defaultStorePlatforms,
    );
    setTracks(createTracksFromRelease(initialRelease));
    setRelease(createInitialReleaseDraft(initialRelease, minimumScheduledDate));
    setLegal(createInitialLegalState(initialRelease));
    setSubmittedRelease(null);
  }

  if (submittedRelease) {
    return (
      <SuccessState
        release={submittedRelease}
        onReset={firstReleaseOffer ? () => router.push(`/dashboard/releases?releaseId=${submittedRelease.id}`) : isEditing ? () => router.push("/distribution") : resetForm}
        isResubmission={isEditing}
        resetLabel={firstReleaseOffer ? "Track my release" : isEditing ? "Back to catalogue" : undefined}
      />
    );
  }
  return (
    <>
      <form
        onSubmit={handleFinalSubmit}
        className={clsx("release-workflow grid gap-6 rounded-[1.25rem] border p-4 md:p-6 lg:p-8", (step === 0 || step === 1) && "is-focused-step", step === 0 && "is-audio-upload-step", step === 1 && "is-artist-step", step === 3 && "is-tracklist-step")}
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <header className="release-workspace-header">
          <button type="button" onClick={saveDraftRelease} disabled={submitting} className="release-workspace-quit">Save &amp; Quit</button>
          <NextImage src="/assets/hymnlogowhite.png" alt="HYMN Music" width={116} height={38} priority className="release-workspace-logo" />
          <div className="release-workspace-state" aria-live="polite">
            <span className={autosaveEligible && autosaveStatus === "saved" ? "is-saved" : ""}>{autosaveEligible && autosaveStatus === "saved" ? "Saved ✓" : autosaveLabel}</span>
            {step !== 7 ? <button type="button" onClick={() => goToStep(7)} className="release-workspace-review">Review</button> : null}
          </div>
        </header>
        {firstReleaseOffer ? <div className="release-free-offer-banner flex items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-500">🎁 First release on us</div> : null}
        <div
          className="release-mobile-step-menu md:hidden rounded-[1.3rem] border p-3 md:p-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}
        >
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 md:px-4 py-2.5 md:py-3 text-left transition-all"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
            onClick={() => setMobileStepMenuOpen((current) => !current)}
            aria-expanded={mobileStepMenuOpen}
          >
            <div>
              <p
                className="text-[10px] md:text-xs uppercase tracking-[0.18em]"
                style={{ color: "var(--text-soft)" }}
              >
                Stage {menuStepIndexes.indexOf(step as (typeof menuStepIndexes)[number]) + 1} of {menuStepIndexes.length}
              </p>
              <p
                className="mt-1 text-sm md:text-base font-semibold"
                style={{ color: "var(--text)" }}
              >
                {steps[step]}
              </p>
            </div>
            <ChevronDown
              className={clsx(
                "h-4 w-4 md:h-5 md:w-5 transition-transform flex-shrink-0",
                mobileStepMenuOpen ? "rotate-180" : "",
              )}
              style={{ color: "var(--text-soft)" }}
            />
          </button>

          <div
            className={clsx(
              "grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out",
              mobileStepMenuOpen
                ? "mt-3 grid-rows-[1fr] opacity-100 translate-y-0"
                : "mt-0 grid-rows-[0fr] opacity-0 -translate-y-1",
            )}
            aria-hidden={!mobileStepMenuOpen}
          >
            <div
              className={clsx(
                "overflow-hidden border-t",
                mobileStepMenuOpen ? "pt-3" : "pt-0",
              )}
              style={{ borderColor: "var(--border)" }}
            >
              <div className="grid gap-2">
                {menuStepIndexes.map((index) => {
                  const label = steps[index];
                  const buttonState = stepButtonStyles(index);
                  return (
                    <button
                      key={`mobile-${label}`}
                      type="button"
                      onClick={() => jumpToStep(index)}
                      className={clsx(
                        buttonState.className,
                        "text-left py-2.5 md:py-3 px-3 md:px-4",
                      )}
                      style={buttonState.style}
                    >
                      <span className="flex items-center gap-2">
                        {buttonState.validity === "invalid" ? (
                          <AlertCircle
                            className="h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                        ) : null}
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="release-workflow-nav hidden gap-2 md:grid md:grid-cols-5 lg:grid-cols-1" aria-label="Release submission steps">
          {menuStepIndexes.map((index) => {
            const label = steps[index];
            const buttonState = stepButtonStyles(index);
            return (
              <button
                key={label}
                type="button"
                onClick={() => jumpToStep(index)}
                className={buttonState.className}
                style={buttonState.style}
              >
                <span className="flex items-center justify-center gap-2">
                  {buttonState.validity === "invalid" ? (
                    <AlertCircle
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                  ) : null}
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        <aside className="release-workflow-summary hidden lg:block" aria-label="Release summary">
          <div className="release-summary-card rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
            <p className="text-sm font-semibold">Release status</p>
            <div className="mt-4 flex items-center justify-between text-sm"><span style={{ color: "var(--text-muted)" }}>Completion</span><strong>{completion}%</strong></div>
            <div className="release-summary-progress mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}><span className="block h-full rounded-full" style={{ width: `${completion}%`, background: completion === 100 ? "var(--success)" : "var(--info)" }} /></div>
            <dl className="release-summary-stats mt-5 grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between gap-3"><dt style={{ color: "var(--text-muted)" }}>Missing required</dt><dd>{validationIssueCount}</dd></div>
              <div className="flex justify-between gap-3"><dt style={{ color: "var(--text-muted)" }}>Plan</dt><dd className="text-right">{currentPlan.title}</dd></div>
              <div className="flex justify-between gap-3"><dt style={{ color: "var(--text-muted)" }}>Artists</dt><dd>{artistCount}</dd></div>
              <div className="flex justify-between gap-3"><dt style={{ color: "var(--text-muted)" }}>Tracks</dt><dd>{tracks.length}</dd></div>
              <div className="flex justify-between gap-3"><dt style={{ color: "var(--text-muted)" }}>{subscriptionCovered ? "Active subscription" : selectedPlan === "one_time" ? "Price" : "Plan coverage"}</dt><dd className="text-right">{subscriptionCovered ? currentPlan.title : selectedPlan === "one_time" ? (firstReleaseOffer && finalDistributionAmount === 0 ? "FREE" : `₹${finalDistributionAmount.toLocaleString("en-IN")}`) : `${currentPlan.cadence} · ₹${distributionAmount.toLocaleString("en-IN")}`}</dd></div>
              <div className="flex justify-between gap-3"><dt style={{ color: "var(--text-muted)" }}>Save state</dt><dd aria-live="polite" style={{ color: autosaveEligible && autosaveStatus === "error" ? "var(--danger)" : autosaveEligible && autosaveStatus === "saved" ? "var(--success)" : "var(--text-muted)" }}>{autosaveLabel}</dd></div>
            </dl>
            {validationIssueCount > 0 ? <div className="release-summary-tasks mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}><p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-soft)" }}>Next up</p><ul className="mt-3 grid gap-1">{validationIssues.slice(0, 5).map((issue) => <li key={`${issue.key}-${issue.trackIndex ?? "release"}`}><button type="button" onClick={() => triggerFieldFocus(issue)} className="group flex w-full items-start justify-between gap-3 py-2 text-left text-xs leading-5 transition" style={{ color: "var(--text-muted)" }}><span>{issue.message}</span><span className="shrink-0 text-[var(--text-soft)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" aria-hidden="true">→</span></button></li>)}</ul></div> : null}
          </div>
        </aside>
        <div className="release-workflow-content grid min-w-0 gap-6">
        <details className="release-mobile-summary rounded-xl border p-3 lg:hidden" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold">Release summary <span>{completion}% complete</span></summary>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm" style={{ borderColor: "var(--border)" }}><p style={{ color: "var(--text-muted)" }}>Missing required</p><p className="text-right">{validationIssueCount}</p><p style={{ color: "var(--text-muted)" }}>Plan</p><p className="text-right">{currentPlan.title}</p><p style={{ color: "var(--text-muted)" }}>Artists / tracks</p><p className="text-right">{artistCount} / {tracks.length}</p><p style={{ color: "var(--text-muted)" }}>Save state</p><p className="text-right" aria-live="polite">{autosaveLabel}</p></div>
        </details>
        {step === 1 ? (
          <section className={clsx("release-artist-stage", stepMotion)}>
            <div className="release-focused-intro">
              <h2>Who are the primary artists on this release?</h2>
            </div>
            <div ref={registerField("release-primary-artists")} className="release-focused-card">
              <div className="release-artist-avatar-picker">
              {(tracks[0]?.primaryArtistIds ?? []).length > 0 ? <div className="release-selected-artists" aria-label="Selected primary artists">
                {(tracks[0]?.primaryArtistIds ?? []).map((profileId) => {
                  const profile = knownProfiles[profileId];
                  if (!profile) return null;
                  const removalArmed = artistRemovalCandidateId === profileId;
                  return <button type="button" key={profileId} className={clsx("release-selected-artist", removalArmed && "is-removal-armed")} title={removalArmed ? `Remove ${profile.name}` : profile.name} aria-label={removalArmed ? `Confirm removal of ${profile.name}` : `${profile.name}. Click to remove.`} onClick={() => { if (removalArmed) { updatePrimaryArtistsForAllTracks(tracks[0].primaryArtistIds.filter((id) => id !== profileId)); setArtistRemovalCandidateId(null); } else setArtistRemovalCandidateId(profileId); }}>
                    {profile.imageUrl ? <img src={profile.imageUrl} alt="" /> : <span className="release-selected-artist-avatar">{profile.name.slice(0, 1).toUpperCase()}</span>}
                    <span className="release-selected-artist-remove" aria-hidden="true"><X /></span>
                  </button>;
                })}
              </div> : null}
              <ArtistPicker
                label="Add artist"
                helper="Max 3 artists"
                valueIds={profilesFor(tracks[0]?.primaryArtistIds ?? [])}
                query={tracks[0]?.primaryArtistQuery ?? ""}
                max={3}
                showRecentQuickAdd
                hideSelectionChips
                focused
                required={showErrors && !primaryArtistComplete}
                onQueryChange={(value) => updateTrack(0, { primaryArtistQuery: value })}
                onSelect={(profile) => { if (tracks[0].primaryArtistIds.length >= 3) return; upsertKnownProfile(profile); updatePrimaryArtistsForAllTracks(tracks[0].primaryArtistIds.includes(profile.id) ? tracks[0].primaryArtistIds : [...tracks[0].primaryArtistIds, profile.id]); }}
                onRemove={() => undefined}
              />
              </div>
              <div className="release-artist-stage-count"><span>{tracks[0]?.primaryArtistIds.length ?? 0} of 3 selected</span><span>Artist order is used for store delivery</span></div>
            </div>
            <button type="button" onClick={continueFromArtists} disabled={stepTransitioning} className="release-artist-continue">
              {stepTransitioning ? "Opening add music…" : "Continue to add music →"}
            </button>
          </section>
        ) : null}
        {step === 5 ? (
          <section className={clsx("grid gap-5", stepMotion)}>
            <StepIntro title="Confirm ownership and delivery" />
            <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">C-Line<input className="field" value={release.copyrightOwner} onChange={(event) => setRelease((current) => ({ ...current, copyrightOwner: event.target.value }))} /></label><label className="grid gap-2 text-sm font-semibold">P-Line<input className="field" value={release.publishingRights} onChange={(event) => setRelease((current) => ({ ...current, publishingRights: event.target.value }))} /></label></div>
              <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-start justify-between gap-3"><p className="font-semibold">Legal Declaration</p><span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: legalComplete ? "#22c55e" : "var(--text-soft)" }}>{legalComplete ? "Agreed" : "Required"}</span></div>
                <details open={legalDetailsOpen} onToggle={(event) => setLegalDetailsOpen(event.currentTarget.open)} className="legal-declaration-details group mt-5 overflow-hidden rounded-xl border px-4 py-1" style={{ borderColor: "var(--border)" }}>
                  <summary onClick={(event) => { if (!legalComplete) event.preventDefault(); }} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden"><span>Review declaration terms</span><ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-soft)] transition-transform duration-200 group-open:rotate-180" /></summary>
                  <div className="legal-declaration-copy pb-5 pt-3">
                    <div className="grid gap-4">
                      <p><span aria-hidden="true">✓</span><span>I confirm that I own or control all rights required to distribute this content.</span></p>
                      <p><span aria-hidden="true">✓</span><span>I confirm that all collaborators, contributors and rights holders have authorized this release.</span></p>
                      <p><span aria-hidden="true">✓</span><span>I understand that false ownership claims, copyright infringement or fraudulent submissions may result in removal of my release and suspension of my HYMN account.</span></p>
                      <p><span aria-hidden="true">✓</span><span>I understand that this release will be distributed through HYMN&apos;s distribution network, which retains 30% of Net Royalty Revenue. The remaining eligible earnings will be reflected in my HYMN dashboard where reporting, royalty tracking, splits and payouts are managed.</span></p>
                    </div>
                    <div className="legal-declaration-disclosure">
                      <span className="legal-declaration-disclosure-label">Distribution disclosure</span>
                      <p>By submitting this release, you acknowledge that distribution is fulfilled through HYMN&apos;s distribution network, which retains 30% of Net Royalty Revenue in accordance with the applicable distribution agreement. The remaining 70% of eligible Net Royalty Revenue is reflected within your HYMN earnings dashboard, where HYMN manages reporting, royalty tracking, splits, and payout processing according to your account settings and any configured royalty splits.</p>
                    </div>
                  </div>
                </details>
                <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm font-semibold"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={legalComplete} onChange={(event) => { setLegalDeclarationAccepted(event.target.checked); setLegalDetailsOpen(!event.target.checked); }} /><span>I have read and agree to the Legal Declaration above.</span></label>
              </div>
            </div>
          </section>
        ) : null}
        {step === 0 ? (
          <section className={clsx("release-audio-stage", stepMotion)}>
            <div className="release-focused-intro">
              <h2>Add your music and cover</h2>
              <p>{firstReleaseOffer ? "Upload 1 track for your free Single release" : "Add up to 30 tracks for a maximum length of 1 hour"}<br /><span className="release-dolby-note"><img src="https://d21buns5ku92am.cloudfront.net/68644/images/413934-Dolby%20Atmos%20Horizontal-015e44-medium-1641853769.png" alt="Dolby Atmos" className="release-dolby-logo" /> Add Dolby Atmos™ files directly in track information.</span></p>
            </div>
            <div className="release-onboarding-assets">
            <div className="release-onboarding-audio">
              <div className="release-onboarding-asset-heading"><strong>Audio masters</strong><span>WAV or MP3 · upload the final mastered file</span></div>
            <div className="release-audio-queue">
              {!tracks.some((track) => track.audioPreviewUrl && track.audioUploadStatus === "uploaded") ? (
                <div className="release-audio-empty-state">
                  {[0, 1, 2, 3].map((slot) => <span key={slot} />)}
                  <div className="release-audio-empty-action">
                    <UploadDropzone accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3" iconOnly compact ctaLabel="Add tracks" title="Add tracks" description="Choose a WAV or MP3 master" helperLines={[]} onSelect={async (file, controls) => handleAudioFile(0, file, controls)} />
                  </div>
                </div>
              ) : tracks.map((track, index) => {
                const hasAudio = Boolean(track.audioPreviewUrl && track.audioUploadStatus === "uploaded");
                return (
                  <article key={track.id} className={clsx("release-audio-queue-item", hasAudio && "is-ready")}>
                    <div className="release-audio-queue-main">
                      {hasAudio ? (
                        <div className="release-audio-inline-details">
                          <AudioWaveform
                            src={track.audioPreviewUrl}
                            title={track.trackTitle || `Track ${index + 1}`}
                            subtitle={[track.audioFileName, track.duration, fileFormat(track.audioFile, track.audioFileName)].filter(Boolean).join(" • ")}
                            compact
                            editableTitle={{
                              value: track.trackTitle,
                              placeholder: "Add track name",
                              ariaLabel: `Track ${index + 1} name`,
                              inputRef: registerField(`track-${index}-title`) as (node: HTMLInputElement | null) => void,
                              onChange: (value) => updateTrack(index, { trackTitle: value }),
                            }}
                          />
                        </div>
                      ) : (
                        <UploadDropzone accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3" iconOnly compact ctaLabel="Add track" title={`Track ${index + 1} audio`} description="Choose a WAV or MP3 master" helperLines={[]} fileName={track.audioFile?.name || track.audioFileName} fileFormat={fileFormat(track.audioFile, track.audioFileName)} onSelect={async (file, controls) => handleAudioFile(index, file, controls)} />
                      )}
                    </div>
                    {hasAudio ? (
                      <div className="release-audio-row-actions">
                        <button type="button" onClick={() => tracks.length > 1 ? removeTrack(index) : clearTrackAudio(index)} aria-label={`Remove track ${index + 1}`}><X /></button>
                      </div>
                    ) : tracks.length > 1 ? <button type="button" className="release-audio-remove" onClick={() => removeTrack(index)} aria-label={`Remove empty track ${index + 1}`}><X /></button> : null}
                  </article>
                );
              })}
              {tracks.some((track) => track.audioPreviewUrl && track.audioUploadStatus === "uploaded")
                ? Array.from({ length: Math.max(0, 4 - tracks.length) }, (_, slot) => <span key={`available-audio-slot-${slot}`} className="release-audio-placeholder" aria-hidden="true" />)
                : null}
              {firstReleaseOffer ? (
                <button type="button" disabled className="release-add-audio-track" title="Locked for this FREE one-time Single release" aria-label="Add another track locked for this free one-time Single release">
                  <LockKeyhole />
                  <span>Add track — locked for this FREE release</span>
                </button>
              ) : tracks.some((track) => track.audioPreviewUrl && track.audioUploadStatus === "uploaded") ? (
                <button type="button" onClick={addTrack} className="release-add-audio-track" title="Add another audio master">
                  <Plus />
                  <span>Add track</span>
                </button>
              ) : null}
            </div>
            </div>
            <div ref={registerField("artwork-upload")} className="release-onboarding-artwork">
              <div className="release-onboarding-artwork-heading"><strong>Cover artwork</strong><span>JPG · square · minimum 3000 × 3000 px</span></div>
              <ArtworkSquareDropzone previewUrl={artworkPreview} fileName={artworkFile?.name} fileType={fileFormat(artworkFile)} dimensions={artworkDimensions} error={showErrors && artworkIssue() ? artworkIssue()?.message ?? null : artworkError} minimalFeedback onSelect={handleArtwork} />
              {artworkScanning ? <p className="release-onboarding-artwork-note"><LoaderCircle className="animate-spin" />Checking artwork…</p> : null}
              {artworkWarning ? <ArtworkWarning warning={artworkWarning} /> : null}
            </div>
            </div>
          </section>
        ) : null}
        {step === 2 ? (
          <StepIntro
            title="Define your release"
          />
        ) : null}
        {step === 4 ? (
          <StepIntro
            title="Prepare your cover artwork"
            meta={artworkPreview && !artworkError ? "Artwork ready" : undefined}
          />
        ) : null}
        {step === 5 ? (
          <StepIntro
            title="Choose where your music goes"
          />
        ) : null}
        {step === 2 ? (
          <div className="card-base mb-5">
            <p className="text-sm font-semibold">Already released?</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Use this if the release was previously distributed and already has
              official UPC/ISRC identifiers.
            </p>
            <div className="mt-4 flex gap-3">
              {[true, false].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  className={
                    release.releasePreviouslyReleased === value
                      ? "btn-primary"
                      : "btn-outline"
                  }
                  onClick={() => {
                    setRelease((current) => ({
                      ...current,
                      releasePreviouslyReleased: value,
                      ...(!value ? { upcCode: "", existingIsrcCode: "" } : {}),
                    }));
                    if (!value)
                      setTracks((current) =>
                        current.map((track) => ({
                          ...track,
                          existingIsrcCode: "",
                        })),
                      );
                  }}
                >
                  {value ? "Yes" : "No"}
                </button>
              ))}
            </div>
            {release.releasePreviouslyReleased ? (
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span>Release UPC Code <ContextualHelp faqId="upc" label="UPC">Use the official UPC only when this exact release was distributed before.</ContextualHelp></span>
                  <input
                    ref={registerField("existing-upc")}
                    className={fieldClass(
                      "existing-upc",
                      Boolean(
                        showErrors &&
                          releaseInfoIssue()?.key === "existing-upc",
                      ),
                    )}
                    inputMode="numeric"
                    value={release.upcCode}
                    onChange={(e) =>
                      setRelease((c) => ({
                        ...c,
                        upcCode: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                    placeholder="12–13 digits"
                  />
                </label>
                <div
                  ref={registerField("existing-isrc")}
                  className="grid gap-3"
                >
                  {tracks.map((track, index) => (
                    <label
                      key={`${track.id}-isrc`}
                      className="grid gap-2 text-sm"
                    >
                      <span>{`Track ${index + 1} — ${track.trackTitle || "Untitled track"}`}</span>
                      <input
                        className={fieldClass(
                          `track-${index}-isrc`,
                          Boolean(
                            showErrors &&
                              releaseInfoIssue()?.key === "existing-isrc" &&
                              !track.existingIsrcCode.trim(),
                          ),
                        )}
                        value={track.existingIsrcCode}
                        onChange={(e) =>
                          updateTrack(index, {
                            existingIsrcCode: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="Existing ISRC Code"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {step === 3 ? (
          <section className={clsx("release-tracklist-stage grid gap-3", stepMotion)}>
            <header className="release-tracklist-heading">
              <div>
                <h2>Track list</h2>
                <p>{tracks.length} track{tracks.length === 1 ? "" : "s"}</p>
              </div>
              <div>
                <button type="button" onClick={() => setExpandedTrack(-1)} disabled={expandedTrack === -1}><ChevronUp /> Collapse all</button>
                <span><GripVertical /> Drag rows to reorder</span>
              </div>
            </header>
            {tracks.map((track, index) => {
              const expanded = expandedTrack === index;
              const issue = showErrors ? trackIssue(track, index) : null;
              const metadataReady = Boolean(track.trackTitle.trim() && !isPlaceholderTrackTitle(track.trackTitle) && track.primaryArtistIds.length && contributorsValid(track.songwriters) && contributorsValid(track.composers) && contributorsValid(track.producers));
              const audioReady = Boolean(track.audioFile || track.existingAudioUrl || track.audioPreviewUrl);
              const trackReady = metadataReady && audioReady;
              return (
                <div
                  key={track.id}
                  data-track-index={index}
                  className={clsx("release-track-panel rounded-[1.7rem] border p-4 transition-all duration-300 md:p-5", draggedTrackIndex === index && "is-dragging")}
                  onDragOver={(event) => { if (draggedTrackIndex != null) event.preventDefault(); }}
                  onDrop={(event) => { event.preventDefault(); if (draggedTrackIndex != null) reorderTrack(draggedTrackIndex, index); setDraggedTrackIndex(null); }}
                  style={{
                    borderColor: trackReady
                      ? "rgba(34,197,94,0.48)"
                      : "rgba(248,113,113,0.48)",
                    background: "var(--card)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className={clsx(
                      "release-track-trigger group pressable accordion-trigger flex w-full items-center justify-between gap-3 md:gap-4 rounded-[1.25rem] border px-3 md:px-4 py-3 md:py-4 text-left transition-all",
                      expanded ? "is-open" : "",
                    )}
                    onClick={() => setExpandedTrack((current) => current === index ? -1 : index)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedTrack((current) => current === index ? -1 : index); } }}
                    aria-expanded={expanded}
                    style={{
                      borderColor: trackReady
                        ? "rgba(34,197,94,0.42)"
                        : "rgba(248,113,113,0.42)",
                      background: expanded
                        ? trackReady
                          ? "linear-gradient(135deg, rgba(34,197,94,0.075), rgba(34,197,94,0.018))"
                          : "linear-gradient(135deg, rgba(248,113,113,0.07), rgba(248,113,113,0.016))"
                        : "transparent",
                    }}
                  >
                    <div className="min-w-0">
                      <h3
                        className="truncate text-xl font-bold tracking-[-0.025em] md:text-2xl"
                        style={{ color: "var(--text)" }}
                      >
                        {!isPlaceholderTrackTitle(track.trackTitle) && track.trackTitle.trim()
                          ? track.trackTitle
                          : track.audioFileName || `Track ${index + 1}`}
                      </h3>
                      <p
                        className="mt-1 md:mt-2 truncate text-xs md:text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {[fileFormat(track.audioFile, track.audioFileName), namesFor(track.primaryArtistIds) || track.primaryArtistQuery || "Primary artist required"].filter(Boolean).join(" • ")}
                      </p>
                      <div className="release-track-status mt-2 flex flex-wrap gap-2 text-[11px] font-medium"><span style={{ color: audioReady ? "var(--success)" : "var(--danger)" }}>{audioReady ? "Audio ready" : "Audio required"}</span><span aria-hidden="true" style={{ color: trackReady ? "var(--success)" : "var(--danger)", opacity: .45 }}>·</span><span style={{ color: metadataReady ? "var(--success)" : "var(--danger)" }}>{metadataReady ? "Metadata ready" : "Metadata required"}</span>{issue ? <><span aria-hidden="true" style={{ color: "var(--danger)", opacity: .45 }}>·</span><span style={{ color: "var(--danger)" }}>Action required</span></> : null}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={clsx(
                        "inline-flex flex-shrink-0 items-center gap-1 py-1 text-[10px] uppercase tracking-[0.18em] transition duration-300 md:gap-2 md:text-xs",
                      )}
                      style={{
                        color: expanded ? "var(--text)" : "var(--text-soft)",
                      }}
                    >
                      {expanded ? "Collapse" : "Edit"}
                      <ChevronDown
                        className={clsx(
                          "h-3 w-3 md:h-3.5 md:w-3.5 transition-transform duration-300",
                          expanded ? "rotate-180" : "",
                        )}
                      />
                    </span>
                    <button type="button" onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDraggedTrackIndex(index); }} onPointerUp={(event) => { event.stopPropagation(); const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-track-index]"); const targetIndex = Number(target?.dataset.trackIndex); if (Number.isInteger(targetIndex)) reorderTrack(index, targetIndex); setDraggedTrackIndex(null); event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => setDraggedTrackIndex(null)} onClick={(event) => event.stopPropagation()} className="track-header-action touch-none cursor-grab select-none active:cursor-grabbing" aria-label={`Drag to reorder ${track.trackTitle || `track ${index + 1}`}`} title="Drag to reorder"><GripVertical className="h-4 w-4" /></button>
                    {tracks.length > 1 ? <button type="button" onClick={(event) => { event.stopPropagation(); removeTrack(index); }} className="track-header-action hover:text-red-500" aria-label={`Remove ${track.trackTitle || `track ${index + 1}`}`} title="Remove track"><X className="h-4 w-4" /></button> : null}
                    </div>
                  </div>
                  <div
                    className={clsx(
                      "grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out",
                      expanded
                        ? "grid-rows-[1fr] opacity-100 translate-y-0"
                        : "grid-rows-[0fr] opacity-0 -translate-y-1",
                    )}
                    aria-hidden={!expanded}
                  >
                    <div className="overflow-hidden">
                      <div className="track-editor-fields mt-4 md:mt-6 grid gap-5 md:gap-7">
                        <div className="grid gap-3 md:gap-4 md:grid-cols-2">
                          <div>
                            <label
                              className="mb-2 block text-xs md:text-sm font-medium"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Track title
                            </label>
                            <input
                              ref={registerField(`track-${index}-title`)}
                              className={fieldClass(
                                `track-${index}-title`,
                                Boolean(
                                  showErrors &&
                                    issue?.key === `track-${index}-title`,
                                ),
                              )}
                              value={track.trackTitle}
                              onChange={(event) =>
                                updateTrack(index, {
                                  trackTitle: event.target.value,
                                })
                              }
                              placeholder="Track title"
                            />
                          </div>
                          <div>
                            <label
                              className="mb-2 block text-xs md:text-sm font-medium"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Version
                            </label>
                            <button
                              type="button"
                              className={fieldClass(
                                `track-${index}-version`,
                                Boolean(
                                  showErrors &&
                                    issue?.key === `track-${index}-version`,
                                ),
                              )}
                              onClick={() => setVersionPickerTrack(index)}
                            >
                              <span className="flex w-full items-center justify-between gap-3 text-left"><span>{track.versionPreset || "Choose version"}</span><ChevronDown className="h-4 w-4 text-[var(--text-soft)]" /></span>
                            </button>
                            {versionPickerTrack === index && typeof document !== "undefined" ? createPortal(
                              <div className="genre-picker-backdrop fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setVersionPickerTrack(null); }}>
                                <section role="dialog" aria-modal="true" aria-label="Choose track version" className="genre-picker-modal w-full overflow-hidden rounded-t-[1.5rem] border shadow-2xl sm:max-w-md sm:rounded-[1.5rem]" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                                  <header className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}><h3 className="font-semibold" style={{ color: "var(--text)" }}>Track version</h3><button type="button" onClick={() => setVersionPickerTrack(null)} aria-label="Close version picker" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-soft)]"><X className="h-4 w-4" /></button></header>
                                  <div className="grid gap-1 p-3">{versionOptions.filter((option) => option !== "Explicit").map((option) => { const selected = track.versionPreset === option; return <button key={option} type="button" className="flex min-h-11 items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-[var(--bg-soft)]" style={{ color: "var(--text)" }} onClick={() => { updateTrack(index, { versionPreset: option, customVersion: option === "Other" ? track.customVersion : "" }); setVersionPickerTrack(null); }}><span>{option}</span>{selected ? <Check className="h-4 w-4 text-[var(--accent)]" /> : null}</button>; })}</div>
                                </section>
                              </div>, document.body) : null}
                            {track.versionPreset === "Other" ? (
                              <input
                                className={clsx(
                                  "field mt-3",
                                  showErrors &&
                                    issue?.key === `track-${index}-version`
                                    ? "field-invalid"
                                    : "",
                                  shakingField === `track-${index}-version`
                                    ? "field-shake"
                                    : "",
                                )}
                                value={track.customVersion}
                                placeholder="Custom version label"
                                onChange={(event) =>
                                  updateTrack(index, {
                                    customVersion: event.target.value,
                                  })
                                }
                              />
                            ) : null}
                          </div>
                        </div>
                        <div
                          ref={registerField(`track-${index}-artists`)}
                          className={clsx(
                            showErrors &&
                              issue?.key === `track-${index}-artists`
                              ? "field-shake"
                              : "",
                          )}
                        >
                          <div className="grid gap-3 md:gap-4 lg:grid-cols-3">
                            <div className="release-track-artist-field">
                              <span className="release-track-artist-label">Primary Artist</span>
                              <div className="release-track-artist-avatar-picker">
                                {track.primaryArtistIds.map((profileId) => {
                                  const profile = knownProfiles[profileId];
                                  if (!profile) return null;
                                  const removalKey = `${track.id}:${profileId}`;
                                  const removalArmed = trackArtistRemovalCandidate === removalKey;
                                  return <button type="button" key={profileId} className={clsx("release-track-selected-artist", removalArmed && "is-removal-armed")} title={removalArmed ? `Remove ${profile.name}` : profile.name} aria-label={removalArmed ? `Confirm removal of ${profile.name}` : `${profile.name}. Click twice to remove.`} onClick={() => { if (removalArmed) { updateTrack(index, { primaryArtistIds: track.primaryArtistIds.filter((id) => id !== profileId) }); setTrackArtistRemovalCandidate(null); } else setTrackArtistRemovalCandidate(removalKey); }}>
                                    {profile.imageUrl ? <img src={profile.imageUrl} alt="" /> : <span className="release-selected-artist-avatar">{profile.name.slice(0, 1).toUpperCase()}</span>}
                                    <span className="release-selected-artist-remove" aria-hidden="true"><X /></span>
                                  </button>;
                                })}
                                <ArtistPicker
                                  label="Add primary artist"
                                  helper="Max 3 artists"
                                  valueIds={profilesFor(track.primaryArtistIds)}
                                  query={track.primaryArtistQuery}
                                  max={3}
                                  hideSelectionChips
                                  focused
                                  required={showErrors && issue?.key === `track-${index}-artists`}
                                  onQueryChange={(value) => updateTrack(index, { primaryArtistQuery: value })}
                                  onSelect={(profile) => {
                                    upsertKnownProfile(profile);
                                    updateTrack(index, {
                                      primaryArtistIds: track.primaryArtistIds.includes(profile.id) ? track.primaryArtistIds : [...track.primaryArtistIds, profile.id],
                                      primaryArtistQuery: "",
                                    });
                                  }}
                                  onRemove={() => undefined}
                                />
                              </div>
                              <small>Up to 3 artist profiles</small>
                            </div>
                            <div>
                              <label
                                className="mb-2 block px-[.8rem] text-xs font-medium md:text-sm"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Featured artists
                              </label>
                              <input
                                className="field"
                                value={track.featuredArtists}
                                onChange={(event) =>
                                  updateTrack(index, {
                                    featuredArtists: event.target.value,
                                  })
                                }
                                placeholder="Featured artist names only"
                              />
                            </div>
                            <div>
                              <label
                                className="mb-2 block px-[.8rem] text-xs font-medium md:text-sm"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Remixer
                              </label>
                              <input
                                className="field"
                                value={track.remixers}
                                onChange={(event) =>
                                  updateTrack(index, {
                                    remixers: event.target.value,
                                  })
                                }
                                placeholder="Remixer names only"
                              />
                            </div>
                          </div>
                        </div>
                        <div
                          ref={registerField(`track-${index}-contributors`)}
                          className={clsx(
                            "contributors-card rounded-[1.25rem] border p-3 md:p-4",
                            showErrors &&
                              issue?.key === `track-${index}-contributors`
                              ? "field-shake"
                              : "",
                          )}
                          style={{
                            borderColor:
                              contributorsValid(track.songwriters) &&
                              contributorsValid(track.composers) &&
                              contributorsValid(track.producers)
                                ? "color-mix(in srgb, var(--accent) 24%, var(--border))"
                                : "rgba(250,204,21,0.38)",
                            background:
                              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 5%, var(--bg-soft)), var(--bg-soft))",
                          }}
                        >
                          <div className="contributors-content">
                            <div className="contributors-heading flex items-center justify-between gap-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <p
                                  className="text-sm font-semibold"
                                  style={{ color: "var(--text)" }}
                                >
                                  Contributors
                                </p>
                              </div>
                              <button
                                type="button"
                                className="contributors-edit pressable text-xs font-semibold md:text-sm"
                                onClick={() => openContributors(index)}
                              >
                                Edit credits
                              </button>
                            </div>
                            <div className="contributors-grid grid md:grid-cols-3">
                                {[
                                  {
                                    label: "Songwriters",
                                    short: "S",
                                    entries: track.songwriters,
                                  },
                                  {
                                    label: "Composers",
                                    short: "C",
                                    entries: track.composers,
                                  },
                                  {
                                    label: "Producers",
                                    short: "P",
                                    entries: track.producers,
                                  },
                                ].map(({ label, short, entries }) => {
                                  const names = contributorNames(entries);
                                  const complete = contributorsValid(entries);
                                  return (
                                    <div
                                      key={label}
                                      className="contributor-role"
                                      style={{
                                        borderColor: complete
                                          ? "var(--border)"
                                          : "rgba(250,204,21,0.38)",
                                        background: "var(--card)",
                                      }}
                                    >
                                      <div className="contributor-role-head flex items-center justify-between gap-2">
                                        <span
                                          className="contributor-role-label text-[10px] uppercase tracking-[0.16em]"
                                          style={{ color: "var(--text-soft)" }}
                                        >
                                          {label}
                                        </span>
                                        <span
                                          className="contributor-role-badge inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
                                          style={{
                                            background: complete
                                              ? "rgba(34,197,94,0.14)"
                                              : "rgba(250,204,21,0.14)",
                                            color: complete
                                              ? "#86efac"
                                              : "#fde68a",
                                          }}
                                        >
                                          {complete ? <Check className="h-3 w-3" aria-label="Complete" /> : short}
                                        </span>
                                      </div>
                                      <p
                                        className="contributor-role-value truncate text-sm font-medium"
                                        style={{
                                          color: names
                                            ? "var(--text)"
                                            : "var(--text-soft)",
                                        }}
                                      >
                                        {names || "Pending legal name"}
                                      </p>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                        <div
                          ref={registerField(`track-${index}-audio`)}
                          className={clsx("audio-upload-stage grid gap-3 rounded-[1.3rem] border p-3", track.audioPreviewUrl && track.audioUploadStatus === "uploaded" && "is-ready")}
                          style={{
                            borderColor: "var(--border)",
                            background: "var(--bg-soft)",
                          }}
                        >
                          <UploadDropzone
                            accept="audio/wav,audio/x-wav,audio/mpeg,.wav,.mp3"
                            iconOnly
                            compact={Boolean(track.audioPreviewUrl && track.audioUploadStatus === "uploaded")}
                            title="Audio upload"
                            description="Drop the master audio here"
                            helperLines={[
                              "Direct-to-storage",
                              "WAV or MP3 only",
                              "Resumable for large files",
                            ]}
                            fileName={
                              track.audioFile?.name || track.audioFileName
                            }
                            fileFormat={fileFormat(
                              track.audioFile,
                              track.audioFileName,
                            )}
                            fileSize={formatFileSize(track.audioFile?.size)}
                            error={
                              showErrors &&
                              issue?.key === `track-${index}-audio`
                                ? issue.message
                                : null
                            }
                            onSelect={async (file, controls) => {
                              await handleAudioFile(index, file, controls);
                            }}
                          />
                          {track.audioPreviewUrl && track.audioUploadStatus === "uploaded" ? <div
                            className="audio-preview-reveal rounded-[1.1rem] border p-3"
                            style={{
                              borderColor: "var(--border)",
                              background: "var(--card)",
                            }}
                          >
                            <AudioWaveform
                              src={track.audioPreviewUrl}
                              title={
                                track.trackTitle || `Track ${index + 1} preview`
                              }
                              subtitle={
                                [
                                  track.duration,
                                  fileFormat(
                                    track.audioFile,
                                    track.audioFileName,
                                  ),
                                  formatFileSize(track.audioFile?.size),
                                ]
                                  .filter(Boolean)
                                  .join(" • ") || "Upload audio to preview"
                              }
                              compact
                            />
                          </div> : null}
                        </div>
                        <div className="grid gap-3 md:gap-4 md:grid-cols-3">
                          <div
                            ref={registerField(`track-${index}-title-language`)}
                          >
                            <SearchableSelect
                              label="Track Title Language"
                              value={track.titleLanguage}
                              options={languageOptions}
                              placeholder="Select title language"
                              onChange={(value) =>
                                updateTrack(index, { titleLanguage: value })
                              }
                            />
                          </div>
                          <label
                            className="track-attribute-toggle"
                          >
                            <span>Explicit content</span>
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={track.explicitContent}
                              onChange={(event) =>
                                updateTrack(index, {
                                  explicitContent: event.target.checked,
                                })
                              }
                            />
                            <span className="track-attribute-switch" aria-hidden="true" />
                          </label>
                          <label
                            className="track-attribute-toggle"
                          >
                            <span>Dolby Atmos</span>
                            <input
                              className="sr-only"
                              type="checkbox"
                              checked={track.dolbyAtmos}
                              onChange={(event) =>
                                updateTrack(index, {
                                  dolbyAtmos: event.target.checked,
                                })
                              }
                            />
                            <span className="track-attribute-switch" aria-hidden="true" />
                          </label>
                        </div>
                        <label
                          className="track-attribute-toggle cover-song-toggle"
                        >
                          <span>This is a cover song</span>
                          <input
                            className="sr-only"
                            type="checkbox"
                            checked={track.isCover}
                            onChange={(event) =>
                              updateTrack(index, {
                                isCover: event.target.checked,
                                originalArtist: event.target.checked
                                  ? track.originalArtist
                                  : "",
                                originalTrackLink: event.target.checked
                                  ? track.originalTrackLink
                                  : "",
                                coverLicenseFile: event.target.checked
                                  ? track.coverLicenseFile
                                  : null,
                                coverLicenseFileName: event.target.checked
                                  ? track.coverLicenseFileName
                                  : "",
                              })
                            }
                          />
                          <span className="track-attribute-switch" aria-hidden="true" />
                        </label>
                        {track.isCover ? (
                          <div className="grid gap-3 md:gap-4 md:grid-cols-2">
                            <div>
                              <label
                                className="mb-2 block text-xs md:text-sm font-medium"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Original artist name
                              </label>
                              <input
                                ref={registerField(
                                  `track-${index}-original-artist`,
                                )}
                                className={fieldClass(
                                  `track-${index}-original-artist`,
                                  Boolean(
                                    showErrors &&
                                      issue?.key ===
                                        `track-${index}-original-artist`,
                                  ),
                                )}
                                value={track.originalArtist}
                                onChange={(event) =>
                                  updateTrack(index, {
                                    originalArtist: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <label
                                className="mb-2 block text-xs md:text-sm font-medium"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Original track link
                              </label>
                              <input
                                ref={registerField(
                                  `track-${index}-original-link`,
                                )}
                                className={fieldClass(
                                  `track-${index}-original-link`,
                                  Boolean(
                                    showErrors &&
                                      issue?.key ===
                                        `track-${index}-original-link`,
                                  ),
                                )}
                                value={track.originalTrackLink}
                                onChange={(event) =>
                                  updateTrack(index, {
                                    originalTrackLink: event.target.value,
                                  })
                                }
                                placeholder="Spotify, YouTube, or store link"
                              />
                            </div>
                            <div
                              className="md:col-span-2"
                              ref={registerField(
                                `track-${index}-cover-license`,
                              )}
                            >
                              <UploadDropzone
                                accept="application/pdf"
                                splitLayout
                                title="License proof"
                                description="Upload the PDF rights or license document"
                                helperLines={[
                                  "PDF only",
                                  "Required for cover songs",
                                ]}
                                fileName={track.coverLicenseFileName}
                                error={
                                  showErrors &&
                                  issue?.key === `track-${index}-cover-license`
                                    ? issue.message
                                    : null
                                }
                                onSelect={async (file) => {
                                  handleCoverLicense(index, file);
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
                        {tracks.length > 1 ? <div className="flex flex-wrap gap-2"><button type="button" disabled={index === 0} className="btn-outline pressable inline-flex min-h-11 items-center gap-2 px-3 py-2 text-xs disabled:opacity-40" onClick={() => moveTrack(index, -1)}><ChevronUp className="h-4 w-4" /> Move up</button><button type="button" disabled={index === tracks.length - 1} className="btn-outline pressable inline-flex min-h-11 items-center gap-2 px-3 py-2 text-xs disabled:opacity-40" onClick={() => moveTrack(index, 1)}><ChevronDown className="h-4 w-4" /> Move down</button><button type="button" className="btn-outline pressable min-h-11 px-3 py-2 text-xs" onClick={() => removeTrack(index)}>Remove track</button></div> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {firstReleaseOffer ? <div className="group relative inline-flex max-w-max pb-7">
              <button
                type="button"
                aria-disabled="true"
                aria-describedby="free-release-track-lock"
                title="Locked for this FREE Single release"
                onClick={addTrack}
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold grayscale transition focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-soft)", boxShadow: "inset 0 1px 0 var(--glass-highlight)" }}
              >
                <span aria-hidden="true">🔒</span> Add another track
              </button>
              <span id="free-release-track-lock" role="tooltip" className="pointer-events-none absolute bottom-0 left-0 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" style={{ background: "var(--text)", color: "var(--bg)" }}>Locked for this FREE Single release</span>
            </div> : <button
                type="button"
                className="btn-outline pressable hover-lift max-w-max text-xs md:text-sm py-2 md:py-2.5 px-3 md:px-4"
                onClick={addTrack}
              >
                + Add another track
              </button>}
          </section>
        ) : null}
        {step === 2 ? (
          <section
            className={clsx(
              "grid gap-5 md:grid-cols-[1.1fr,0.9fr]",
              stepMotion,
            )}
          >
            {pendingPrefills.size > 0 ? <div ref={registerField("prefill-review")} className="release-prefill-review md:col-span-2">
              <div><p><span aria-hidden="true">⚡</span> {pendingPrefills.size} suggestion{pendingPrefills.size === 1 ? "" : "s"} ready for review</p><span>Based on your saved preferences and previous release. Nothing becomes final until you approve it.</span></div>
              <div className="release-prefill-items">{prefillSuggestions.filter((item) => pendingPrefills.has(item.field)).map((item) => <div key={item.field}><span><b>{({ language: "Title language", primaryGenre: "Genre", secondaryGenre: "Subgenre", recordLabelName: "Label", copyrightOwner: "C-Line / composition owner", publishingRights: "P-Line / master owner" } as const)[item.field]}</b><small>{item.value} · {item.source === "USER_DEFAULT" ? "Saved default" : "Previous release"}</small></span><span><button type="button" onClick={() => resolvePrefill(item.field, true)} aria-label={`Approve ${item.field}`}>Approve</button><button type="button" onClick={() => resolvePrefill(item.field, false)} aria-label={`Clear ${item.field}`}>Clear</button></span></div>)}</div>
              {[...pendingPrefills].some((field) => field !== "copyrightOwner" && field !== "publishingRights") ? <button type="button" onClick={approveSafePrefills} className="release-prefill-approve-all">Approve safe suggestions</button> : null}
            </div> : null}
            <div className="release-details-fields grid gap-5">
              {requiresReleaseTitle ? (
                <div>
                  <label
                    className="mb-2 block text-sm font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {releaseType === "ep" ? "EP Name" : "Album Name"}
                  </label>
                  <input
                    ref={registerField("release-title")}
                    className={fieldClass(
                      "release-title",
                      Boolean(
                        showErrors &&
                          releaseInfoIssue()?.key === "release-title",
                      ),
                    )}
                    value={release.releaseTitle}
                    onChange={(event) =>
                      setRelease((current) => ({
                        ...current,
                        releaseTitle: event.target.value,
                      }))
                    }
                    placeholder={
                      releaseType === "ep"
                        ? "Enter EP name"
                        : "Enter album name"
                    }
                  />
                </div>
              ) : (
                <div className="border-b pb-5" style={{ borderColor: "var(--border)" }}>
                  <p className="text-base font-semibold" style={{ color: "var(--text)" }}>Single release</p>
                </div>
              )}
              <div>
                <label
                  className="mb-2 flex items-center gap-2 text-sm font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Label
                  {!customLabelAllowed ? (
                    <span
                      className="group relative inline-flex"
                      title="Only available for Yearly+ Plan. Upgrade to use a custom label name."
                    >
                      <Crown className="h-4 w-4" style={{ color: "#facc15" }} />
                      <span
                        className="pointer-events-none absolute left-0 top-6 z-20 hidden w-64 rounded-xl border p-3 text-xs shadow-xl group-hover:block"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--bg-elevated)",
                          color: "var(--text-muted)",
                        }}
                      >
                        Only available for Yearly+ Plan. Upgrade to use a custom
                        label name.
                      </span>
                    </span>
                  ) : null}
                </label>
                <input
                  ref={registerField("record-label")}
                  disabled={!customLabelAllowed}
                  className={fieldClass(
                    "record-label",
                    Boolean(
                      showErrors && releaseInfoIssue()?.key === "record-label",
                    ),
                  )}
                  value={release.recordLabelName}
                  onChange={(event) =>
                    setRelease((current) => ({
                      ...current,
                      recordLabelName: event.target.value,
                    }))
                  }
                  placeholder="HYMN Music or your imprint"
                />
              </div>
              <div
                ref={
                  registerField("genre-picker") as (
                    node: HTMLDivElement | null,
                  ) => void
                }
                className={clsx(
                  showErrors && releaseInfoIssue()?.key === "genre-picker"
                    ? "field-shake"
                    : "",
                )}
              >
                <label
                  className="mb-2 block text-sm font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Genre + subgenre
                </label>
                <GenreSelector
                  genre={release.primaryGenre}
                  subgenre={release.secondaryGenre}
                  onChange={(genre, subgenre) =>
                    setRelease((current) => ({
                      ...current,
                      primaryGenre: genre,
                      secondaryGenre: subgenre,
                    }))
                  }
                  error={Boolean(
                    showErrors && releaseInfoIssue()?.key === "genre-picker",
                  )}
                />
              </div>
              <div
                ref={
                  registerField("mood") as (node: HTMLDivElement | null) => void
                }
              >
                <label
                  className="mb-2 block text-sm font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Mood
                </label>
                <MoodSelector
                  value={release.mood}
                  error={Boolean(
                    showErrors && releaseInfoIssue()?.key === "mood",
                  )}
                  onChange={(mood) =>
                    setRelease((current) => ({ ...current, mood }))
                  }
                />
              </div>
              <div
                ref={
                  registerField("language") as (
                    node: HTMLDivElement | null,
                  ) => void
                }
              >
                <SearchableSelect
                  label="Language"
                  value={release.language}
                  options={languageOptions}
                  placeholder="Select release language"
                  invalid={Boolean(
                    showErrors && releaseInfoIssue()?.key === "language",
                  )}
                  onChange={(value) =>
                    setRelease((current) => ({ ...current, language: value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-5">
              <div className="border-t pt-5" style={{ borderColor: "var(--border)" }}>
                <div className="mb-4"><h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>Release timing</h3></div>
                <div>
                <div className="release-timing-selector grid sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={release.releaseTiming === "quick_release"}
                    className="release-timing-option relative min-w-0 px-3 py-4 text-left"
                    onClick={() =>
                      setRelease((current) => ({
                        ...current,
                        releaseTiming: "quick_release",
                      }))
                    }
                  >
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>As soon as possible</p><span className="release-timing-indicator" aria-hidden="true">{release.releaseTiming === "quick_release" ? <Check className="h-3.5 w-3.5" /> : null}</span></div>
                    <p
                      className="mt-2 text-xs leading-5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Estimated store date<br /><strong style={{ color: "var(--text)" }}>{quickReleaseDate}</strong>
                    </p>
                  </button>
                  <button
                    type="button"
                    aria-pressed={release.releaseTiming === "schedule_release"}
                    className="release-timing-option relative min-w-0 px-3 py-4 text-left"
                    onClick={() =>
                      setRelease((current) => ({
                        ...current,
                        releaseTiming: "schedule_release",
                      }))
                    }
                  >
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Schedule a date</p><span className="release-timing-indicator" aria-hidden="true">{release.releaseTiming === "schedule_release" ? <Check className="h-3.5 w-3.5" /> : null}</span></div>
                    <p
                      className="mt-2 text-xs leading-5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Earliest available<br /><strong style={{ color: "var(--text)" }}>{minimumScheduledDate}</strong>
                    </p>
                  </button>
                </div>
                {release.releaseTiming === "schedule_release" ? (
                  <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
                    {scheduledDateWasMoved ? <div className="mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm leading-5" role="alert" style={{ borderColor: "var(--warning)", background: "var(--warning-soft)", color: "var(--text-muted)" }}><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--warning)" }} /><p>Your previous release date is now too close for delivery. We moved it to the earliest available date, <strong style={{ color: "var(--text)" }}>{minimumScheduledDate}</strong>. Choose a later date if that works better.</p></div> : null}
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Scheduled release date
                    </label>
                    <input
                      ref={registerField("release-date")}
                      className={fieldClass(
                        "release-date",
                        Boolean(
                          showErrors &&
                            releaseInfoIssue()?.key === "release-date",
                        ),
                      )}
                      type="date"
                      min={minimumScheduledDate}
                      value={release.scheduledReleaseDate}
                      onChange={(event) =>
                        setRelease((current) => ({
                          ...current,
                          scheduledReleaseDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
                <p className="mt-4 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                  Estimated HYMN review: {queue?.averageApprovalTime || "24-48 hours"}. Delivery begins after approval.
                </p>
                </div>
              </div>
            </div>
            <div className="release-save-defaults md:col-span-2">
              <div><p>Make the next release faster</p><span>Save artist, language, genre, label, and rights values as editable distribution defaults.</span></div>
              <span className="release-save-default-actions"><button type="button" onClick={saveCurrentReleaseDefaults} disabled={preferencesStatus === "saving"}>{preferencesStatus === "saving" ? "Saving…" : preferencesStatus === "saved" ? "Defaults saved ✓" : preferencesStatus === "error" ? "Try again" : "Use these for future releases"}</button><button type="button" onClick={clearReleaseDefaults} className="is-clear">Clear saved defaults</button></span>
            </div>
          </section>
        ) : null}
        {step === 4 ? (
          <section
            className={clsx(
              "grid items-start gap-5 lg:grid-cols-[minmax(300px,0.85fr),minmax(0,1.15fr)]",
              stepMotion,
            )}
          >
            <div
              ref={
                registerField("artwork-upload") as (
                  node: HTMLDivElement | null,
                ) => void
              }
            >
              <ArtworkSquareDropzone
                previewUrl={artworkPreview}
                fileName={artworkFile?.name}
                fileType={fileFormat(artworkFile)}
                dimensions={artworkDimensions}
                error={
                  showErrors && artworkIssue()
                    ? (artworkIssue()?.message ?? null)
                    : artworkError
                }
                onSelect={async (file) => {
                  await handleArtwork(file);
                }}
              />
              {artworkScanning ? (
                <div
                  className="mt-3 flex items-center gap-2 px-1 text-xs"
                  style={{
                    color: "var(--text-muted)",
                  }}
                >
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Scanning artwork for excessive text…
                </div>
              ) : null}
              {artworkWarning ? (
                <ArtworkWarning warning={artworkWarning} />
              ) : null}
              <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--border)" }}><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">Audio masters</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{tracks.filter((track) => Boolean(track.audioFile || track.existingAudioUrl || track.audioPreviewUrl)).length} of {tracks.length} uploaded</p></div><button type="button" className="pressable py-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }} onClick={() => goToStep(3)}>Review audio</button></div><div className="mt-4 grid gap-3">{tracks.map((track, index) => <div key={`${track.id}-asset-status`} className="flex items-center justify-between gap-3 text-xs"><span className="truncate">{index + 1}. {track.trackTitle || "Untitled track"}</span><span style={{ color: track.audioFile || track.existingAudioUrl || track.audioPreviewUrl ? "var(--success)" : "var(--danger)" }}>{track.audioFile || track.existingAudioUrl || track.audioPreviewUrl ? "Ready" : "Missing"}</span></div>)}</div></div>
            </div>
            <div
              className="artwork-requirements overflow-hidden"
              style={{
                borderColor: "var(--border)",
                background: "var(--card)",
                boxShadow: "0 18px 50px rgba(0,0,0,0.09)",
              }}
            >
              <div
                className="artwork-requirements-header flex items-start justify-between gap-4 border-b pb-5"
                style={{
                  borderColor: "var(--border)",
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--accent) 7%, var(--card)), var(--card))",
                }}
              >
                <div>
                  <h3
                    className="text-xl font-semibold"
                    style={{ color: "var(--text)" }}
                  >
                    Artwork requirements
                  </h3>
                </div>
                {artworkPreview && !artworkError ? (
                  <span
                    className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                    style={{
                      borderColor: "rgba(34,197,94,0.38)",
                      background: "rgba(34,197,94,0.1)",
                      color: "#22c55e",
                    }}
                  >
                    Ready
                  </span>
                ) : null}
              </div>
              <div className="artwork-requirements-body pt-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Resolution", "Minimum 3000 × 3000 px"],
                    ["File format", "JPG / JPEG only"],
                    ["Aspect ratio", "Perfect square · 1:1"],
                    ["Content", "Clear, original, and store-safe"],
                  ].map(([label, detail]) => (
                    <div
                      key={label}
                      className="artwork-requirement-item border-b py-4"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--bg-soft)",
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                          style={{
                            background:
                              artworkPreview && !artworkError
                                ? "rgba(34,197,94,0.12)"
                                : "var(--card)",
                            color:
                              artworkPreview && !artworkError
                                ? "#22c55e"
                                : "var(--text-soft)",
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                        <div>
                          <p
                            className="text-xs font-semibold"
                            style={{ color: "var(--text)" }}
                          >
                            {label}
                          </p>
                          <p
                            className="mt-1 text-[11px] leading-5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  className={clsx("artwork-validation mt-5 border-t pt-5", !(artworkPreview && !artworkError) && "is-pending")}
                  style={{
                    borderColor:
                      artworkPreview && !artworkError
                        ? "rgba(34,197,94,0.35)"
                        : "color-mix(in srgb, var(--money) 40%, var(--border))",
                    background:
                      artworkPreview && !artworkError
                        ? "rgba(34,197,94,0.08)"
                        : "color-mix(in srgb, var(--money) 8%, var(--card))",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p
                        className="text-xs font-semibold"
                        style={{ color: "var(--text)" }}
                      >
                        {artworkPreview && !artworkError
                          ? "Artwork validation passed"
                          : "Upload artwork to validate"}
                      </p>
                      <p
                        className="mt-1 text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {artworkPreview && !artworkError
                          ? [artworkDimensions, fileFormat(artworkFile)]
                              .filter(Boolean)
                              .join(" · ") || "Existing artwork is ready"
                          : "We’ll check dimensions, format, aspect ratio, and excessive text."}
                      </p>
                    </div>
                    {artworkPreview && !artworkError ? (
                      <CheckCircle2
                        className="h-5 w-5 shrink-0"
                        style={{ color: "#22c55e" }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}
        {step === 5 ? (
          <section className={clsx("grid gap-6", stepMotion)}>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
              <div className="grid gap-6">
                <div
                  ref={
                    registerField("store-selection") as (
                      node: HTMLDivElement | null,
                    ) => void
                  }
                  className={clsx(
                    "rounded-[1.5rem] border p-5",
                    showErrors && destinationsIssue()?.key === "store-selection"
                      ? "field-shake"
                      : "",
                  )}
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg-soft)",
                  }}
                >
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "var(--text-soft)" }}
                      >
                        Selected Stores
                      </p>
                      <h3
                        className="mt-1 text-xl font-semibold tracking-[-.025em]"
                        style={{ color: "var(--text)" }}
                      >
                        {storeSelections.length} Selected
                      </h3>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {storePlatforms.map((platform) => {
                      const active = platforms.includes(platform.name);
                      return (
                        <button
                          key={platform.name}
                          type="button"
                          className={clsx(
                            "store-platform-option pressable group flex min-h-[64px] w-full items-center gap-3 border px-1 py-3 text-left transition duration-200",
                            !active && "opacity-65",
                          )}
                          style={
                            active
                              ? {
                                  borderColor: "var(--accent)",
                                  background:
                                    "linear-gradient(180deg, rgba(89,223,224,0.12), rgba(89,223,224,0.035))",
                                  color: "var(--text)",
                                  boxShadow:
                                    "0 18px 48px rgba(89,223,224,0.08)",
                                }
                              : {
                                  borderColor: "var(--border)",
                                  background: "transparent",
                                  color: "var(--text-muted)",
                                }
                          }
                          onClick={() => togglePlatform(platform.name, "store")}
                          aria-pressed={active}
                        >
                          <span className="flex h-9 w-24 shrink-0 items-center justify-center">
                            <PlatformLogo
                              platform={platform.name}
                              className="max-h-7 w-auto max-w-[92px]"
                            />
                          </span>
                          <span className="sr-only">{platform.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  ref={
                    registerField("social-confirmation") as (
                      node: HTMLDivElement | null,
                    ) => void
                  }
                  className={clsx(
                    "rounded-[1.5rem] border p-5",
                    showErrors &&
                      destinationsIssue()?.key === "social-confirmation"
                      ? "field-shake"
                      : "",
                  )}
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg-soft)",
                  }}
                >
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: "var(--text-soft)" }}
                      >
                        Social Monetization
                      </p>
                      <h3
                        className="mt-1 text-xl font-semibold tracking-[-.025em]"
                        style={{ color: "var(--text)" }}
                      >
                        UGC platforms
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="group inline-flex min-h-10 items-center gap-3 border-0 bg-transparent px-0 py-2 text-left text-xs font-semibold transition"
                      style={{ color: socialConsentAccepted ? "var(--text)" : "var(--text-muted)" }}
                      onClick={() => {
                        if (socialConsentAccepted) {
                          setSocialConsentAccepted(false);
                          setPlatforms((current) =>
                            current.filter(
                              (item) =>
                                !socialPlatforms.some(
                                  (platform) => platform.name === item,
                                ),
                            ),
                          );
                          setYoutubeContentIdEnabled(false);
                          setYoutubeContentIdChannelUrl("");
                          setYoutubeContentIdModalOpen(false);
                          setMonetisationClauses(
                            createMonetisationClauseState(),
                          );
                        } else {
                          setMonetisationModalOpen(true);
                        }
                      }}
                      aria-pressed={socialConsentAccepted}
                    >
                      <span>Monetisation</span>
                      <span
                        className="relative inline-flex h-5 w-9 items-center rounded-full border transition duration-200 group-hover:border-[var(--text-soft)]"
                        style={
                          socialConsentAccepted
                            ? {
                                borderColor: "#16a34a",
                                background: "#22c55e",
                                boxShadow: "0 0 0 1px rgba(34,197,94,0.08)",
                              }
                            : {
                                borderColor: "var(--border)",
                                background: "var(--bg-soft)",
                              }
                        }
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 rounded-full shadow-sm transition-transform duration-200"
                          style={{
                            background: socialConsentAccepted
                              ? "#ffffff"
                              : "var(--text-muted)",
                            transform: socialConsentAccepted
                              ? "translateX(17px)"
                              : "translateX(3px)",
                          }}
                        />
                      </span>
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {socialPlatforms.map((platform) => {
                      const active = platforms.includes(platform.name);
                      const locked = !socialConsentAccepted;
                      const iconClass = platform.name === "Instagram / Facebook"
                        ? "h-8 w-auto max-w-[96px]"
                        : "max-h-9 w-auto max-w-[96px]";

                      return (
                        <button
                          key={platform.name}
                          type="button"
                          disabled={locked}
                          className={clsx(
                            "ugc-platform-option pressable group relative flex min-h-[64px] w-full items-center justify-center border px-1 py-3 transition duration-200",
                            locked
                              ? "cursor-not-allowed opacity-50 grayscale"
                              : "",
                          )}
                          style={
                            active && !locked
                              ? {
                                  borderColor: "var(--accent)",
                                  background: "rgba(89,223,224,0.12)",
                                  boxShadow: "0 0 30px rgba(89,223,224,0.16)",
                                }
                              : {
                                  borderColor: "var(--border)",
                                  background: "var(--card)",
                                }
                          }
                          onClick={() =>
                            togglePlatform(platform.name, "social")
                          }
                          aria-label={`${locked ? "Locked" : active ? "Remove" : "Select"} ${platform.name}`}
                          aria-pressed={active}
                        >
                          <span className="sr-only">{platform.name}</span>
                          <span className="flex h-9 w-24 shrink-0 items-center justify-center">
                            <PlatformLogo
                              platform={platform.name}
                              className={iconClass}
                            />
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {platforms.includes("YouTube Music") ? (
                  <div className="ugc-content-id-reveal mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
                    <span style={{ color: "var(--text-muted)" }}>
                      {youtubeContentIdEnabled
                        ? "YouTube Content ID is enabled."
                        : "Don’t have YouTube Content ID?"}
                    </span>
                    <button
                      type="button"
                      disabled={!socialConsentAccepted}
                      className="font-semibold text-[var(--accent)] underline-offset-4 transition hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => openYoutubeContentIdModal()}
                    >
                      {youtubeContentIdEnabled ? "Review" : "Claim it"}
                    </button>
                    {youtubeContentIdEnabled && selectedPlan === "one_time" ? (
                      <span className="w-full text-xs" style={{ color: "var(--text-soft)" }}>
                        ₹200 is added to this one-time release.
                      </span>
                    ) : null}
                  </div>
                  ) : null}
                </div>

                <div>
                  <div
                    ref={
                      registerField("country-selector") as (
                        node: HTMLDivElement | null,
                      ) => void
                    }
                    className="rounded-[1.5rem] border p-5"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--bg-soft)",
                    }}
                  >
                    <label
                      className="mb-2 block text-sm font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Restricted Countries
                    </label>
                    <CountrySelector
                      selected={release.selectedCountries}
                      onChange={(countries) =>
                        setRelease((current) => ({
                          ...current,
                          selectedCountries: countries,
                        }))
                      }
                      showError={Boolean(
                        showErrors &&
                          destinationsIssue()?.key === "country-selector",
                      )}
                      registerField={
                        registerField("country-selector-button") as (
                          node: HTMLButtonElement | null,
                        ) => void
                      }
                      shaking={
                        shakingField === "country-selector" ||
                        shakingField === "country-selector-button"
                      }
                    />
                  </div>
                </div>

                <div
                  className="overflow-hidden rounded-[1.6rem] border shadow-lg"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--card)",
                    boxShadow: "0 18px 50px rgba(0,0,0,0.09)",
                  }}
                >
                  <div
                    className="flex items-start gap-3 border-b p-5"
                    style={{
                      borderColor: "var(--border)",
                      background:
                        "linear-gradient(135deg, color-mix(in srgb, var(--accent) 7%, var(--card)), var(--card))",
                    }}
                  >
                    <span
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--bg-soft)",
                        color: "var(--accent)",
                      }}
                    >
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                        style={{ color: "var(--text-soft)" }}
                      >
                        Master rights
                      </p>
                      <h3
                        className="mt-1 text-lg font-semibold"
                        style={{ color: "var(--text)" }}
                      >
                        Copyright owner
                      </h3>
                      <p
                        className="mt-1 text-sm leading-6"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Enter the person or organization that legally owns this
                        master recording.
                      </p>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                        style={{ color: "var(--text-soft)" }}
                      >
                        Quick select
                      </p>
                      {savedCopyrightOwners.length ? (
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--text-soft)" }}
                        >
                          Saved preferences
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        "Independent Artist",
                        "HYMN Music India",
                        release.recordLabelName,
                      ]
                        .filter(
                          (value, index, values): value is string =>
                            Boolean(value) && values.indexOf(value) === index,
                        )
                        .map((owner) => (
                          <button
                            key={owner}
                            type="button"
                            onClick={() =>
                              setRelease((current) => ({
                                ...current,
                                copyrightOwner: owner,
                              }))
                            }
                            className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5"
                            style={
                              release.copyrightOwner === owner
                                ? {
                                    borderColor: "var(--accent)",
                                    background: "var(--accent-soft)",
                                    color: "var(--text)",
                                  }
                                : {
                                    borderColor: "var(--border)",
                                    background: "var(--bg-soft)",
                                    color: "var(--text-muted)",
                                  }
                            }
                          >
                            {owner}
                          </button>
                        ))}
                      {savedCopyrightOwners.map((owner) => (
                        <span
                          key={`saved-${owner}`}
                          className="inline-flex overflow-hidden rounded-full border"
                          style={{
                            borderColor:
                              release.copyrightOwner === owner
                                ? "var(--accent)"
                                : "var(--border)",
                            background:
                              release.copyrightOwner === owner
                                ? "var(--accent-soft)"
                                : "var(--bg-soft)",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setRelease((current) => ({
                                ...current,
                                copyrightOwner: owner,
                              }))
                            }
                            className="px-3 py-1.5 text-xs font-semibold"
                            style={{ color: "var(--text)" }}
                          >
                            {owner}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              removeCopyrightOwnerPreference(owner)
                            }
                            aria-label={`Remove saved owner ${owner}`}
                            className="border-l px-2 transition hover:bg-red-500/10"
                            style={{
                              borderColor: "var(--border)",
                              color: "var(--text-soft)",
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <label className="mt-4 block">
                      <span
                        className="mb-2 block text-sm font-medium"
                        style={{ color: "var(--text-muted)" }}
                      >
                        C-Line
                      </span>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          ref={registerField("copyright-owner")}
                          className={fieldClass(
                            "copyright-owner",
                            Boolean(
                              showErrors &&
                                destinationsIssue()?.key === "copyright-owner",
                            ),
                          )}
                          value={release.copyrightOwner}
                          onChange={(event) =>
                            setRelease((current) => ({
                              ...current,
                              copyrightOwner: event.target.value,
                            }))
                          }
                          placeholder="Enter the copyright line exactly as it should be delivered"
                        />
                        <button
                          type="button"
                          disabled={
                            !release.copyrightOwner.trim() ||
                            savedCopyrightOwners.some(
                              (owner) =>
                                owner.toLowerCase() ===
                                release.copyrightOwner.trim().toLowerCase(),
                            )
                          }
                          onClick={saveCopyrightOwnerPreference}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
                          style={{
                            borderColor: "var(--border)",
                            background: "var(--bg-soft)",
                            color: "var(--text)",
                          }}
                        >
                          <BookmarkPlus className="h-4 w-4" />
                          Save choice
                        </button>
                      </div>
                    </label>
                    <label className="mt-4 block">
                      <span className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>P-Line</span>
                      <input
                        className="field"
                        value={release.publishingRights}
                        onChange={(event) => setRelease((current) => ({ ...current, publishingRights: event.target.value }))}
                        placeholder="Enter the phonographic rights line exactly as it should be delivered"
                      />
                    </label>
                    <p
                      className="mt-2 text-xs leading-5"
                      style={{ color: "var(--text-soft)" }}
                    >
                      Use the exact legal or label name that should appear in
                      the master ownership line.
                    </p>
                  </div>
                </div>
              </div>

              <aside className="grid gap-5 self-start xl:sticky xl:top-24">
                <div
                  className="overflow-hidden rounded-[1.6rem] border shadow-xl"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--card)",
                    boxShadow: "0 22px 60px rgba(0,0,0,0.12)",
                  }}
                >
                  <div
                    className="flex gap-4 border-b p-5"
                    style={{
                      borderColor: "var(--border)",
                      background:
                        "linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, var(--card)), var(--card))",
                    }}
                  >
                    <div
                      className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.15rem] border shadow-sm"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--bg-soft)",
                      }}
                    >
                      {artworkPreview ? (
                        <img
                          src={artworkPreview}
                          alt="Cover art thumbnail"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Disc3
                            className="h-7 w-7"
                            style={{ color: "var(--text-soft)" }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 self-center">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                          style={{ color: "var(--text-soft)" }}
                        >
                          Release summary
                        </p>
                        <span
                          className="rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em]"
                          style={{
                            borderColor: "var(--border)",
                            background: "var(--bg-soft)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {releaseType === "single"
                            ? "Single"
                            : releaseType === "ep"
                              ? "EP"
                              : "Album"}
                        </span>
                      </div>
                      <h3
                        className="mt-2 truncate text-xl font-semibold leading-tight"
                        style={{ color: "var(--text)" }}
                      >
                        {displayedReleaseTitle}
                      </h3>
                      <p
                        className="mt-1.5 truncate text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {namesFor(tracks[0]?.primaryArtistIds ?? []) ||
                          tracks[0]?.primaryArtistQuery ||
                          "Artist pending"}
                      </p>
                    </div>
                  </div>
                  <div
                    className="grid grid-cols-2 gap-px border-b"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--border)",
                    }}
                  >
                    {[
                      ["Release date", selectedReleaseDate || "Pending"],
                      ["Stores", `${storeSelections.length} selected`],
                      [
                        "Monetization",
                        socialConsentAccepted ? "Enabled" : "Off",
                      ],
                      ["Plan", currentPlan.title],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="min-w-0 p-4"
                        style={{ background: "var(--card)" }}
                      >
                        <span
                          className="block text-[10px] font-semibold uppercase tracking-[0.14em]"
                          style={{ color: "var(--text-soft)" }}
                        >
                          {label}
                        </span>
                        <span
                          className="mt-1.5 block truncate text-sm font-semibold"
                          style={{ color: "var(--text)" }}
                        >
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p
                          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: "var(--text-soft)" }}
                        >
                          Release score
                        </p>
                        <p
                          className="mt-1 text-2xl font-semibold"
                          style={{ color: "var(--text)" }}
                        >
                          {readinessScore}
                          <span
                            className="text-sm font-medium"
                            style={{ color: "var(--text-soft)" }}
                          >
                            /100
                          </span>
                        </p>
                      </div>
                      <span
                        className="rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                        style={
                          readinessScore >= 90
                            ? {
                                borderColor: "rgba(34,197,94,0.4)",
                                background: "rgba(34,197,94,0.1)",
                                color: "#86efac",
                              }
                            : {
                                borderColor: "rgba(250,204,21,0.4)",
                                background: "rgba(250,204,21,0.1)",
                                color: "#d9a800",
                              }
                        }
                      >
                        {readinessScore >= 90 ? "Ready" : "Needs review"}
                      </span>
                    </div>
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full"
                      style={{ background: "var(--bg-soft)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${readinessScore}%`,
                          background:
                            readinessScore >= 90 ? "#22c55e" : "var(--money)",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-[1.5rem] border p-5"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg-soft)",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3
                        className="text-xl font-semibold"
                        style={{ color: "var(--text)" }}
                      >
                        {readinessScore}% Ready
                      </h3>
                    </div>
                    <ShieldCheck
                      className="h-6 w-6"
                      style={{ color: "var(--accent)" }}
                    />
                  </div>
                  <div
                    className="mt-4 h-2 overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${readinessScore}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                  <div className="mt-4 grid gap-2">
                    {readinessItems.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border"
                          style={
                            item.complete
                              ? {
                                  borderColor: "rgba(34,197,94,0.45)",
                                  background: "rgba(34,197,94,0.14)",
                                  color: "#86efac",
                                }
                              : {
                                  borderColor: "rgba(250,204,21,0.35)",
                                  background: "rgba(250,204,21,0.08)",
                                  color: "#fde68a",
                                }
                          }
                        >
                          {item.complete ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            "!"
                          )}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {item.complete
                            ? item.shortLabel
                            : `${item.shortLabel} Pending`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  ref={
                    registerField("legal-checks") as (
                      node: HTMLDivElement | null,
                    ) => void
                  }
                  className={clsx(
                    "rounded-[1.5rem] border p-4",
                    showErrors && destinationsIssue()?.key === "legal-checks"
                      ? "field-shake"
                      : "",
                  )}
                  style={{
                    borderColor: legalComplete
                      ? "rgba(34,197,94,0.32)"
                      : "rgba(250,204,21,0.32)",
                    background: "var(--bg-soft)",
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold" style={{ color: "var(--text)" }}>Legal Declaration</p>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: legalComplete ? "var(--success)" : "var(--text-soft)" }}>{legalComplete ? "Agreed" : "Required"}</span>
                    </div>
                    <div className="mt-5 grid gap-3 border-t pt-5 text-sm leading-6" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                      <p>✓ I confirm that I own or control all rights required to distribute this content.</p>
                      <p>✓ I confirm that all collaborators, contributors and rights holders have authorized this release.</p>
                      <p>✓ I understand that false ownership claims, copyright infringement or fraudulent submissions may result in removal of my release and suspension of my HYMN account.</p>
                      <p>✓ I understand that this release will be distributed through HYMN&apos;s distribution network, which retains 30% of Net Royalty Revenue. The remaining eligible earnings will be reflected in my HYMN dashboard where reporting, royalty tracking, splits and payouts are managed.</p>
                    </div>
                    <p className="mt-5 border-t pt-5 text-sm leading-6" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>By submitting this release, you acknowledge that distribution is fulfilled through HYMN&apos;s distribution network, which retains 30% of Net Royalty Revenue in accordance with the applicable distribution agreement. The remaining 70% of eligible Net Royalty Revenue is reflected within your HYMN earnings dashboard, where HYMN manages reporting, royalty tracking, splits, and payout processing according to your account settings and any configured royalty splits.</p>
                    <p className="mt-5 border-t pt-5 text-sm font-semibold" style={{ borderColor: "var(--border)", color: legalComplete ? "var(--success)" : "var(--danger)" }}>{legalComplete ? "Legal Declaration accepted." : "Return to Delivery and accept the Legal Declaration before submitting."}</p>
                  </div>
                </div>

                <div
                  className="overflow-hidden rounded-[1.6rem] border shadow-xl"
                  style={{
                    borderColor: "rgba(34,197,94,0.3)",
                    background: "var(--card)",
                    boxShadow: "0 22px 60px rgba(0,0,0,0.11)",
                  }}
                >
                  <div
                    className="border-b p-5"
                    style={{
                      borderColor: "var(--border)",
                      background:
                        "linear-gradient(135deg, rgba(34,197,94,0.13), color-mix(in srgb, var(--card) 94%, transparent))",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                        style={{ color: "#22c55e" }}
                      >
                        Selected plan
                      </p>
                      <span
                        className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: "#22c55e" }}
                      >
                        Active
                      </span>
                    </div>
                    <h3
                      className="mt-2 text-xl font-semibold"
                      style={{ color: "var(--text)" }}
                    >
                      HYMN Distribution Review
                    </h3>
                    <p
                      className="mt-1 text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {tracks.length} track{tracks.length === 1 ? "" : "s"} ·{" "}
                      {currentPlan.title}
                    </p>
                  </div>
                  {!subscriptionCovered ? <div
                    className="grid grid-cols-2 gap-px border-b"
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--border)",
                    }}
                  >
                    <div className="p-4" style={{ background: "var(--card)" }}>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: "var(--text-soft)" }}
                      >
                        Release fee
                      </p>
                      <p
                        className="mt-1.5 text-lg font-semibold"
                        style={{ color: "var(--text)" }}
                      >
                        {firstReleaseOffer && finalDistributionAmount === 0 ? "FREE" : <>₹ {finalDistributionAmount.toLocaleString("en-IN")}</>}
                      </p>
                    </div>
                    <div className="p-4" style={{ background: "var(--card)" }}>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: "var(--text-soft)" }}
                      >
                        You save
                      </p>
                      <p
                        className="mt-1.5 text-lg font-semibold"
                        style={{
                          color:
                            trackPricingQuote.discountAmount > 0
                              ? "#22c55e"
                              : "var(--text)",
                        }}
                      >
                        &#8377;{" "}
                        {selectedPlan === "one_time"
                          ? (trackPricingQuote.discountAmount + firstReleaseDiscount).toLocaleString(
                              "en-IN",
                            )
                          : "0"}
                      </p>
                    </div>
                  </div> : null}
                  <div className="p-5">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: "var(--text-soft)" }}
                    >
                      Included review
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      {[
                        "Metadata QC",
                        "Artwork QC",
                        "Copyright Check",
                        "Distributor Submission",
                        "Release Monitoring",
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-2">
                          <CheckCircle2
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: "#22c55e" }}
                          />
                          <span style={{ color: "var(--text-muted)" }}>
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                    {selectedPlan === "one_time" && !firstReleaseOffer ? (
                      <div
                        className="mt-5 border-t pt-5"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <div>
                          <p
                            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                            style={{ color: "var(--text-soft)" }}
                          >
                            Bulk discount journey
                          </p>
                          <p
                            className="mt-1 text-xs leading-5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {tracks.length} of 16 tracks toward the maximum
                            discount
                            {trackPricingQuote.discountRate > 0
                              ? ` · ${Math.round(trackPricingQuote.discountRate * 100)}% currently applied`
                              : ""}
                            .
                          </p>
                        </div>
                        <div className="relative mt-5 px-2">
                          <div
                            className="absolute left-5 right-5 top-3 h-1 rounded-full"
                            style={{ background: "var(--bg-soft)" }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, (tracks.length / 16) * 100)}%`,
                                background:
                                  "linear-gradient(90deg, var(--money), #22c55e)",
                              }}
                            />
                          </div>
                          <div className="relative grid grid-cols-3 gap-2">
                            {[
                              [6, 8],
                              [12, 10],
                              [16, 15],
                            ].map(([threshold, discount]) => {
                              const unlocked = tracks.length >= threshold;
                              const next =
                                !unlocked &&
                                trackPricingQuote.nextThreshold === threshold;
                              return (
                                <div key={threshold} className="text-center">
                                  <span
                                    className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-semibold shadow-sm"
                                    style={{
                                      borderColor: unlocked
                                        ? "#22c55e"
                                        : next
                                          ? "var(--money)"
                                          : "var(--border)",
                                      background: unlocked
                                        ? "#22c55e"
                                        : "var(--card)",
                                      color: unlocked
                                        ? "white"
                                        : next
                                          ? "var(--money)"
                                          : "var(--text-soft)",
                                    }}
                                  >
                                    {unlocked ? (
                                      <Check className="h-4 w-4" />
                                    ) : (
                                      threshold
                                    )}
                                  </span>
                                  <p
                                    className="mt-2 text-xs font-semibold"
                                    style={{
                                      color: unlocked
                                        ? "#22c55e"
                                        : "var(--text)",
                                    }}
                                  >
                                    {discount}% off
                                  </p>
                                  <p
                                    className="mt-0.5 text-[10px]"
                                    style={{ color: "var(--text-soft)" }}
                                  >
                                    Save ₹
                                    {Math.round(
                                      (threshold * 99 * discount) / 100,
                                    ).toLocaleString("en-IN")}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {trackPricingQuote.nextThreshold ? (
                          <div
                            className="mt-5 rounded-xl border p-3"
                            style={{
                              borderColor:
                                "color-mix(in srgb, var(--money) 48%, var(--border))",
                              background:
                                "color-mix(in srgb, var(--money) 9%, var(--card))",
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p
                                  className="text-xs font-semibold"
                                  style={{ color: "var(--text)" }}
                                >
                                  Unlock{" "}
                                  {Math.round(
                                    (trackPricingQuote.nextThresholdDiscount ??
                                      0) * 100,
                                  )}
                                  % off
                                </p>
                                <p
                                  className="mt-1 text-[11px]"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  Add{" "}
                                  {trackPricingQuote.nextThreshold -
                                    tracks.length}{" "}
                                  more track
                                  {trackPricingQuote.nextThreshold -
                                    tracks.length ===
                                  1
                                    ? ""
                                    : "s"}{" "}
                                  and save ₹
                                  {(
                                    trackPricingQuote.nextThresholdSavings ?? 0
                                  ).toLocaleString("en-IN")}{" "}
                                  at that tier.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => goToStep(3)}
                                className="shrink-0 rounded-full border px-3 py-2 text-[11px] font-semibold transition hover:-translate-y-0.5"
                                style={{
                                  borderColor: "var(--money)",
                                  background: "var(--money)",
                                  color: "var(--money-foreground)",
                                }}
                              >
                                Add tracks
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="mt-5 rounded-xl border p-3 text-center"
                            style={{
                              borderColor: "rgba(34,197,94,0.35)",
                              background: "rgba(34,197,94,0.08)",
                              color: "#22c55e",
                            }}
                          >
                            <p className="text-xs font-semibold">
                              Maximum 15% bulk discount unlocked
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p
                        className="mt-5 border-t pt-4 text-xs leading-5"
                        style={{
                          borderColor: "var(--border)",
                          color: "var(--text-soft)",
                        }}
                      >
                        Subscription pricing is fixed for the selected plan.
                        Switch plans using the pricing cards above the form.
                      </p>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </section>
        ) : null}
        {step === 7 ? (
          <section className={clsx("grid gap-5", stepMotion)}>
            <StepIntro
              title="Review your release"
            />

            <div
              className="release-review overflow-hidden rounded-[1.75rem] border"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg-soft)",
                boxShadow: "0 24px 70px rgba(0,0,0,0.18)",
              }}
            >
              <div
                className="review-hero grid gap-5 border-b py-6 md:grid-cols-[160px,1fr] md:py-8"
                style={{
                  borderColor: "var(--border)",
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--card)), var(--card))",
                }}
              >
                <div
                  className="aspect-square overflow-hidden rounded-2xl border"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--card)",
                  }}
                >
                  {artworkPreview ? (
                    <img
                      src={artworkPreview}
                      alt={`${displayedReleaseTitle} artwork`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                      <Disc3
                        className="h-8 w-8"
                        style={{ color: "var(--text-soft)" }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-col justify-center">
                  <div className="flex flex-wrap gap-2">
                    {[
                      `${tracks.length} Track${tracks.length === 1 ? "" : "s"}`,
                      releaseType === "single"
                        ? "Single"
                        : releaseType === "ep"
                          ? "EP"
                          : "Album",
                      tracks.some((track) => track.explicitContent)
                        ? "Explicit"
                        : "Clean",
                      ...(validationIssues.length === 0 ? ["Ready to submit"] : []),
                    ].map((pill) => (
                      <span
                        key={pill}
                        className="review-pill text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--bg-soft)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {pill}
                      </span>
                    ))}
                  </div>
                  <h3
                    className="mt-4 truncate text-2xl font-semibold md:text-4xl"
                    style={{ color: "var(--text)" }}
                  >
                    {displayedReleaseTitle}
                  </h3>
                  <p
                    className="mt-2 text-base"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {primaryArtistName || "Primary artist missing"}
                  </p>
                  <p
                    className="mt-3 text-sm"
                    style={{ color: "var(--text-soft)" }}
                  >
                    Release date: {selectedReleaseDate || "—"}
                  </p>
                </div>
              </div>

              <div
                className="grid divide-y lg:grid-cols-[1.05fr,0.95fr] lg:divide-x lg:divide-y-0"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="grid gap-0 lg:[&>*+*]:border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <section className="p-5 md:p-7">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">Media & tracks</h3>
                        <p
                          className="mt-1 text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {artworkPreview ? "Artwork ready" : "Artwork missing"}{" "}
                          ·{" "}
                          {tracks.every((track) =>
                            Boolean(track.audioPreviewUrl),
                          )
                            ? "Audio ready"
                            : "Audio missing"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <button type="button" className="text-sm font-semibold" style={{ color: "var(--text-muted)" }} onClick={() => goToStep(4)}>Artwork</button>
                        <button type="button" className="text-sm font-semibold" style={{ color: "var(--accent)" }} onClick={() => goToStep(3)}>Tracks</button>
                      </div>
                    </div>
                    <div className="review-track-groups mt-5">
                      {tracks.map((track) => (
                        <div key={`${track.id}-review-track`} className="review-track-group py-5 first:pt-0 last:pb-0">
                          <AudioWaveform
                          src={track.audioPreviewUrl}
                          title={track.trackTitle || "Untitled track"}
                          subtitle={
                            [
                              track.audioFileName || "Final master",
                              track.duration,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Audio preview unavailable"
                          }
                          compact
                        />
                          <div className="mt-2 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
                            {[
                              ["Artist", namesFor(track.primaryArtistIds) || track.primaryArtistQuery || "Add an artist"],
                              ["Genre", release.primaryGenre || "—"],
                              ["Language", track.titleLanguage || release.language || "—"],
                            ].map(([label, value]) => (
                              <div key={label} className="review-detail-row flex justify-between gap-3">
                                <span className="review-label" style={{ color: "var(--text-muted)" }}>{label}</span>
                                <span className="review-value truncate text-right">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {artworkWarning ? (
                      <ArtworkWarning warning={artworkWarning} />
                    ) : null}
                    <div
                      className="hidden"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {tracks.map((track) => (
                        <div
                          key={`${track.id}-summary`}
                          className="py-4 first:pt-0 last:pb-0"
                        >
                          <div className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">
                            {[
                              [
                                "Artist",
                                namesFor(track.primaryArtistIds) ||
                                  track.primaryArtistQuery ||
                                  "Add an artist",
                              ],
                              ["Genre", release.primaryGenre || "—"],
                              [
                                "Language",
                                track.titleLanguage || release.language || "—",
                              ],
                            ].map(([label, value]) => (
                              <div
                                key={label}
                                className="review-detail-row flex justify-between gap-3"
                              >
                                <span className="review-label" style={{ color: "var(--text-muted)" }}>
                                  {label}
                                </span>
                                <span className="review-value truncate text-right">
                                  {value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section
                    className="border-t p-5 md:p-7"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">Release details</h3>
                      <button
                        type="button"
                        className="text-sm font-semibold"
                        style={{ color: "var(--accent)" }}
                        onClick={() => goToStep(2)}
                      >
                        Edit
                      </button>
                    </div>
                    <div className="release-details-review-grid mt-4 grid text-sm">
                      {[
                        ["Release title", displayedReleaseTitle],
                        [
                          "Version",
                          tracks[0]?.versionPreset === "Other"
                            ? tracks[0]?.customVersion
                            : tracks[0]?.versionPreset,
                        ],
                        [
                          "Release type",
                          releaseType === "single"
                            ? "Single"
                            : releaseType === "ep"
                              ? "EP"
                              : "Album",
                        ],
                        ["Genre", release.primaryGenre],
                        ["Subgenre", release.secondaryGenre],
                        ["Mood", release.mood],
                        ["Language", release.language],
                        ["Release date", selectedReleaseDate],
                        ["Label", release.recordLabelName],
                        ["Copyright", release.copyrightOwner],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="review-detail-row flex items-start justify-between gap-4"
                          style={{
                            borderColor:
                              "color-mix(in srgb, var(--border) 65%, transparent)",
                          }}
                        >
                          <span className="review-label" style={{ color: "var(--text-muted)" }}>
                            {label}
                          </span>
                          <span className="review-value max-w-[60%] text-right">
                            {value || "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <div
                  className="grid content-start divide-y"
                  style={{ borderColor: "var(--border)" }}
                >
                  <section className="p-5 md:p-7">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">Artist details</h3>
                      <button
                        type="button"
                        className="text-sm font-semibold"
                        style={{ color: "var(--accent)" }}
                        onClick={() => goToStep(3)}
                      >
                        Edit
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm">
                      {[
                        ["Primary artist", primaryArtistName || "Add your artist"],
                        [
                          "Featured artists",
                          tracks
                            .map((track) => track.featuredArtists)
                            .filter(Boolean)
                            .join(", ") || "—",
                        ],
                        [
                          "Artist profile",
                          tracks.every(
                            (track) => track.primaryArtistIds.length > 0,
                          )
                            ? "Profile connected"
                            : "Connect a profile",
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="review-detail-row flex items-center justify-between gap-4"
                        >
                          <span className="review-label" style={{ color: "var(--text-muted)" }}>
                            {label}
                          </span>
                          <span className="review-value">{value}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="p-5 md:p-7">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">
                        Distribution details
                      </h3>
                      <button
                        type="button"
                        className="text-sm font-semibold"
                        style={{ color: "var(--accent)" }}
                        onClick={() => goToStep(6)}
                      >
                        Edit
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm">
                      {[
                        [
                          "Platforms",
                          `${storeSelections.length} platform${storeSelections.length === 1 ? "" : "s"} selected`,
                        ],
                        [
                          "Territories",
                          release.territory === "Selected countries"
                            ? `${release.selectedCountries.length} countries selected`
                            : "Worldwide",
                        ],
                        [
                          "Monetisation",
                          socialConsentAccepted ? "Enabled" : "Off",
                        ],
                        [
                          "YouTube Content ID",
                          youtubeContentIdEnabled ? "Enabled" : "Off",
                        ],
                        [
                          "Release timing",
                          release.releaseTiming === "schedule_release"
                            ? "Scheduled"
                            : "Quick release",
                        ],
                        ["Plan", currentPlan.title],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="review-detail-row flex items-center justify-between gap-4"
                        >
                          <span className="review-label" style={{ color: "var(--text-muted)" }}>
                            {label}
                          </span>
                          <span className="review-value text-right">{value}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {!subscriptionCovered ? <section className="payment-summary p-5 md:p-7">
                    <div className="flex items-end justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--border)" }}>
                      <h3 className="text-lg font-semibold">Payment summary</h3>
                      <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Invoice</span>
                    </div>
                    <div className="payment-lines text-sm">
                      {[
                        ["Plan", currentPlan.title],
                        [
                          "Release fee",
                          `Rs ${distributionBaseAmount.toLocaleString("en-IN")}`,
                        ],
                        ...(trackPricingQuote.discountAmount > 0
                          ? [
                              [
                                "Discount",
                                `-Rs ${trackPricingQuote.discountAmount.toLocaleString("en-IN")}`,
                              ],
                            ]
                          : []),
                        ...(firstReleaseDiscount > 0
                          ? [["First Release Offer", `-Rs ${firstReleaseDiscount.toLocaleString("en-IN")}`]]
                          : []),
                        ...(ugcAddOnAmount > 0
                          ? [
                              [
                                "UGC add-on",
                                `Rs ${ugcAddOnAmount.toLocaleString("en-IN")}`,
                              ],
                            ]
                          : []),
                        ["Payment status", firstReleaseOffer && finalDistributionAmount === 0 ? "No payment required" : "Pending"],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className={clsx("payment-line flex items-center justify-between gap-4", label === "Discount" && "is-discount", label === "Payment status" && "is-status")}
                        >
                          <span className="review-label" style={{ color: "var(--text-muted)" }}>
                            {label}
                          </span>
                          <span className="review-value">{value}</span>
                        </div>
                      ))}
                    </div>
                    <div
                      className="payment-total flex items-end justify-between border-t pt-5"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span className="font-semibold">Total payable</span>
                      <span
                        className="text-2xl font-semibold"
                        style={{ color: "var(--accent)" }}
                      >
                        {finalDistributionAmount === 0 ? "FREE" : `Rs ${finalDistributionAmount.toLocaleString("en-IN")}`}
                      </span>
                    </div>
                  </section> : null}

                  <section className="p-5 md:p-7">
                    <div className="flex items-center gap-3">
                      <ShieldCheck
                        className="readiness-shield h-5 w-5"
                        style={{
                          color:
                            validationIssues.length === 0
                              ? "#86efac"
                              : "#fde68a",
                        }}
                      />
                      <div>
                        <h3 className="font-semibold">
                          {validationIssues.length === 0
                            ? "Ready to submit"
                            : "Submission readiness"}
                        </h3>
                        <p
                          className="mt-1 text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {validationIssues.length === 0
                            ? "Your release is ready for HYMN review."
                            : "Fix the required items before submitting."}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2">
                      {readinessItems.map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span
                            className={clsx("readiness-status-icon inline-flex h-5 w-5 items-center justify-center rounded-full", item.complete ? "is-complete" : "is-missing")}
                            style={{
                              background: item.complete
                                ? "rgba(34,197,94,0.14)"
                                : "rgba(250,204,21,0.12)",
                              color: item.complete ? "#86efac" : "#fde68a",
                            }}
                          >
                            {item.complete ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              "!"
                            )}
                          </span>
                          <span className={item.complete ? "" : "readiness-missing-text"} style={{ color: "var(--text-muted)" }}>
                            {item.shortLabel}
                            {item.complete ? "" : " missing"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              {submitting ? (
                <div
                  className="border-t p-5"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div
                    className="flex items-center justify-between text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <span>Uploading release…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div
                    className="mt-3 h-2 overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <div
                      className="shimmer-track h-full rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div
              className="review-submit-bar sticky bottom-3 z-20 grid gap-3 py-3 backdrop-blur-xl sm:grid-cols-[auto,1fr,auto]"
              style={{
                borderColor: "var(--border)",
                background: "color-mix(in srgb, var(--card) 90%, transparent)",
              }}
            >
              <button
                type="button"
                disabled={submitting}
                onClick={() => goToStep(5)}
                className="release-footer-action is-muted w-full sm:w-auto"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={saveDraftRelease}
                className="release-footer-action is-draft w-full sm:ml-auto sm:w-auto"
              >
                Draft
              </button>
              <button
                type="submit"
                disabled={submitting || !legalComplete}
                className={clsx("release-footer-action is-primary w-full disabled:opacity-60 sm:w-auto", firstReleaseOffer && finalDistributionAmount === 0 && "is-free-release")}
              >
                {submitting
                  ? "Processing…"
                  : subscriptionCovered
                    ? "Submit your release"
                    : firstReleaseOffer
                    ? finalDistributionAmount === 0
                      ? "Submit"
                      : `Pay Rs ${finalDistributionAmount.toLocaleString("en-IN")} for add-ons & Submit`
                    : `Pay Rs ${distributionAmount.toLocaleString("en-IN")} & Submit`}
              </button>
            </div>
          </section>
        ) : null}
        {step !== 7 && step !== 1 ? (
          <div
            className={(step === 0 || step === 1)
              ? "release-focused-actions"
              : "release-footer-mobile-actions sticky bottom-3 z-20 grid grid-cols-[0.85fr_0.7fr_1.55fr] items-stretch gap-1.5 rounded-[1.4rem] border p-2 shadow-2xl backdrop-blur-xl md:flex md:flex-wrap md:items-center md:justify-between md:gap-3 md:p-3"}
            style={(step === 0 || step === 1) ? undefined : {
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--card) 90%, transparent)",
            }}
          >
            <button
              type="button"
              disabled={step === 1 || step === 0 || step === menuStepIndexes[0] || submitting}
              onClick={() => {
                const currentIndex = menuStepIndexes.indexOf(
                  step as (typeof menuStepIndexes)[number],
                );
                goToStep(menuStepIndexes[Math.max(currentIndex - 1, 0)]);
              }}
              className="release-footer-action is-muted w-full whitespace-nowrap disabled:opacity-40 md:w-auto"
            >
              ← Previous
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={saveDraftRelease}
              className="release-footer-action is-draft w-full whitespace-nowrap disabled:opacity-60 md:ml-auto md:w-auto"
            >
              Draft
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={step === 0 ? continueFromMusic : advanceStep}
                disabled={submitting || (step !== 0 && stepTransitioning)}
                aria-busy={step !== 0 && stepTransitioning}
                className={clsx("release-footer-action is-primary w-full whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45 md:w-auto", step === 0 && !audioAssetsComplete && "is-skip")}
              >
                {step !== 0 && stepTransitioning
                  ? step === 0 ? "Add music ready" : "Opening add music…"
                  : step === 1
                  ? `Continue with ${tracks[0]?.primaryArtistIds.length ?? 0} artist${(tracks[0]?.primaryArtistIds.length ?? 0) === 1 ? "" : "s"} →`
                  : step === 0
                    ? audioAssetsComplete
                      ? `Continue with ${tracks.length} track${tracks.length === 1 ? "" : "s"} →`
                      : "Skip for now →"
                    : "Save and Continue →"}
              </button>
            ) : null}
          </div>
        ) : null}
        {status ? (
          <p
            className="text-xs md:text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {status}
          </p>
        ) : null}
        </div>
      </form>
      <MonetisationConsentModal
        open={monetisationModalOpen}
        onClose={() => setMonetisationModalOpen(false)}
        onConfirm={() => {
          setSocialConsentAccepted(true);
          setMonetisationModalOpen(false);
        }}
        value={monetisationClauses}
        onChange={setMonetisationClauses}
      />
      <YoutubeContentIdModal
        open={youtubeContentIdModalOpen}
        onClose={() => setYoutubeContentIdModalOpen(false)}
        onSave={() => {
          setYoutubeContentIdEnabled(true);
          setYoutubeContentIdModalOpen(false);
        }}
        channelUrl={youtubeContentIdChannelUrl}
        onChannelUrlChange={setYoutubeContentIdChannelUrl}
      />
      <ContributorsModal
        state={contributorsModal}
        onClose={closeContributors}
        onSave={(value) => {
          if (contributorsModal.trackIndex == null) return;
          updateTrack(contributorsModal.trackIndex, value);
          closeContributors();
        }}
        createContributor={createContributor}
        contributorsValid={contributorsValid}
      />
    </>
  );
}

// vercel trigger

// vercel trigger
// vercel trigger 4
// vercel trigger 6
// vercel trigger 7
// vercel trigger 9

// vercel trigger 11

// vercel trigger 12

// vercel trigger 14
