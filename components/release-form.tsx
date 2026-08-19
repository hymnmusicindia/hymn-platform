"use client";

import clsx from "clsx";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Crown, Disc3, LoaderCircle, LockKeyhole, Search, ShieldCheck, ChevronDown } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { ArtistPicker } from "@/components/artist-picker";
import { AudioWaveform } from "@/components/audio-waveform";
import { GenreSelector } from "@/components/genre-selector";
import { ContributorsModal, CountrySelector, LegalConsentModal, MonetisationConsentModal, SuccessState, YoutubeContentIdModal, createMonetisationClauseState, type ContributorDraft, type ContributorModalState, type MonetisationClauseState, ArtworkWarning } from "@/components/release-form-support";
import { ArtworkSquareDropzone } from "@/components/artwork-square-dropzone";
import { UploadDropzone } from "@/components/upload-dropzone";
import { findDistributionPlan, type DistributionPlanOption } from "@/lib/distribution-plans";
import { getTrackPricingBadge, getTrackPricingNudge, getTrackPricingQuote, getUgcAddonPrice, UGC_ADDON_PRICE } from "@/lib/distribution-pricing";
import { socialPlatforms, storePlatforms, versionOptions } from "@/lib/release-config";
import type { ArtistProfile, ContributorCredit, DistributionQueueSummary, Release, ReleaseTrack } from "@/lib/types";
import { DIRENOTE_LANGUAGES } from "@/lib/direnote-config";

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

type ValidationIssue = { key: string; step: number; message: string; trackIndex?: number };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const steps = ["Tracks", "Release", "Artwork", "Destinations", "Review"] as const;
const moodGroups = [
  ["Calm & Relaxing", ["Chill", "Relaxed", "Peaceful", "Soft", "Mellow", "Soothing", "Serene"]],
  ["Atmospheric", ["Ambient", "Dreamy", "Ethereal", "Mysterious", "Cinematic"]],
  ["Energetic & Powerful", ["Energetic", "Powerful", "Intense", "Aggressive", "Epic", "Dark"]],
  ["Emotional", ["Happy", "Sad", "Romantic", "Melancholic", "Heartbreak", "Nostalgic", "Hopeful"]],
  ["Positive & Inspirational", ["Uplifting", "Motivational", "Inspirational", "Spiritual", "Empowering"]],
  ["Party & Club", ["Dance", "Club", "Party", "Groovy", "Bouncy", "Fun", "High Energy"]],
  ["Street / Hip-Hop", ["Raw", "Gritty", "Gangsta", "Drill", "Trap", "Confident", "Flex"]],
  ["Experimental", ["Abstract", "Alternative", "Psychedelic", "Futuristic", "Experimental"]]
] as const;
const defaultLegalState: LegalState = {
  ownershipConfirmation: false,
  noInfringement: false,
  collaboratorsCredited: false,
  platformGuidelines: false,
  hymnNotLiable: false,
  termsAccepted: false,
  falseMetadataAcknowledged: false,
  fraudWarningAccepted: false
};

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createContributor(): ContributorDraft {
  return { id: createId(), legalName: "", artistName: "", ipi: "", iprsMember: false, instagramUrl: "", xUrl: "" };
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
    audioPreviewUrl: "",
    duration: "",
    titleLanguage: "English",
    explicitContent: false,
    dolbyAtmos: false
  };
}
function fileNameFromUrl(value: string) {
  if (!value) return "";
  const clean = value.split("?")[0].split("#")[0];
  const parts = clean.split("/");
  return decodeURIComponent(parts[parts.length - 1] || "");
}

function splitContributorNames(value?: string | null) {
  const names = (value ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return [createContributor()];
  return names.map((name) => ({ id: createId(), legalName: name, artistName: "" }));
}

function safeRevokePreviewUrl(value: string) {
  if (value.startsWith("blob:")) URL.revokeObjectURL(value);
}

function createInitialReleaseDraft(initialRelease: Release | null | undefined, minimumScheduledDate: string): ReleaseDraft {
  if (!initialRelease) {
    return { releasePreviouslyReleased: false, upcCode: "", existingIsrcCode: "", releaseTitle: "", recordLabelName: "", primaryGenre: "", secondaryGenre: "", mood: "", language: "", territory: "Worldwide", selectedCountries: [], releaseTiming: "quick_release", scheduledReleaseDate: minimumScheduledDate, copyrightOwner: "" };
  }

  const territory = initialRelease.territory && initialRelease.territory !== "Worldwide" ? "Selected countries" : "Worldwide";
  return {
    releasePreviouslyReleased: Boolean(initialRelease.releasePreviouslyReleased),
    upcCode: initialRelease.upcCode ?? "",
    existingIsrcCode: initialRelease.tracks?.[0]?.isrc ?? "",
    releaseTitle: initialRelease.releaseTitle?.trim() || "",
    recordLabelName: initialRelease.labelName?.trim() || initialRelease.labelDisplayName?.trim() || "",
    primaryGenre: initialRelease.primaryGenre?.trim() || initialRelease.genre?.trim() || "",
    secondaryGenre: initialRelease.secondaryGenre?.trim() || initialRelease.primaryGenre?.trim() || initialRelease.genre?.trim() || "",
    mood: typeof initialRelease.mood === "string" ? initialRelease.mood.trim() : "",
    language: initialRelease.language || "",
    territory: territory as ReleaseDraft["territory"],
    selectedCountries: territory === "Selected countries" ? (initialRelease.territory?.split(",").map((country) => country.trim()).filter(Boolean) ?? []) : [],
    releaseTiming: initialRelease.releaseTiming === "schedule_release" ? "schedule_release" : "quick_release",
    scheduledReleaseDate: initialRelease.originalReleaseDate || initialRelease.releaseDate || minimumScheduledDate,
    copyrightOwner: initialRelease.copyrightOwner?.trim() || ""
  };
}

function createInitialLegalState(initialRelease: Release | null | undefined): LegalState {
  if (!initialRelease) return defaultLegalState;
  return {
    ownershipConfirmation: Boolean(initialRelease.ownershipConfirmed),
    noInfringement: Boolean(initialRelease.noUnauthorizedSamples),
    collaboratorsCredited: Boolean(initialRelease.collaboratorsCredited),
    platformGuidelines: Boolean(initialRelease.platformCompliant),
    hymnNotLiable: Boolean(initialRelease.hymnNotLiable),
    termsAccepted: Boolean(initialRelease.agreedToTerms),
    falseMetadataAcknowledged: Boolean(initialRelease.falseMetadataAcknowledged),
    fraudWarningAccepted: true
  };
}

function logoFilePath(fileName: string) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

function LogoImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={clsx("block object-contain", className)} referrerPolicy="no-referrer" loading="lazy" />;
}

function PlatformLogo({ platform, className }: { platform: string; className?: string }) {
  if (platform === "Spotify") {
    return <LogoImage src={logoFilePath("Spotify New Full Logo RGB Green.png")} alt="Spotify" className={className} />;
  }
  if (platform === "Apple Music") {
    return <LogoImage src={logoFilePath("Apple Music Logo.png")} alt="Apple Music" className={className} />;
  }
  if (platform === "Amazon Music") {
    return <LogoImage src={logoFilePath("Amazon Music 2024.png")} alt="Amazon Music" className={className} />;
  }
  if (platform === "YouTube Music") {
    return <LogoImage src={logoFilePath("YouTubeMusic Logo.png")} alt="YouTube Music" className={className} />;
  }
  if (platform === "JioSaavn") {
    return <LogoImage src={logoFilePath("JioSaavn Logo.svg")} alt="JioSaavn" className={className} />;
  }
  if (platform === "Gaana") {
    return <LogoImage src={logoFilePath("Gaana logo.png")} alt="Gaana" className={className} />;
  }
  if (platform === "Instagram / Facebook") {
    return (
      <div className={clsx("flex items-center gap-0.5", className)} aria-hidden="true">
        <LogoImage src={logoFilePath("Instagram-Logo-Round-Color.png")} alt="Instagram" className="h-5 w-auto" />
        <LogoImage src={logoFilePath("Facebook-Logo-Round-Color.png")} alt="Facebook" className="h-5 w-auto" />
      </div>
    );
  }
  if (platform === "TikTok") {
    return <LogoImage src={logoFilePath("Tiktok logo.png")} alt="TikTok" className={className} />;
  }
  if (platform === "150+ More Stores") {
    return (
      <div
        className={clsx("inline-flex items-center justify-center rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", className)}
        style={{ borderColor: "var(--border)", color: "var(--text)" }}
      >
        150+ Stores
      </div>
    );
  }
  return null;
}

function createTracksFromRelease(initialRelease: Release | null | undefined): TrackDraft[] {
  const sourceTracks = initialRelease?.tracks?.length ? initialRelease.tracks : initialRelease ? [{ id: 1, releaseId: initialRelease.id, trackTitle: initialRelease.trackName || initialRelease.releaseTitle || "", version: undefined, trackNumber: 1, primaryArtist: initialRelease.artistName, featuredArtists: undefined, additionalPrimaryArtists: undefined, songwriters: initialRelease.artistName, composers: initialRelease.artistName, producers: initialRelease.artistName, isrc: undefined, isCover: false, originalArtist: undefined, originalTrackLink: undefined, coverLicenseConfirmed: false, audioUrl: initialRelease.audioUrl, duration: "", bpm: null, musicalKey: undefined, explicitContent: false, dolbyAtmos: false, createdAt: initialRelease.createdAt }] : [];

  return (sourceTracks.length ? sourceTracks : [null]).map((track, index) => {
    const version = (track?.version?.trim() || "Original") as (typeof versionOptions)[number];
    return {
      id: createId(),
      trackNumber: track?.trackNumber ?? index + 1,
      trackTitle: track?.trackTitle?.trim() || "",
      existingIsrcCode: track?.isrc?.trim() || "",
      versionPreset: versionOptions.includes(version) ? version : "Other",
      customVersion: versionOptions.includes(version) ? "" : version,
      primaryArtistIds: [],
      primaryArtistQuery: track?.primaryArtist?.trim() || initialRelease?.artistName?.trim() || "",
      featuredArtists: track?.featuredArtists?.trim() || "",
      remixers: track?.additionalPrimaryArtists?.trim() || "",
      songwriters: splitContributorNames(track?.songwriters),
      composers: splitContributorNames(track?.composers),
      producers: splitContributorNames(track?.producers),
      isCover: Boolean(track?.isCover),
      originalArtist: track?.originalArtist?.trim() || "",
      originalTrackLink: track?.originalTrackLink?.trim() || "",
      coverLicenseFile: null,
      coverLicenseFileName: track?.coverLicenseConfirmed ? "Existing license proof" : "",
      existingCoverLicenseConfirmed: Boolean(track?.coverLicenseConfirmed),
      audioFile: null,
      audioFileName: fileNameFromUrl(track?.audioUrl || initialRelease?.audioUrl || ""),
      existingAudioUrl: track?.audioUrl || initialRelease?.audioUrl || "",
      audioUploadStatus: track?.audioUrl || initialRelease?.audioUrl ? "uploaded" : "idle",
      audioPreviewUrl: track?.audioUrl || initialRelease?.audioUrl || "",
      duration: track?.duration?.trim() || "",
      titleLanguage: typeof track?.metadata === "object" && track?.metadata && "titleLanguage" in track.metadata ? String((track.metadata as Record<string, unknown>).titleLanguage || "English") : "English",
      explicitContent: Boolean(track?.explicitContent),
      dolbyAtmos: Boolean(track?.dolbyAtmos)
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
  return entries.length > 0 && entries.every((entry) => entry.legalName.trim().split(/\s+/).length >= 2);
}

function contributorNames(entries: ContributorDraft[]) {
  return entries.map((entry) => entry.legalName.trim()).filter(Boolean).join(", ");
}

function contributorCredits(role: ContributorCredit["role"], entries: ContributorDraft[]): ContributorCredit[] {
  return entries.map((entry) => ({ role, legalName: entry.legalName.trim(), artistName: entry.artistName.trim() || undefined, ipi: entry.ipi?.trim() || undefined, iprsMember: Boolean(entry.iprsMember), instagramUrl: entry.instagramUrl?.trim() || undefined, xUrl: entry.xUrl?.trim() || undefined })).filter((entry) => entry.legalName);
}

function releaseTypeFromCount(trackCount: number) {
  if (trackCount <= 1) return "single" as const;
  if (trackCount <= 4) return "ep" as const;
  return "album" as const;
}

function queueProgressPercent(reviewing: number, pending: number) {
  const total = reviewing + pending + 1;
  if (total <= 0) return 40;
  return Math.max(18, Math.min(82, Math.round((reviewing / total) * 100)));
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
  if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Artwork must be JPG or PNG.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.width, height: image.height });
      image.onerror = () => reject(new Error("Could not read artwork dimensions."));
      image.src = objectUrl;
    });
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
  return source.replace(/^audio\//, "").replace(/^image\//, "").toUpperCase();
}

async function detectArtworkWarning(file: File) {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const result = await worker.recognize(file);
    await worker.terminate();
    const text = result.data.text.replace(/\s+/g, " ").trim();
    if (text.length >= 18 && (result.data.confidence ?? 0) >= 30) return "Cover art may be rejected due to excessive text.";
  } catch {
    return null;
  }
  return null;
}

function socialPlatformSelected(platforms: string[]) {
  return socialPlatforms.some((platform) => platforms.includes(platform.name));
}

const languageOptions = [...DIRENOTE_LANGUAGES];

function SearchableSelect({ label, value, options, placeholder, invalid, onChange }: { label: string; value: string; options: string[]; placeholder: string; invalid?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter((option, index, list) => list.indexOf(option) === index && (!normalized || option.toLowerCase().includes(normalized)));
  }, [options, query]);

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>{label}</label>
      <button type="button" className={clsx("field flex min-h-[52px] items-center justify-between gap-3 text-left", invalid ? "field-invalid" : "")} onClick={() => setOpen((current) => !current)}>
        <span style={{ color: value ? "var(--text)" : "var(--text-soft)" }}>{value || placeholder}</span>
        <ChevronDown className={clsx("h-4 w-4 transition", open ? "rotate-180" : "")} style={{ color: "var(--text-soft)" }} />
      </button>
      {open ? (
        <div className="absolute z-40 mt-2 w-full rounded-[1.4rem] border p-3 shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-soft)" }} />
            <input className="field pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search languages" autoFocus />
          </div>
          <div className="mt-3 max-h-64 overflow-y-auto pr-1">
            {filtered.map((option) => (
              <button key={option} type="button" className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-white/5" style={{ color: "var(--text)" }} onClick={() => { onChange(option); setQuery(""); setOpen(false); }}>
                <span>{option}</span>
                {option === value ? <CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} /> : null}
              </button>
            ))}
            {filtered.length === 0 ? <p className="px-3 py-3 text-sm" style={{ color: "var(--text-soft)" }}>No language found.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ReleaseForm({ selectedPlan, initialRelease }: { selectedPlan: DistributionPlanOption; initialRelease?: Release | null }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const quickReleaseDate = useMemo(() => toDateInputValue(addDays(today, 3)), [today]);
  const minimumScheduledDate = useMemo(() => toDateInputValue(addDays(today, 20)), [today]);
  const [step, setStep] = useState(initialRelease ? 4 : 0);
  const [stepMotion, setStepMotion] = useState("step-adjacent-forward");
  const [mobileStepMenuOpen, setMobileStepMenuOpen] = useState(false);
  const [expandedTrack, setExpandedTrack] = useState(0);
  const [queue, setQueue] = useState<DistributionQueueSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [attemptedStep, setAttemptedStep] = useState<number | null>(null);
  const [validationErrorKeys, setValidationErrorKeys] = useState<Set<string>>(() => new Set());
  const [knownProfiles, setKnownProfiles] = useState<Record<number, ArtistProfile>>({});
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(initialRelease?.artworkUrl ?? null);
  const [artworkDimensions, setArtworkDimensions] = useState<string | null>(null);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [artworkWarning, setArtworkWarning] = useState<string | null>(null);
  const [artworkScanning, setArtworkScanning] = useState(false);
  const [contributorsModal, setContributorsModal] = useState<ContributorModalState>({ open: false, trackIndex: null, songwriters: [createContributor()], composers: [createContributor()], producers: [createContributor()] });
  const [monetisationModalOpen, setMonetisationModalOpen] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [youtubeContentIdModalOpen, setYoutubeContentIdModalOpen] = useState(false);
  const [draftReleaseId, setDraftReleaseId] = useState<number | null>(() => initialRelease?.status === "draft" ? initialRelease.id : null);
  const [socialConsentAccepted, setSocialConsentAccepted] = useState(() => initialRelease?.monetisationAccepted ?? (initialRelease?.platforms?.length ? socialPlatformSelected(initialRelease.platforms) : true));
  const [monetisationClauses, setMonetisationClauses] = useState<MonetisationClauseState>(() => {
    const base = createMonetisationClauseState();
    if (!initialRelease?.monetisationClauses) return base;
    return { ...base, ...Object.fromEntries(Object.entries(initialRelease.monetisationClauses).filter(([key]) => key in base)) } as MonetisationClauseState;
  });
  const [youtubeContentIdEnabled, setYoutubeContentIdEnabled] = useState(() => Boolean(initialRelease?.youtubeContentIdEnabled));
  const [youtubeContentIdChannelUrl, setYoutubeContentIdChannelUrl] = useState(() => initialRelease?.youtubeContentIdChannelUrl ?? "");
  const [release, setRelease] = useState<ReleaseDraft>(() => createInitialReleaseDraft(initialRelease, minimumScheduledDate));
  const [legal, setLegal] = useState<LegalState>(() => createInitialLegalState(initialRelease));
  const defaultStorePlatforms = useMemo(() => [...storePlatforms, ...socialPlatforms].map((platform) => platform.name), []);
  const [platforms, setPlatforms] = useState<string[]>(initialRelease?.platforms?.length ? initialRelease.platforms : defaultStorePlatforms);
  const [tracks, setTracks] = useState<TrackDraft[]>(() => createTracksFromRelease(initialRelease));
  const [submittedRelease, setSubmittedRelease] = useState<Release | null>(null);
  const [shakingField, setShakingField] = useState<string | null>(null);
  const isEditing = Boolean(initialRelease);
  const draftCreationRef = useRef(false);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const releaseType = useMemo(() => releaseTypeFromCount(tracks.length), [tracks.length]);
  const requiresReleaseTitle = releaseType !== "single";
  const displayedReleaseTitle = useMemo(() => releaseType === "single" ? tracks[0]?.trackTitle.trim() || "Untitled single" : release.releaseTitle.trim() || (releaseType === "ep" ? "Untitled EP" : "Untitled Album"), [release.releaseTitle, releaseType, tracks]);
  const selectedReleaseDate = release.releaseTiming === "schedule_release" ? release.scheduledReleaseDate : quickReleaseDate;
  const releaseDateValid = release.releaseTiming === "quick_release" || (Boolean(release.scheduledReleaseDate) && release.scheduledReleaseDate >= minimumScheduledDate);
  const currentPlan = findDistributionPlan(selectedPlan);
  const customLabelAllowed = selectedPlan === "yearly_plus";
  const trackPricingQuote = useMemo(() => getTrackPricingQuote(tracks.length), [tracks.length]);
  const trackPricingBadge = getTrackPricingBadge(trackPricingQuote);
  const trackPricingNudge = getTrackPricingNudge(trackPricingQuote);
  const pricingCallout = trackPricingBadge ? `${trackPricingBadge} - ${trackPricingNudge}` : trackPricingNudge;
  const ugcAddOnAmount = useMemo(() => getUgcAddonPrice(platforms, selectedPlan, { youtubeContentIdEnabled }), [platforms, selectedPlan, youtubeContentIdEnabled]);
  const distributionBaseAmount = selectedPlan === "one_time" ? trackPricingQuote.basePrice : currentPlan.price;
  const distributionAmount = (selectedPlan === "one_time" ? trackPricingQuote.finalPrice : currentPlan.price) + ugcAddOnAmount;
  const youtubeContentIdFee = selectedPlan === "one_time" && youtubeContentIdEnabled ? 200 : 0;
  const legalComplete = useMemo(() => Object.values(legal).every(Boolean), [legal]);
  const storeSelections = useMemo(() => storePlatforms.filter((platform) => platforms.includes(platform.name)).map((platform) => platform.name), [platforms]);
  const territoryValue = release.selectedCountries.length > 0 ? `Worldwide excluding ${release.selectedCountries.join(", ")}` : "Worldwide";
  const audioComplete = tracks.length > 0 && tracks.every((track) => track.audioUploadStatus === "uploaded" && Boolean(track.existingAudioUrl));
  const metadataComplete = Boolean(displayedReleaseTitle.trim() && release.recordLabelName.trim() && release.primaryGenre && release.secondaryGenre && release.mood.trim() && release.language.trim() && platforms.length > 0 && release.copyrightOwner.trim());
  const creditsComplete = tracks.every((track) => contributorsValid(track.songwriters) && contributorsValid(track.composers) && contributorsValid(track.producers));
  const readinessItems = [
    { label: "Artwork Uploaded", shortLabel: "Artwork", complete: Boolean(artworkFile || artworkPreview) },
    { label: "Audio Uploaded", shortLabel: "Audio", complete: audioComplete },
    { label: "Metadata Complete", shortLabel: "Metadata", complete: metadataComplete },
    { label: "Credits Complete", shortLabel: "Credits", complete: creditsComplete },
    { label: "Legal Complete", shortLabel: "Legal Confirmation", complete: legalComplete },
    { label: "Distribution Ready", shortLabel: "Distribution", complete: metadataComplete && audioComplete && creditsComplete && legalComplete && Boolean(artworkFile || artworkPreview) }
  ];
  const readinessScore = Math.round((readinessItems.filter((item) => item.complete).length / readinessItems.length) * 100);
  const autosaveSnapshot = useMemo(() => ({
    title: displayedReleaseTitle,
    artistName: tracks[0]?.primaryArtistQuery || initialRelease?.artistName || "",
    genre: release.primaryGenre,
    releaseDate: selectedReleaseDate,
    artworkUrl: artworkPreview && !artworkPreview.startsWith("data:") ? artworkPreview : undefined,
    audioUrl: tracks[0]?.existingAudioUrl || undefined,
    metadata: {
      ...release,
      releaseType,
      platforms,
      youtubeContentIdEnabled,
      youtubeContentIdChannelUrl,
      legal,
      draftCompletionPercent: readinessScore,
      missingFields: readinessItems.filter((item) => !item.complete).map((item) => item.label),
      tracks: tracks.map((track, index) => ({ trackTitle: track.trackTitle, trackNumber: index + 1, primaryArtist: track.primaryArtistQuery || initialRelease?.artistName || "", featuredArtists: track.featuredArtists, songwriters: contributorNames(track.songwriters), composers: contributorNames(track.composers), producers: contributorNames(track.producers), audioUrl: track.existingAudioUrl, audioFileName: track.audioFileName, duration: track.duration, bpm: null, musicalKey: "", explicitContent: track.explicitContent, contributors: [...contributorCredits("songwriter", track.songwriters), ...contributorCredits("composer", track.composers), ...contributorCredits("producer", track.producers)] }))
    }
  }), [artworkPreview, displayedReleaseTitle, initialRelease?.artistName, legal, platforms, readinessScore, release, releaseType, selectedReleaseDate, tracks, youtubeContentIdChannelUrl, youtubeContentIdEnabled]);
  const projectedPosition = (queue?.pendingQueue ?? 0) + 1;
  const queuePercent = queueProgressPercent(queue?.currentlyReviewing ?? 128, queue?.pendingQueue ?? 22);

  useEffect(() => {
    fetch("/api/distribution/queue").then((response) => response.json()).then((data) => setQueue(data.summary)).catch(() => setQueue({ currentlyReviewing: 128, nextBatchIn: "4h 21m", averageApprovalTime: "36-48 hours", pendingQueue: 22 }));
  }, []);

  useEffect(() => {
    if (initialRelease || draftReleaseId || draftCreationRef.current) return;
    draftCreationRef.current = true;
    fetch("/api/distribution/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: displayedReleaseTitle }) })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not start draft."); return data; })
      .then((data) => { const id = Number(data.draft?.id); if (id > 0) { setDraftReleaseId(id); router.replace(`/distribution/start?edit=${id}`); } })
      .catch(() => { draftCreationRef.current = false; });
  }, [displayedReleaseTitle, draftReleaseId, initialRelease, router]);

  useEffect(() => {
    if (!draftReleaseId || submitting || submittedRelease) return;
    const timer = window.setTimeout(() => {
      fetch(`/api/distribution/drafts/${draftReleaseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(autosaveSnapshot) }).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [autosaveSnapshot, draftReleaseId, submittedRelease, submitting]);

  useEffect(() => {
    if (customLabelAllowed) return;
    setRelease((current) => current.recordLabelName.trim() ? current : { ...current, recordLabelName: "HYMN Music" });
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
    tracks.forEach((track) => {
      if (track.audioPreviewUrl) URL.revokeObjectURL(track.audioPreviewUrl);
    });
  }, [tracks]);

  useEffect(() => {
    setMobileStepMenuOpen(false);
  }, [step]);

  const registerField = (key: string) => (node: HTMLElement | null) => { fieldRefs.current[key] = node; };
  const fieldClass = (key: string, invalid: boolean) => clsx("field", invalid || validationErrorKeys.has(key) ? "field-invalid" : "", shakingField === key ? "field-shake" : "");

  function triggerFieldFocus(issue: ValidationIssue) {
    if (issue.trackIndex != null) setExpandedTrack(issue.trackIndex);
    goToStep(issue.step);
    setShakingField(issue.key);
    window.setTimeout(() => {
      const target = fieldRefs.current[issue.key];
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement) target.focus();
    }, 80);
    window.setTimeout(() => setShakingField((current) => current === issue.key ? null : current), 420);
  }

  const upsertKnownProfile = (profile: ArtistProfile) => setKnownProfiles((current) => ({ ...current, [profile.id]: profile }));
  const profilesFor = (ids: number[]) => ids.map((id) => knownProfiles[id]).filter(Boolean);
  const namesFor = (ids: number[]) => profilesFor(ids).map((profile) => profile.name).join(", ");
  const primaryArtistName = namesFor(tracks[0]?.primaryArtistIds ?? []) || tracks[0]?.primaryArtistQuery.trim() || initialRelease?.artistName || "";
  const updateTrack = (index: number, patch: Partial<TrackDraft>) => setTracks((current) => current.map((track, trackIndex) => trackIndex === index ? { ...track, ...patch } : track));
  const setTrackList = (updater: (current: TrackDraft[]) => TrackDraft[]) => setTracks((current) => updater(current).map((track, index) => ({ ...track, trackNumber: index + 1 })));
  const addTrack = () => { setTrackList((current) => [...current, createTrack(current.length + 1)]); setExpandedTrack(tracks.length); };

  function removeTrack(index: number) {
    setTrackList((current) => {
      const target = current[index];
      if (target?.audioPreviewUrl) URL.revokeObjectURL(target.audioPreviewUrl);
      return current.filter((_, trackIndex) => trackIndex !== index);
    });
    setExpandedTrack((value) => Math.max(0, Math.min(value, tracks.length - 2)));
  }

  function togglePlatform(platform: string, type: "store" | "social") {
    const active = platforms.includes(platform);
    if (type === "social" && !socialConsentAccepted) {
      return;
    }
    setPlatforms((current) => {
      const next = active ? current.filter((item) => item !== platform) : [...current, platform];
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

  async function handleAudioFile(index: number, file: File, controls: { signal: AbortSignal; reportProgress: (loaded: number, total: number) => void }) {
    const currentTrack = tracks[index];
    if (currentTrack?.audioPreviewUrl) safeRevokePreviewUrl(currentTrack.audioPreviewUrl);
    const previewUrl = URL.createObjectURL(file);
    const duration = await getAudioDuration(file).catch(() => { throw new Error("Could not read the uploaded audio."); });
    updateTrack(index, { audioFile: file, audioFileName: file.name, existingAudioUrl: "", audioPreviewUrl: previewUrl, duration, audioUploadStatus: "uploading" });
    try {
      const uploaded = await upload(`release-audio/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "")}`, file, { access: "public", handleUploadUrl: "/api/uploads/audio/sign", multipart: file.size > 20 * 1024 * 1024, abortSignal: controls.signal, onUploadProgress: (event) => controls.reportProgress(event.loaded, event.total) });
      updateTrack(index, { audioFile: null, audioFileName: file.name, existingAudioUrl: uploaded.url, audioPreviewUrl: previewUrl, duration, audioUploadStatus: "uploaded" });
    } catch (error) {
      updateTrack(index, { audioUploadStatus: "failed" });
      throw error;
    }
  }

  function handleCoverLicense(index: number, file: File | null) {
    if (!file) return updateTrack(index, { coverLicenseFile: null, coverLicenseFileName: "" });
    if (file.type !== "application/pdf") {
      setStatus("Cover license must be uploaded as a PDF.");
      return updateTrack(index, { coverLicenseFile: null, coverLicenseFileName: "" });
    }
    updateTrack(index, { coverLicenseFile: file, coverLicenseFileName: file.name, existingCoverLicenseConfirmed: true });
  }

  async function handleArtwork(file: File) {
    let dimensions: { width: number; height: number };
    try {
      dimensions = await validateArtwork(file);
    } catch (error) {
      setArtworkFile(null);
      setArtworkDimensions(null);
      setArtworkError(error instanceof Error ? error.message : "Artwork validation failed.");
      throw error;
    }
    if (artworkPreview) safeRevokePreviewUrl(artworkPreview);
    setArtworkFile(file);
    setArtworkPreview(await readAsDataUrl(file));
    setArtworkDimensions(`${dimensions.width} x ${dimensions.height}`);
    setArtworkError(null);
    const qualityWarnings = [
      dimensions.width !== dimensions.height ? "This artwork is not square and may be rejected or cropped by music stores." : null,
      dimensions.width < 3000 || dimensions.height < 3000 ? "This artwork is below 3000 x 3000 pixels and may look blurry or be rejected by music stores." : null
    ].filter(Boolean) as string[];
    setArtworkWarning(qualityWarnings.join(" ") || null);
    setArtworkScanning(true);
    void detectArtworkWarning(file).then((warning) => { setArtworkWarning([qualityWarnings.join(" "), warning].filter(Boolean).join(" ") || null); setArtworkScanning(false); });
  }

  function openContributors(index: number) {
    const track = tracks[index];
    setContributorsModal({ open: true, trackIndex: index, songwriters: track.songwriters, composers: track.composers, producers: track.producers });
  }

  function closeContributors() {
    setContributorsModal((current) => ({ ...current, open: false, trackIndex: null }));
  }

  function trackIssue(track: TrackDraft, index: number): ValidationIssue | null {
    if (!track.trackTitle.trim()) return { step: 0, key: `track-${index}-title`, trackIndex: index, message: "Add a title for every track before continuing." };
    if (track.versionPreset === "Other" && !track.customVersion.trim()) return { step: 0, key: `track-${index}-version`, trackIndex: index, message: "Enter the custom version label for tracks using Other." };
    if (track.primaryArtistIds.length > 3) return { step: 0, key: `track-${index}-artists`, trackIndex: index, message: "Each track needs 1 to 3 primary artist profiles." };
    if (track.primaryArtistIds.length === 0 && !track.primaryArtistQuery.trim()) return { step: 0, key: `track-${index}-artists`, trackIndex: index, message: "Each track needs at least one primary artist or a filled artist name." };
    if (!contributorsValid(track.songwriters) || !contributorsValid(track.composers) || !contributorsValid(track.producers)) return { step: 0, key: `track-${index}-contributors`, trackIndex: index, message: "Each track needs songwriter, composer, and producer legal names." };
    if (!track.audioFile && !track.existingAudioUrl && !track.audioPreviewUrl) return { step: 0, key: `track-${index}-audio`, trackIndex: index, message: "Upload audio for every track before continuing." };
    if (track.isCover && !track.originalArtist.trim()) return { step: 0, key: `track-${index}-original-artist`, trackIndex: index, message: "Cover songs need the original artist name." };
    if (track.isCover && !track.originalTrackLink.trim()) return { step: 0, key: `track-${index}-original-link`, trackIndex: index, message: "Cover songs need a reference link to the original release." };
    if (track.isCover && !track.coverLicenseFile && !track.existingCoverLicenseConfirmed) return { step: 0, key: `track-${index}-cover-license`, trackIndex: index, message: "Cover songs need a PDF license or rights proof upload." };
    return null;
  }

  const releaseInfoIssues = (): ValidationIssue[] => [
    release.releasePreviouslyReleased && !release.upcCode.trim() ? { step: 1, key: "existing-upc", message: "Existing UPC is required for a previously released release." } : null,
    release.releasePreviouslyReleased && tracks.some((track) => !track.existingIsrcCode.trim()) ? { step: 1, key: "existing-isrc", message: "Each track requires its existing ISRC for a previously released release." } : null,
    requiresReleaseTitle && !release.releaseTitle.trim() ? { step: 1, key: "release-title", message: releaseType === "ep" ? "Add an EP name before continuing." : "Add an album name before continuing." } : null,
    !release.recordLabelName.trim() ? { step: 1, key: "record-label", message: "Enter the record label or imprint name." } : null,
    !release.primaryGenre || !release.secondaryGenre ? { step: 1, key: "genre-picker", message: "Choose both a genre and subgenre before continuing." } : null,
    !release.mood.trim() ? { step: 1, key: "mood", message: "Please select a mood for this release." } : null,
    !release.language.trim() ? { step: 1, key: "language", message: "Language is required before continuing." } : null,
    !releaseDateValid ? { step: 1, key: "release-date", message: "Scheduled releases must be at least 20 days from today." } : null
  ].filter((issue): issue is ValidationIssue => Boolean(issue));
  const releaseInfoIssue = (): ValidationIssue | null => releaseInfoIssues()[0] ?? null;

  const artworkIssue = (): ValidationIssue | null => !artworkPreview || artworkError ? { step: 2, key: "artwork-upload", message: artworkError || "Upload cover artwork before continuing." } : null;

  const destinationsIssues = (): ValidationIssue[] => [
    platforms.length === 0 ? { step: 3, key: "store-selection", message: "Choose at least one store or social destination." } : null,
    !release.copyrightOwner.trim() ? { step: 3, key: "copyright-owner", message: "Copyright owner is required before continuing." } : null,
    socialPlatformSelected(platforms) && !socialConsentAccepted ? { step: 3, key: "social-confirmation", message: "Enable monetisation before selecting UGC platforms." } : null,
    platforms.includes("YouTube Music") && youtubeContentIdEnabled && !youtubeContentIdChannelUrl.trim() ? { step: 3, key: "youtube-content-id-url", message: "Add your YouTube channel URL for Content ID." } : null,
    !Object.values(legal).every(Boolean) ? { step: 3, key: "legal-checks", message: "Complete the final legal confirmations before continuing." } : null
  ].filter((issue): issue is ValidationIssue => Boolean(issue));
  const destinationsIssue = (): ValidationIssue | null => destinationsIssues()[0] ?? null;

  const stepChecks = [tracks.every((track, index) => !trackIssue(track, index)), !releaseInfoIssue(), !artworkIssue(), !destinationsIssue()];
  const validationIssues = [
    ...tracks.map((track, index) => trackIssue(track, index)).filter((issue): issue is ValidationIssue => Boolean(issue)),
    ...releaseInfoIssues(),
    artworkIssue(),
    ...destinationsIssues()
  ].filter((issue): issue is ValidationIssue => Boolean(issue));
  const validationIssueCount = validationIssues.length;
  const completion = Math.round((stepChecks.filter(Boolean).length / stepChecks.length) * 100);
  const showErrors = attemptedStep === step || submitting;
  const stepValidity = steps.map((_, index) => stepChecks[index] ? "complete" : validationIssues.some((issue) => issue.step === index) ? "invalid" : "neutral");

  function firstIssueForStep(stepIndex: number): ValidationIssue | null {
    if (stepIndex === 0) return tracks.map((track, index) => trackIssue(track, index)).find(Boolean) ?? null;
    if (stepIndex === 1) return releaseInfoIssue();
    if (stepIndex === 2) return artworkIssue();
    if (stepIndex === 3) return destinationsIssue();
    return [0, 1, 2, 3].map((index) => firstIssueForStep(index)).find(Boolean) ?? null;
  }

  function stepButtonStyles(index: number) {
    const validity = stepValidity[index];
    const isCurrent = step === index;
    const style = validity === "complete"
      ? { borderColor: "rgba(34,197,94,0.45)", background: "rgba(34,197,94,0.14)", color: "rgb(22,163,74)" }
      : validity === "invalid"
        ? { borderColor: "rgba(248,113,113,0.45)", background: "rgba(248,113,113,0.12)", color: "rgb(239,68,68)" }
        : isCurrent
          ? { background: "var(--accent)", color: "var(--accent-foreground)" }
          : { borderColor: "var(--border)", background: "transparent", color: "var(--text-muted)" };
    const className = clsx("pressable hover-lift rounded-xl px-3 py-3 text-xs font-semibold uppercase tracking-[0.16em]", isCurrent && validity !== "complete" && validity !== "invalid" ? "" : "border");
    return { className, style, validity, isCurrent };
  }

  function jumpToStep(index: number) {
    setAttemptedStep(null);
    setStatus(null);
    goToStep(index);
    setMobileStepMenuOpen(false);
  }

  function goToStep(nextStep: number) {
    if (step === nextStep) return;
    const kind = Math.abs(nextStep - step) > 1 ? "jump" : "adjacent";
    const direction = nextStep > step ? "forward" : "back";
    setStepMotion(`step-${kind}-${direction}`);
    setStep(nextStep);
  }

  async function uploadFilesDirectly() {
    const filesToUpload: { name: string, file: File, setter: (url: string) => void }[] = [];
    let artworkUrl: string | undefined;
    if (artworkFile) filesToUpload.push({ name: `artwork-${Date.now()}-${artworkFile.name.replace(/[^a-zA-Z0-9.-]/g, '')}`, file: artworkFile, setter: (url) => artworkUrl = url });
    
    const trackAudioUrls: (string | undefined)[] = new Array(tracks.length).fill(undefined);
    const trackLicenseUrls: (string | undefined)[] = new Array(tracks.length).fill(undefined);

    tracks.forEach((track, i) => {
      if (track.audioFile) filesToUpload.push({ name: `audio-${i}-${Date.now()}-${track.audioFile.name.replace(/[^a-zA-Z0-9.-]/g, '')}`, file: track.audioFile, setter: (url) => trackAudioUrls[i] = url });
      if (track.coverLicenseFile) filesToUpload.push({ name: `license-${i}-${Date.now()}-${track.coverLicenseFile.name.replace(/[^a-zA-Z0-9.-]/g, '')}`, file: track.coverLicenseFile, setter: (url) => trackLicenseUrls[i] = url });
    });

    if (filesToUpload.length === 0) return { artworkUrl, trackAudioUrls, trackLicenseUrls };

    let completedFiles = 0;
    for (const item of filesToUpload) {
      const res = await upload(item.name, item.file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        onUploadProgress: (e) => {
          const fileProgress = (e.loaded / e.total);
          const overallProgress = Math.round(((completedFiles + fileProgress) / filesToUpload.length) * 100);
          setUploadProgress(overallProgress);
        }
      });
      item.setter(res.url);
      completedFiles++;
    }
    setUploadProgress(100);
    return { artworkUrl, trackAudioUrls, trackLicenseUrls };
  }

  async function verifyAndUpdateRelease(payload: any) {
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    const response = await fetch("/api/distribution/update-release", {
      method: "POST",
      body: formData
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
        upcCode: release.releasePreviouslyReleased ? release.upcCode.trim() : undefined,
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
        publishingRights: release.copyrightOwner,
        youtubeContentIdEnabled,
        youtubeContentIdChannelUrl,
        monetisationAccepted: socialConsentAccepted,
        monetisationClauses,
        legal,
        paymentModel: selectedPlan === "one_time" ? "one_time" : "subscription",
        plan: selectedPlan,
        artworkFileKey: "artwork",
        existingArtworkUrl: initialRelease?.artworkUrl ?? undefined,
        uploadedArtworkUrl: uploaded.artworkUrl,
        tracks: tracks.map((track, index) => ({
          trackTitle: track.trackTitle,
          isrc: release.releasePreviouslyReleased ? track.existingIsrcCode.trim() : undefined,
          version: track.versionPreset === "Other" ? track.customVersion : track.versionPreset,
          trackNumber: index + 1,
          primaryArtist: namesFor(track.primaryArtistIds.slice(0, 1)) || track.primaryArtistQuery.trim() || initialRelease?.artistName || "",
          featuredArtists: track.featuredArtists.trim() || undefined,
          additionalPrimaryArtists: track.remixers.trim() || undefined,
          songwriters: contributorNames(track.songwriters),
          composers: contributorNames(track.composers),
          producers: contributorNames(track.producers),
          contributors: [...contributorCredits("songwriter", track.songwriters), ...contributorCredits("composer", track.composers), ...contributorCredits("producer", track.producers)],
          isCover: track.isCover,
          originalArtist: track.originalArtist,
          originalTrackLink: track.originalTrackLink,
          coverLicenseConfirmed: track.coverLicenseFile ? true : track.existingCoverLicenseConfirmed,
          coverLicenseFileKey: track.coverLicenseFile ? `cover-license-${index}` : undefined,
          existingCoverLicenseConfirmed: track.existingCoverLicenseConfirmed,
          existingAudioUrl: track.existingAudioUrl || undefined,
          audioFileKey: `audio-${index}`,
          duration: track.duration,
          explicitContent: track.explicitContent,
          dolbyAtmos: track.dolbyAtmos,
          metadata: { titleLanguage: track.titleLanguage },
          artistProfileIds: track.primaryArtistIds,
          uploadedAudioUrl: uploaded.trackAudioUrls[index],
          uploadedCoverLicenseUrl: uploaded.trackLicenseUrls[index]
        }))
      }
    };

    return await verifyAndUpdateRelease(payload);
  }
  async function verifyAndSubmitRelease(payload: any) {
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    const response = await fetch("/api/distribution/payment/verify-submit", {
      method: "POST",
      body: formData
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
          upcCode: release.releasePreviouslyReleased ? release.upcCode.trim() : undefined,
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
          publishingRights: initialRelease?.publishingRights ?? release.copyrightOwner,
          youtubeContentIdEnabled,
          youtubeContentIdChannelUrl,
          monetisationAccepted: socialConsentAccepted,
          monetisationClauses,
          legal,
          paymentModel: selectedPlan === "one_time" ? "one_time" : "subscription",
          plan: selectedPlan,
          artworkFileKey: "artwork",
          existingArtworkUrl: initialRelease?.artworkUrl ?? undefined,
          uploadedArtworkUrl: uploaded.artworkUrl,
          tracks: tracks.map((track, index) => ({
            trackTitle: track.trackTitle,
            isrc: release.releasePreviouslyReleased ? track.existingIsrcCode.trim() : undefined,
            version: track.versionPreset === "Other" ? track.customVersion : track.versionPreset,
            trackNumber: index + 1,
            primaryArtist: namesFor(track.primaryArtistIds.slice(0, 1)) || track.primaryArtistQuery.trim() || initialRelease?.artistName || "",
            featuredArtists: track.featuredArtists.trim() || undefined,
            additionalPrimaryArtists: track.remixers.trim() || undefined,
            songwriters: contributorNames(track.songwriters),
            composers: contributorNames(track.composers),
            producers: contributorNames(track.producers),
            contributors: [...contributorCredits("songwriter", track.songwriters), ...contributorCredits("composer", track.composers), ...contributorCredits("producer", track.producers)],
            isCover: track.isCover,
            originalArtist: track.originalArtist,
            originalTrackLink: track.originalTrackLink,
            coverLicenseConfirmed: Boolean(track.coverLicenseFile || track.existingCoverLicenseConfirmed),
            coverLicenseFileKey: track.coverLicenseFile ? `cover-license-${index}` : undefined,
            existingCoverLicenseConfirmed: track.existingCoverLicenseConfirmed,
            existingAudioUrl: track.existingAudioUrl || undefined,
            audioFileKey: `audio-${index}`,
            duration: track.duration,
            explicitContent: track.explicitContent,
            dolbyAtmos: track.dolbyAtmos,
            metadata: { titleLanguage: track.titleLanguage },
            artistProfileIds: track.primaryArtistIds,
            uploadedAudioUrl: uploaded.trackAudioUrls[index],
            uploadedCoverLicenseUrl: uploaded.trackLicenseUrls[index]
          }))
        }
      };

      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));

      const response = await fetch("/api/distribution/save-draft", {
        method: "POST",
        body: formData
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
      setStatus(error instanceof Error ? error.message : "Could not save draft.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRelease(orderId: string, paymentId: string, signature: string) {
    setStatus("Uploading files...");
    const uploaded = await uploadFilesDirectly();
    setStatus("Submitting release...");

    const payload = {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      metadata: {
        artistName: primaryArtistName,
        releaseTitle: displayedReleaseTitle,
        releaseType,
        releasePreviouslyReleased: release.releasePreviouslyReleased,
        upcCode: release.releasePreviouslyReleased ? release.upcCode.trim() : undefined,
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
        youtubeContentIdEnabled,
        youtubeContentIdChannelUrl,
        monetisationAccepted: socialConsentAccepted,
        monetisationClauses,
        legal,
        paymentModel: selectedPlan === "one_time" ? "one_time" : "subscription",
        plan: selectedPlan,
        artworkFileKey: "artwork",
        uploadedArtworkUrl: uploaded.artworkUrl,
        tracks: tracks.map((track, index) => ({
          trackTitle: track.trackTitle,
          isrc: release.releasePreviouslyReleased ? track.existingIsrcCode.trim() : undefined,
          version: track.versionPreset === "Other" ? track.customVersion : track.versionPreset,
          trackNumber: index + 1,
          primaryArtist: namesFor(track.primaryArtistIds.slice(0, 1)) || track.primaryArtistQuery.trim() || initialRelease?.artistName || "",
          featuredArtists: track.featuredArtists.trim() || undefined,
          additionalPrimaryArtists: track.remixers.trim() || undefined,
          songwriters: contributorNames(track.songwriters),
          composers: contributorNames(track.composers),
          producers: contributorNames(track.producers),
          contributors: [...contributorCredits("songwriter", track.songwriters), ...contributorCredits("composer", track.composers), ...contributorCredits("producer", track.producers)],
          isCover: track.isCover,
          originalArtist: track.originalArtist,
          originalTrackLink: track.originalTrackLink,
          coverLicenseConfirmed: Boolean(track.coverLicenseFile),
          coverLicenseFileKey: track.coverLicenseFile ? `cover-license-${index}` : undefined,
          audioFileKey: `audio-${index}`,
          duration: track.duration,
          explicitContent: track.explicitContent,
          dolbyAtmos: track.dolbyAtmos,
          metadata: { titleLanguage: track.titleLanguage },
          artistProfileIds: track.primaryArtistIds,
          uploadedAudioUrl: uploaded.trackAudioUrls[index],
          uploadedCoverLicenseUrl: uploaded.trackLicenseUrls[index]
        }))
      }
    };

    return await verifyAndSubmitRelease(payload);
  }

  async function handleFinalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationIssues.length > 0) {
      const issue = validationIssues[0];
      setValidationErrorKeys(new Set(validationIssues.map((item) => item.key)));
      setAttemptedStep(issue.step);
      setStatus(`${validationIssues.length} validation issue${validationIssues.length === 1 ? "" : "s"} found. Fix the highlighted fields before paying.`);
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

      const orderResponse = await fetch("/api/distribution/payment/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: selectedPlan, paymentModel: selectedPlan === "one_time" ? "one_time" : "subscription", trackCount: tracks.length, releaseType, platforms, youtubeContentIdEnabled }) });
      const orderData = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(orderData.error || "Unable to create payment order.");

      const RazorpayCheckout = window.Razorpay;
      if (!RazorpayCheckout || String(orderData.key).startsWith("dev_")) {
        const paymentId = `dev_dist_payment_${Date.now()}`;
        const data = await submitRelease(orderData.orderId, paymentId, `dev:${orderData.orderId}:${paymentId}`);
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
          handler: async (response: { razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              const data = await submitRelease(orderData.orderId, response.razorpay_payment_id, response.razorpay_signature);
              setSubmittedRelease(data.release);
              setUploadProgress(100);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          modal: { ondismiss: () => reject(new Error("Checkout cancelled.")) },
          theme: { color: "#7db7ff" }
        });
        razorpay.open();
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    tracks.forEach((track) => { safeRevokePreviewUrl(track.audioPreviewUrl); });
    if (artworkPreview) safeRevokePreviewUrl(artworkPreview);
    setStep(initialRelease ? 4 : 0); setStepMotion("step-adjacent-forward"); setMobileStepMenuOpen(false); setExpandedTrack(0); setSubmitting(false); setUploadProgress(0); setStatus(null); setAttemptedStep(null); setArtworkFile(null); setArtworkPreview(initialRelease?.artworkUrl ?? null); setArtworkDimensions(null); setArtworkError(null); setArtworkWarning(null); setArtworkScanning(false); setMonetisationModalOpen(false); setLegalModalOpen(false); setYoutubeContentIdModalOpen(false); setDraftReleaseId(initialRelease?.status === "draft" ? initialRelease.id : null); setSocialConsentAccepted(initialRelease?.monetisationAccepted ?? (initialRelease?.platforms?.length ? socialPlatformSelected(initialRelease.platforms) : true)); setMonetisationClauses(() => { const base = createMonetisationClauseState(); if (!initialRelease?.monetisationClauses) return base; return { ...base, ...Object.fromEntries(Object.entries(initialRelease.monetisationClauses).filter(([key]) => key in base)) } as MonetisationClauseState; }); setYoutubeContentIdEnabled(Boolean(initialRelease?.youtubeContentIdEnabled)); setYoutubeContentIdChannelUrl(initialRelease?.youtubeContentIdChannelUrl ?? ""); setPlatforms(initialRelease?.platforms?.length ? initialRelease.platforms : defaultStorePlatforms); setTracks(createTracksFromRelease(initialRelease)); setRelease(createInitialReleaseDraft(initialRelease, minimumScheduledDate)); setLegal(createInitialLegalState(initialRelease)); setSubmittedRelease(null);
  }

  if (submittedRelease) {
    return <SuccessState release={submittedRelease} onReset={isEditing ? () => router.push("/distribution") : resetForm} title={isEditing ? "Your changes are back in review" : undefined} resetLabel={isEditing ? "Back to catalogue" : undefined} />;
  }
  return (
    <>
      <form onSubmit={handleFinalSubmit} className="grid gap-6 rounded-[2rem] border p-4 md:p-6 lg:p-8" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="grid gap-4 md:gap-5 lg:grid-cols-[0.95fr,1.05fr]">
          {/* Plan card removed per request */}
        </div>
        <div className="md:hidden rounded-[1.3rem] border p-3 md:p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 md:px-4 py-2.5 md:py-3 text-left transition-all"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
            onClick={() => setMobileStepMenuOpen((current) => !current)}
            aria-expanded={mobileStepMenuOpen}
          >
            <div>
              <p className="text-[10px] md:text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>
                Stage {step + 1} of {steps.length}
              </p>
              <p className="mt-1 text-sm md:text-base font-semibold" style={{ color: "var(--text)" }}>
                {steps[step]}
              </p>
            </div>
            <ChevronDown className={clsx("h-4 w-4 md:h-5 md:w-5 transition-transform flex-shrink-0", mobileStepMenuOpen ? "rotate-180" : "")} style={{ color: "var(--text-soft)" }} />
          </button>

          <div
            className={clsx(
              "grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out",
              mobileStepMenuOpen ? "mt-3 grid-rows-[1fr] opacity-100 translate-y-0" : "mt-0 grid-rows-[0fr] opacity-0 -translate-y-1"
            )}
            aria-hidden={!mobileStepMenuOpen}
          >
            <div className={clsx("overflow-hidden border-t", mobileStepMenuOpen ? "pt-3" : "pt-0")} style={{ borderColor: "var(--border)" }}>
              <div className="grid gap-2">
              {steps.map((label, index) => {
                const buttonState = stepButtonStyles(index);
                return (
                  <button
                    key={`mobile-${label}`}
                    type="button"
                    onClick={() => jumpToStep(index)}
                    className={clsx(buttonState.className, "text-left py-2.5 md:py-3 px-3 md:px-4")}
                    style={buttonState.style}
                  >
                    <span className="flex items-center gap-2">{buttonState.validity === "invalid" ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}{label}</span>
                  </button>
                );
              })}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden gap-2 md:grid md:grid-cols-5">{steps.map((label, index) => {
          const buttonState = stepButtonStyles(index);
          return (
            <button
              key={label}
              type="button"
              onClick={() => jumpToStep(index)}
              className={buttonState.className}
              style={buttonState.style}
            >
              <span className="flex items-center justify-center gap-2">{buttonState.validity === "invalid" ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}{label}</span>
            </button>
          );
        })}</div>
        {step === 1 ? <div className="card-base mb-5"><p className="text-sm font-semibold">Already released?</p><p className="mt-1 text-sm" style={{color:"var(--text-muted)"}}>Use this if the release was previously distributed and already has official UPC/ISRC identifiers.</p><div className="mt-4 flex gap-3">{[true,false].map(value=><button key={String(value)} type="button" className={release.releasePreviouslyReleased===value?"btn-primary":"btn-outline"} onClick={()=>{setRelease(current=>({...current,releasePreviouslyReleased:value,...(!value?{upcCode:"",existingIsrcCode:""}: {})}));if(!value)setTracks(current=>current.map(track=>({...track,existingIsrcCode:""})));}}>{value?"Yes":"No"}</button>)}</div>{release.releasePreviouslyReleased?<div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm">Release UPC Code<input ref={registerField("existing-upc")} className={fieldClass("existing-upc",Boolean(showErrors&&releaseInfoIssue()?.key==="existing-upc"))} inputMode="numeric" value={release.upcCode} onChange={e=>setRelease(c=>({...c,upcCode:e.target.value.replace(/\D/g,"")}))} placeholder="12–13 digits"/></label><div ref={registerField("existing-isrc")} className="grid gap-3">{tracks.map((track,index)=><label key={`${track.id}-isrc`} className="grid gap-2 text-sm"><span>{`Track ${index+1} — ${track.trackTitle||"Untitled track"}`}</span><input className={fieldClass(`track-${index}-isrc`,Boolean(showErrors&&releaseInfoIssue()?.key==="existing-isrc"&&!track.existingIsrcCode.trim()))} value={track.existingIsrcCode} onChange={e=>updateTrack(index,{existingIsrcCode:e.target.value.toUpperCase()})} placeholder="Existing ISRC Code"/></label>)}</div></div>:null}</div> : null}
        {step === 0 ? <section className={clsx("grid gap-4 md:gap-5", stepMotion)}><div className="rounded-[1.5rem] border p-4 md:p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}><div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between"><div><h3 className="text-lg md:text-2xl font-semibold" style={{ color: "var(--text)" }}>Build the release one track at a time</h3><p className="mt-2 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>Singles, EPs, and albums are derived automatically from how many tracks you add.</p></div><div className="rounded-[1.2rem] border px-3 md:px-4 py-2 md:py-3 text-sm w-fit" style={{ borderColor: "var(--border)", background: "var(--card)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}><p className="text-xs md:text-sm font-medium" style={{ color: "var(--text)" }}>{releaseType === "single" ? "Single" : releaseType === "ep" ? "EP" : "Album"}</p><p className="text-xs" style={{ color: "var(--text-soft)" }}>{tracks.length} track{tracks.length > 1 ? "s" : ""}</p></div></div></div>
          {tracks.map((track, index) => { const expanded = expandedTrack === index; const issue = showErrors ? trackIssue(track, index) : null; return <div key={track.id} className="rounded-[1.7rem] border p-4 md:p-5 transition-all duration-300" style={{ borderColor: issue ? "rgba(248,113,113,0.4)" : "var(--border)", background: "var(--card)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}><button type="button" className={clsx("group pressable accordion-trigger flex w-full items-center justify-between gap-3 md:gap-4 rounded-[1.25rem] border px-3 md:px-4 py-3 md:py-4 text-left transition-all", expanded ? "is-open" : "")} onClick={() => setExpandedTrack((current) => (current === index ? -1 : index))} aria-expanded={expanded} style={expanded ? { borderColor: "var(--accent)", background: "linear-gradient(135deg, rgba(89,223,224,0.1), rgba(89,223,224,0.04))" } : { borderColor: "var(--border)" }}><div className="min-w-0"><p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Track {index + 1}</p><h3 className="mt-1 md:mt-2 truncate text-base md:text-2xl font-semibold" style={{ color: "var(--text)" }}>{track.trackTitle || "Untitled track"}</h3><p className="mt-1 md:mt-2 truncate text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>{namesFor(track.primaryArtistIds) || track.primaryArtistQuery || "No primary artist selected yet"}</p></div><span className={clsx("inline-flex items-center gap-1 md:gap-2 rounded-full border px-2 md:px-3 py-1 text-[10px] md:text-xs uppercase tracking-[0.18em] transition duration-300 flex-shrink-0", expanded ? "bg-[color-mix(in_srgb,var(--card)_82%,var(--text)_10%)]" : "")} style={{ borderColor: "var(--border)", color: expanded ? "var(--text)" : "var(--text-soft)" }}>{expanded ? "Collapse" : "Expand"}<ChevronDown className={clsx("h-3 w-3 md:h-3.5 md:w-3.5 transition-transform duration-300", expanded ? "rotate-180" : "")} /></span></button>
          <div className={clsx("grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out", expanded ? "grid-rows-[1fr] opacity-100 translate-y-0" : "grid-rows-[0fr] opacity-0 -translate-y-1")} aria-hidden={!expanded}><div className="overflow-hidden"><div className="mt-4 md:mt-6 grid gap-4 md:gap-6"><div className="grid gap-3 md:gap-4 md:grid-cols-2"><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Track title</label><input ref={registerField(`track-${index}-title`)} className={fieldClass(`track-${index}-title`, Boolean(showErrors && issue?.key === `track-${index}-title`))} value={track.trackTitle} onChange={(event) => updateTrack(index, { trackTitle: event.target.value })} placeholder="Track title" /></div><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Version</label><select className={fieldClass(`track-${index}-version`, Boolean(showErrors && issue?.key === `track-${index}-version`))} value={track.versionPreset} onChange={(event) => updateTrack(index, { versionPreset: event.target.value, customVersion: event.target.value === "Other" ? track.customVersion : "" })}>{versionOptions.map((option) => <option key={option}>{option}</option>)}</select>{track.versionPreset === "Other" ? <input className={clsx("field mt-3", showErrors && issue?.key === `track-${index}-version` ? "field-invalid" : "", shakingField === `track-${index}-version` ? "field-shake" : "")} value={track.customVersion} placeholder="Custom version label" onChange={(event) => updateTrack(index, { customVersion: event.target.value })} /> : null}</div></div>
          <div ref={registerField(`track-${index}-artists`)} className={clsx(showErrors && issue?.key === `track-${index}-artists` ? "field-shake" : "") }><div className="grid gap-3 md:gap-4 lg:grid-cols-3"><ArtistPicker label="Primary Artist" helper="Max 3 artists" valueIds={profilesFor(track.primaryArtistIds)} query={track.primaryArtistQuery} max={3} required={showErrors && issue?.key === `track-${index}-artists`} onQueryChange={(value) => updateTrack(index, { primaryArtistQuery: value })} onSelect={(profile) => { upsertKnownProfile(profile); updateTrack(index, { primaryArtistIds: track.primaryArtistIds.includes(profile.id) ? track.primaryArtistIds : [...track.primaryArtistIds, profile.id], primaryArtistQuery: "" }); }} onRemove={(profileId) => updateTrack(index, { primaryArtistIds: track.primaryArtistIds.filter((id) => id !== profileId) })} /><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Featured artists</label><input className="field" value={track.featuredArtists} onChange={(event) => updateTrack(index, { featuredArtists: event.target.value })} placeholder="Featured artist names only" /><p className="mt-2 text-[11px]" style={{ color: "var(--text-soft)" }}>Text only. No profile creation.</p></div><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Remixer</label><input className="field" value={track.remixers} onChange={(event) => updateTrack(index, { remixers: event.target.value })} placeholder="Remixer names only" /><p className="mt-2 text-[11px]" style={{ color: "var(--text-soft)" }}>Text only. No profile creation.</p></div></div></div>
            <div ref={registerField(`track-${index}-contributors`)} className={clsx("rounded-[1.25rem] border p-3 md:p-4", showErrors && issue?.key === `track-${index}-contributors` ? "field-shake" : "")} style={{ borderColor: contributorsValid(track.songwriters) && contributorsValid(track.composers) && contributorsValid(track.producers) ? "color-mix(in srgb, var(--accent) 24%, var(--border))" : "rgba(250,204,21,0.38)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 5%, var(--bg-soft)), var(--bg-soft))" }}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs md:text-sm font-semibold" style={{ color: "var(--text)" }}>Contributors</p>
                    <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>{track.songwriters.length + track.composers.length + track.producers.length} credits</span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {[
                      { label: "Songwriters", short: "S", entries: track.songwriters },
                      { label: "Composers", short: "C", entries: track.composers },
                      { label: "Producers", short: "P", entries: track.producers }
                    ].map(({ label, short, entries }) => {
                      const names = contributorNames(entries);
                      const complete = contributorsValid(entries);
                      return (
                        <div key={label} className="rounded-xl border px-3 py-2" style={{ borderColor: complete ? "var(--border)" : "rgba(250,204,21,0.38)", background: "var(--card)" }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>{label}</span>
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold" style={{ background: complete ? "rgba(34,197,94,0.14)" : "rgba(250,204,21,0.14)", color: complete ? "#86efac" : "#fde68a" }}>{short}</span>
                          </div>
                          <p className="mt-1 truncate text-sm font-medium" style={{ color: names ? "var(--text)" : "var(--text-soft)" }}>{names || "Pending legal name"}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button type="button" className="btn-outline pressable w-fit px-3 py-2 text-xs md:text-sm" onClick={() => openContributors(index)}>Edit credits</button>
              </div>
            </div>
          <div ref={registerField(`track-${index}-audio`)} className="grid gap-3 rounded-[1.3rem] border p-3 md:grid-cols-[0.9fr,1.1fr]" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><UploadDropzone accept="audio/*,.wav,.mp3,.flac" title="Audio upload" description="Drop the master audio here" helperLines={["Direct-to-storage", "WAV/FLAC preferred", "Resumable for large files"]} fileName={track.audioFile?.name || track.audioFileName} fileFormat={fileFormat(track.audioFile, track.audioFileName)} fileSize={formatFileSize(track.audioFile?.size)} error={showErrors && issue?.key === `track-${index}-audio` ? issue.message : null} onSelect={async (file, controls) => { await handleAudioFile(index, file, controls); }} /><div className="rounded-[1.1rem] border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}><AudioWaveform src={track.audioPreviewUrl} title={track.trackTitle || `Track ${index + 1} preview`} subtitle={[track.duration, fileFormat(track.audioFile, track.audioFileName), formatFileSize(track.audioFile?.size)].filter(Boolean).join(" • ") || "Upload audio to preview"} compact /></div></div>
          <div className="grid gap-3 md:gap-4 md:grid-cols-3"><div ref={registerField(`track-${index}-title-language`)}><SearchableSelect label="Track Title Language" value={track.titleLanguage} options={languageOptions} placeholder="Select title language" onChange={(value) => updateTrack(index, { titleLanguage: value })} /></div><label className="flex items-center gap-2 md:gap-3 rounded-xl border px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}><input type="checkbox" checked={track.explicitContent} onChange={(event) => updateTrack(index, { explicitContent: event.target.checked })} />Explicit</label><label className="flex items-center gap-2 md:gap-3 rounded-xl border px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}><input type="checkbox" checked={track.dolbyAtmos} onChange={(event) => updateTrack(index, { dolbyAtmos: event.target.checked })} />Dolby Atmos</label></div>
          <label className="flex items-center gap-2 md:gap-3 rounded-xl border px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}><input type="checkbox" checked={track.isCover} onChange={(event) => updateTrack(index, { isCover: event.target.checked, originalArtist: event.target.checked ? track.originalArtist : "", originalTrackLink: event.target.checked ? track.originalTrackLink : "", coverLicenseFile: event.target.checked ? track.coverLicenseFile : null, coverLicenseFileName: event.target.checked ? track.coverLicenseFileName : "" })} />This is a cover song</label>
          {track.isCover ? <div className="grid gap-3 md:gap-4 md:grid-cols-2"><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Original artist name</label><input ref={registerField(`track-${index}-original-artist`)} className={fieldClass(`track-${index}-original-artist`, Boolean(showErrors && issue?.key === `track-${index}-original-artist`))} value={track.originalArtist} onChange={(event) => updateTrack(index, { originalArtist: event.target.value })} /></div><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Original track link</label><input ref={registerField(`track-${index}-original-link`)} className={fieldClass(`track-${index}-original-link`, Boolean(showErrors && issue?.key === `track-${index}-original-link`))} value={track.originalTrackLink} onChange={(event) => updateTrack(index, { originalTrackLink: event.target.value })} placeholder="Spotify, YouTube, or store link" /></div><div className="md:col-span-2" ref={registerField(`track-${index}-cover-license`)}><UploadDropzone accept="application/pdf" title="License proof" description="Upload the PDF rights or license document" helperLines={["PDF only", "Required for cover songs"]} fileName={track.coverLicenseFileName} error={showErrors && issue?.key === `track-${index}-cover-license` ? issue.message : null} onSelect={async (file) => { handleCoverLicense(index, file); }} /></div></div> : null}
          {tracks.length > 1 ? <button type="button" className="btn-outline pressable max-w-max text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-3" onClick={() => removeTrack(index)}>Remove track</button> : null}</div></div></div></div>; })}
          <button type="button" className="btn-outline pressable hover-lift max-w-max text-xs md:text-sm py-2 md:py-2.5 px-3 md:px-4" onClick={addTrack}>+ Add another track</button></section> : null}
        {step === 1 ? <section className={clsx("grid gap-5 md:grid-cols-[1.1fr,0.9fr]", stepMotion)}><div className="grid gap-5">{requiresReleaseTitle ? <div><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>{releaseType === "ep" ? "EP Name" : "Album Name"}</label><input ref={registerField("release-title")} className={fieldClass("release-title", Boolean(showErrors && releaseInfoIssue()?.key === "release-title"))} value={release.releaseTitle} onChange={(event) => setRelease((current) => ({ ...current, releaseTitle: event.target.value }))} placeholder={releaseType === "ep" ? "Enter EP name" : "Enter album name"} /></div> : <div className="rounded-[1.4rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Single release</p><p className="mt-3 text-lg font-semibold" style={{ color: "var(--text)" }}>No extra release title needed</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>We&apos;ll use the first track title as the release title for this single.</p></div>}
        <div><label className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-muted)" }}>Label{!customLabelAllowed ? <span className="group relative inline-flex" title="Only available for Yearly+ Plan. Upgrade to use a custom label name."><Crown className="h-4 w-4" style={{ color: "#facc15" }} /><span className="pointer-events-none absolute left-0 top-6 z-20 hidden w-64 rounded-xl border p-3 text-xs shadow-xl group-hover:block" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>Only available for Yearly+ Plan. Upgrade to use a custom label name.</span></span> : null}</label><input ref={registerField("record-label")} disabled={!customLabelAllowed} className={fieldClass("record-label", Boolean(showErrors && releaseInfoIssue()?.key === "record-label"))} value={release.recordLabelName} onChange={(event) => setRelease((current) => ({ ...current, recordLabelName: event.target.value }))} placeholder="HYMN Music or your imprint" /><p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>{customLabelAllowed ? "Yearly+ custom label enabled." : "HYMN label delivery is included. Custom labels unlock on Yearly+."}</p></div>
        <div ref={registerField("genre-picker") as (node: HTMLDivElement | null) => void} className={clsx(showErrors && releaseInfoIssue()?.key === "genre-picker" ? "field-shake" : "") }><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Genre + subgenre</label><GenreSelector genre={release.primaryGenre} subgenre={release.secondaryGenre} onChange={(genre, subgenre) => setRelease((current) => ({ ...current, primaryGenre: genre, secondaryGenre: subgenre }))} error={Boolean(showErrors && releaseInfoIssue()?.key === "genre-picker")} /></div>
        <div ref={registerField("mood") as (node: HTMLDivElement | null) => void}>
          <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Mood</label>
          <select required className={clsx("field", showErrors && releaseInfoIssue()?.key === "mood" && "field-shake")} value={release.mood} onChange={(event) => setRelease((current) => ({ ...current, mood: event.target.value }))}>
            <option value="">Select mood</option>
            {moodGroups.map(([group, moods]) => <optgroup key={group} label={group}>{moods.map((mood) => <option key={mood} value={mood}>{mood}</option>)}</optgroup>)}
          </select>
          <p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Choose the mood that best describes the sound and emotional direction of this release.</p>
        </div>
        <div ref={registerField("language") as (node: HTMLDivElement | null) => void}><SearchableSelect label="Language" value={release.language} options={languageOptions} placeholder="Select release language" invalid={Boolean(showErrors && releaseInfoIssue()?.key === "language")} onChange={(value) => setRelease((current) => ({ ...current, language: value }))} /></div></div>
        <div className="grid gap-5"><div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Release timing</p><div className="mt-4 grid gap-3"><button type="button" className="pressable hover-lift rounded-[1.2rem] border p-4 text-left" style={release.releaseTiming === "quick_release" ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : { borderColor: "var(--border)", background: "var(--card)" }} onClick={() => setRelease((current) => ({ ...current, releaseTiming: "quick_release" }))}><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Release as soon as possible</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Estimated release date: {quickReleaseDate} after review and delivery.</p></button><button type="button" className="pressable hover-lift rounded-[1.2rem] border p-4 text-left" style={release.releaseTiming === "schedule_release" ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : { borderColor: "var(--border)", background: "var(--card)" }} onClick={() => setRelease((current) => ({ ...current, releaseTiming: "schedule_release" }))}><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Schedule release date</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Earliest clean delivery window: {minimumScheduledDate}</p></button><div className="rounded-[1.2rem] border p-4 opacity-70" style={{ borderColor: "var(--border)", background: "var(--card)" }}><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Pre-save / pre-order</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Available when a scheduled date is selected and partner support is confirmed.</p></div></div>{release.releaseTiming === "schedule_release" ? <div className="mt-4"><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Scheduled release date</label><input ref={registerField("release-date")} className={fieldClass("release-date", Boolean(showErrors && releaseInfoIssue()?.key === "release-date"))} type="date" min={minimumScheduledDate} value={release.scheduledReleaseDate} onChange={(event) => setRelease((current) => ({ ...current, scheduledReleaseDate: event.target.value }))} /><p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Allow at least 20 days for metadata review, DSP ingestion, and pre-release checks.</p></div> : <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>HYMN review usually starts within {queue?.averageApprovalTime ?? "36-48 hours"} before store delivery.</p>}</div>
        <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Release summary</p><div className="mt-4 grid gap-3 text-sm" style={{ color: "var(--text-muted)" }}><div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}><span>Release type</span><span style={{ color: "var(--text)" }}>{releaseType === "single" ? "Single" : releaseType === "ep" ? "EP" : "Album"}</span></div><div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}><span>Tracks</span><span style={{ color: "var(--text)" }}>{tracks.length}</span></div><div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}><span>Live title</span><span style={{ color: "var(--text)" }}>{displayedReleaseTitle}</span></div></div></div></div></section> : null}
        {step === 2 ? <section className={clsx("grid gap-4 md:gap-5 lg:grid-cols-[0.8fr,1.2fr]", stepMotion)}><div ref={registerField("artwork-upload") as (node: HTMLDivElement | null) => void}><ArtworkSquareDropzone previewUrl={artworkPreview} fileName={artworkFile?.name} fileType={fileFormat(artworkFile)} dimensions={artworkDimensions} error={showErrors && artworkIssue() ? artworkIssue()?.message ?? null : artworkError} onSelect={async (file) => { await handleArtwork(file); }} />{artworkScanning ? <p className="mt-3 text-xs md:text-sm" style={{ color: "var(--text-soft)" }}>Scanning artwork for excessive text...</p> : null}{artworkWarning ? <ArtworkWarning warning={artworkWarning} /> : null}</div><div className="card-base"><p className="text-uppercase-medium" style={{ color: "var(--text-soft)" }}>Artwork requirements</p><div className="mt-3 md:mt-4 grid gap-2 md:gap-3 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}><div className="summary-card">Minimum 3000 x 3000 pixels</div><div className="summary-card">JPG/PNG only</div><div className="summary-card">Square cover artwork</div><div className="summary-card">No blurry, stretched, copyrighted, explicit, or misleading artwork</div></div>{artworkPreview && !artworkError ? <div className="mt-4 rounded-xl border p-3 text-sm" style={{ borderColor: "rgba(34,197,94,0.35)", background: "rgba(34,197,94,0.08)", color: "var(--text)" }}><div className="flex items-center justify-between gap-3"><span>Validation status</span><span style={{ color: "#86efac" }}>Passed</span></div><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>{[artworkDimensions, fileFormat(artworkFile)].filter(Boolean).join(" • ") || "Existing artwork preview"}</p></div> : null}</div></section> : null}
        {step === 3 ? (
          <section className={clsx("grid gap-6", stepMotion)}>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
              <div className="grid gap-6">
                <div ref={registerField("store-selection") as (node: HTMLDivElement | null) => void} className={clsx("rounded-[1.5rem] border p-5", showErrors && destinationsIssue()?.key === "store-selection" ? "field-shake" : "")} style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Selected Stores</p>
                      <h3 className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{storeSelections.length} Selected</h3>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{storeSelections.length > 0 ? storeSelections.join(", ") : "Choose at least one store for delivery."}</p>
                    </div>
                    <span className="rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]" style={{ borderColor: "rgba(89,223,224,0.35)", background: "var(--accent-soft)", color: "var(--text)" }}>
                      150+ Additional Stores Included
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {storePlatforms.map((platform) => {
                      const active = platforms.includes(platform.name);
                      return (
                        <button
                          key={platform.name}
                          type="button"
                          className={clsx("pressable group flex min-h-[96px] w-full items-center gap-4 rounded-2xl border p-4 text-left transition duration-200 hover:-translate-y-0.5", !active && "opacity-65")}
                          style={active ? { borderColor: "var(--accent)", background: "linear-gradient(180deg, rgba(89,223,224,0.12), rgba(89,223,224,0.035))", color: "var(--text)", boxShadow: "0 18px 48px rgba(89,223,224,0.08)" } : { borderColor: "var(--border)", background: "transparent", color: "var(--text-muted)" }}
                          onClick={() => togglePlatform(platform.name, "store")}
                          aria-pressed={active}
                        >
                          <span className="flex h-14 w-32 shrink-0 items-center justify-center px-2">
                            <PlatformLogo platform={platform.name} className="max-h-10 w-auto max-w-[136px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold" style={{ color: "var(--text)" }}>{platform.name}</span>
                            <span className="mt-1 block text-xs" style={{ color: "var(--text-soft)" }}>{active ? "Selected for delivery" : "Tap to include"}</span>
                          </span>
                          {active ? <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "var(--accent)" }} /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div ref={registerField("social-confirmation") as (node: HTMLDivElement | null) => void} className={clsx("rounded-[1.5rem] border p-5", showErrors && destinationsIssue()?.key === "social-confirmation" ? "field-shake" : "")} style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Social Monetization</p>
                      <h3 className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>Unlock UGC platforms</h3>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>These options unlock after monetization is enabled.</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-3 rounded-full border px-4 py-2.5 text-left text-sm font-semibold transition hover:-translate-y-0.5"
                      style={socialConsentAccepted ? { borderColor: "rgba(34,197,94,0.45)", background: "rgba(34,197,94,0.13)", color: "var(--text)" } : { borderColor: "var(--border)", background: "var(--card)", color: "var(--text-soft)" }}
                      onClick={() => {
                        if (socialConsentAccepted) {
                          setSocialConsentAccepted(false);
                          setPlatforms((current) => current.filter((item) => !socialPlatforms.some((platform) => platform.name === item)));
                          setYoutubeContentIdEnabled(false);
                          setYoutubeContentIdChannelUrl("");
                          setYoutubeContentIdModalOpen(false);
                          setMonetisationClauses(createMonetisationClauseState());
                        } else {
                          setMonetisationModalOpen(true);
                        }
                      }}
                      aria-pressed={socialConsentAccepted}
                    >
                      <span>Monetization</span>
                      <span className="relative inline-flex h-6 w-11 items-center rounded-full border transition" style={socialConsentAccepted ? { borderColor: "rgba(34,197,94,0.55)", background: "rgba(34,197,94,0.42)" } : { borderColor: "var(--border)", background: "rgba(255,255,255,0.06)" }}>
                        <span className="inline-block h-4 w-4 rounded-full transition-transform" style={{ background: socialConsentAccepted ? "#bbf7d0" : "var(--text-soft)", transform: socialConsentAccepted ? "translateX(22px)" : "translateX(4px)" }} />
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    {socialPlatforms.map((platform) => {
                      const active = platforms.includes(platform.name);
                      const locked = !socialConsentAccepted;
                      const isSocialCombo = platform.name === "Instagram / Facebook";
                      const iconClass = isSocialCombo ? "h-9 w-auto max-w-[96px]" : "max-h-9 w-auto max-w-[96px]";

                      return (
                        <button
                          key={platform.name}
                          type="button"
                          disabled={locked}
                          className={clsx("pressable group relative flex h-20 w-28 items-center justify-center rounded-[1.35rem] border p-4 transition duration-200", locked ? "cursor-not-allowed opacity-50 grayscale" : "hover:-translate-y-0.5")}
                          style={active && !locked ? { borderColor: "var(--accent)", background: "rgba(89,223,224,0.12)", boxShadow: "0 0 30px rgba(89,223,224,0.16)" } : { borderColor: "var(--border)", background: "var(--card)" }}
                          onClick={() => togglePlatform(platform.name, "social")}
                          aria-label={`${locked ? "Locked" : active ? "Remove" : "Select"} ${platform.name}`}
                          aria-pressed={active}
                        >
                          <span className="sr-only">{platform.name}</span>
                          <span className="flex h-12 w-20 items-center justify-center px-2">
                            <PlatformLogo platform={platform.name} className={iconClass} />
                          </span>
                          {locked ? <LockKeyhole className="absolute right-2 top-2 h-4 w-4" style={{ color: "var(--text-soft)" }} /> : null}
                          {active && !locked ? <span className="absolute -right-1 -top-1 inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--bg)" }}><CheckCircle2 className="h-4 w-4" /></span> : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={!socialConsentAccepted}
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
                      onClick={() => openYoutubeContentIdModal()}
                    >
                      YouTube Content ID
                    </button>
                    <p className="text-xs" style={{ color: "var(--text-soft)" }}>
                      {selectedPlan === "one_time" && youtubeContentIdEnabled
                        ? "YouTube Content ID adds Rs 200 for one-time releases."
                        : youtubeContentIdEnabled
                          ? "YouTube Content ID is included with your annual plan."
                          : "UGC add-on applies only when social destinations are selected."}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,1fr]">
                  <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                    <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Worldwide Distribution</p>
                    <h3 className="mt-3 text-xl font-semibold" style={{ color: "var(--text)" }}>Enabled by default</h3>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>HYMN will distribute globally unless you restrict specific countries.</p>
                    <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "rgba(89,223,224,0.28)", background: "var(--accent-soft)", color: "var(--text)" }}>
                      {territoryValue}
                    </div>
                  </div>
                  <div ref={registerField("country-selector") as (node: HTMLDivElement | null) => void} className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                    <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Restricted Countries</label>
                    <CountrySelector selected={release.selectedCountries} onChange={(countries) => setRelease((current) => ({ ...current, selectedCountries: countries }))} showError={Boolean(showErrors && destinationsIssue()?.key === "country-selector")} registerField={registerField("country-selector-button") as (node: HTMLButtonElement | null) => void} shaking={shakingField === "country-selector" || shakingField === "country-selector-button"} />
                  </div>
                </div>

                <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Copyright Owner</label>
                  <p className="mb-3 text-sm" style={{ color: "var(--text-soft)" }}>Who owns the master recording?</p>
                  <input ref={registerField("copyright-owner")} className={fieldClass("copyright-owner", Boolean(showErrors && destinationsIssue()?.key === "copyright-owner"))} value={release.copyrightOwner} onChange={(event) => setRelease((current) => ({ ...current, copyrightOwner: event.target.value }))} placeholder="HYMN Music India / Independent Artist / Record Label Name" />
                  <p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Examples: HYMN Music India, Kabir Khan, Independent Artist, Record Label Name</p>
                </div>
              </div>

              <aside className="grid gap-5 self-start xl:sticky xl:top-24">
                <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="flex gap-4">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      {artworkPreview ? <img src={artworkPreview} alt="Cover art thumbnail" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Disc3 className="h-7 w-7" style={{ color: "var(--text-soft)" }} /></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Release Summary</p>
                      <h3 className="mt-2 truncate text-xl font-semibold" style={{ color: "var(--text)" }}>{displayedReleaseTitle}</h3>
                      <p className="mt-1 truncate text-sm" style={{ color: "var(--text-muted)" }}>{namesFor(tracks[0]?.primaryArtistIds ?? []) || tracks[0]?.primaryArtistQuery || "Artist pending"}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 text-sm">
                    {[["Release Type", releaseType === "single" ? "Single" : releaseType === "ep" ? "EP" : "Album"], ["Release Date", selectedReleaseDate], ["Stores Selected", String(storeSelections.length)], ["Monetization", socialConsentAccepted ? "Enabled" : "Off"], ["Plan", currentPlan.title]].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                        <span style={{ color: "var(--text-muted)" }}>{label}</span>
                        <span className="truncate text-right" style={{ color: "var(--text)" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: readinessScore >= 90 ? "rgba(34,197,94,0.35)" : "rgba(250,204,21,0.35)", background: readinessScore >= 90 ? "rgba(34,197,94,0.08)" : "rgba(250,204,21,0.08)" }}>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Release Score</p>
                        <p className="mt-1 text-3xl font-semibold" style={{ color: "var(--text)" }}>{readinessScore}/100</p>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: readinessScore >= 90 ? "#86efac" : "#fde68a" }}>{readinessScore >= 90 ? "Ready For Distribution" : "Needs Review"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Release Readiness</p>
                      <h3 className="mt-2 text-xl font-semibold" style={{ color: "var(--text)" }}>{readinessScore}% Ready</h3>
                    </div>
                    <ShieldCheck className="h-6 w-6" style={{ color: "var(--accent)" }} />
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${readinessScore}%`, background: "var(--accent)" }} />
                  </div>
                  <div className="mt-4 grid gap-2">
                    {readinessItems.map((item) => (
                      <div key={item.label} className="flex items-center gap-3 text-sm">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border" style={item.complete ? { borderColor: "rgba(34,197,94,0.45)", background: "rgba(34,197,94,0.14)", color: "#86efac" } : { borderColor: "rgba(250,204,21,0.35)", background: "rgba(250,204,21,0.08)", color: "#fde68a" }}>
                          {item.complete ? <CheckCircle2 className="h-4 w-4" /> : "!"}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>{item.complete ? item.shortLabel : `${item.shortLabel} Pending`}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div ref={registerField("legal-checks") as (node: HTMLDivElement | null) => void} className={clsx("rounded-[1.5rem] border p-4", showErrors && destinationsIssue()?.key === "legal-checks" ? "field-shake" : "")} style={{ borderColor: legalComplete ? "rgba(34,197,94,0.32)" : "rgba(250,204,21,0.32)", background: "var(--bg-soft)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>Legal Confirmation</p>
                      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Status: {legalComplete ? "Completed" : "Pending"}</p>
                    </div>
                    <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]" style={legalComplete ? { borderColor: "rgba(34,197,94,0.4)", background: "rgba(34,197,94,0.12)", color: "#86efac" } : { borderColor: "rgba(250,204,21,0.4)", background: "rgba(250,204,21,0.1)", color: "#fde68a" }}>
                      {legalComplete ? "Completed" : "Pending"}
                    </span>
                  </div>
                  <button type="button" className="btn-primary pressable mt-4 w-full justify-center" onClick={() => setLegalModalOpen(true)}>Review & Confirm</button>
                </div>

                <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "rgba(34,197,94,0.28)", background: "linear-gradient(180deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))" }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "#86efac" }}>Selected plan</p>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em]" style={{ color: "#bbf7d0" }}>Active</span>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>HYMN Distribution Review</h3>
                  <div className="mt-4 grid gap-2 text-sm">
                    {["Metadata QC", "Artwork QC", "Copyright Check", "Distributor Submission", "Release Monitoring"].map((item) => (
                      <div key={item} className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                        <CheckCircle2 className="h-4 w-4" style={{ color: "#86efac" }} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(34,197,94,0.22)", background: "rgba(34,197,94,0.08)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Price</span>
                    <span style={{ color: "#86efac" }}>&#8377; {distributionAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <p className="mt-4 text-sm" style={{ color: "var(--text-soft)" }}>
                    {selectedPlan === "one_time" ? pricingCallout : "Use the cards above the form if you want to switch between one-time, half-yearly, and annual billing."}
                  </p>
                </div>
              </aside>
            </div>
          </section>
        ) : null}
        {step === 4 ? (
          <section className={clsx("grid gap-5", stepMotion)}>
            <header>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>Final step</p>
              <h2 className="mt-2 text-2xl font-semibold md:text-3xl" style={{ color: "var(--text)" }}>Review your release</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>Check your release details before submitting it for HYMN review and distribution.</p>
            </header>

            <div className="overflow-hidden rounded-[1.75rem] border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", boxShadow: "0 24px 70px rgba(0,0,0,0.18)" }}>
              <div className="grid gap-5 border-b p-5 md:grid-cols-[160px,1fr] md:p-7" style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--card)), var(--card))" }}>
                <div className="aspect-square overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                  {artworkPreview ? <img src={artworkPreview} alt={`${displayedReleaseTitle} artwork`} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center"><Disc3 className="h-8 w-8" style={{ color: "var(--text-soft)" }} /><span className="text-xs" style={{ color: "var(--text-muted)" }}>Artwork preview will appear here once uploaded.</span></div>}
                </div>
                <div className="flex min-w-0 flex-col justify-center">
                  <div className="flex flex-wrap gap-2">
                    {[`${tracks.length} Track${tracks.length === 1 ? "" : "s"}`, releaseType === "single" ? "Single" : releaseType === "ep" ? "EP" : "Album", tracks.some((track) => track.explicitContent) ? "Explicit" : "Clean", validationIssues.length === 0 ? "Ready to submit" : "HYMN review pending"].map((pill) => <span key={pill} className="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}>{pill}</span>)}
                  </div>
                  <h3 className="mt-4 truncate text-2xl font-semibold md:text-4xl" style={{ color: "var(--text)" }}>{displayedReleaseTitle}</h3>
                  <p className="mt-2 text-base" style={{ color: "var(--text-muted)" }}>{primaryArtistName || "Primary artist missing"}</p>
                  <p className="mt-3 text-sm" style={{ color: "var(--text-soft)" }}>Release date: {selectedReleaseDate || "—"}</p>
                </div>
              </div>

              <div className="grid divide-y lg:grid-cols-[1.05fr,0.95fr] lg:divide-x lg:divide-y-0" style={{ borderColor: "var(--border)" }}>
                <div className="grid gap-0 lg:[&>*+*]:border-t" style={{ borderColor: "var(--border)" }}>
                  <section className="p-5 md:p-7">
                    <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">Media preview</h3><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{artworkPreview ? "Artwork ready" : "Artwork missing"} · {tracks.every((track) => Boolean(track.audioPreviewUrl)) ? "Audio ready" : "Audio missing"}</p></div><button type="button" className="text-sm font-semibold" style={{ color: "var(--accent)" }} onClick={() => goToStep(2)}>Edit</button></div>
                    <div className="mt-5 grid gap-3">{tracks.map((track, index) => <AudioWaveform key={`${track.id}-review-audio`} src={track.audioPreviewUrl} title={track.trackTitle || `Track ${index + 1}`} subtitle={[track.audioFileName || "Final master", track.duration].filter(Boolean).join(" · ") || "Audio preview unavailable"} compact />)}</div>
                    {artworkWarning ? <ArtworkWarning warning={artworkWarning} /> : null}
                  </section>

                  <section className="border-t p-5 md:p-7" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Track summary</h3><button type="button" className="text-sm font-semibold" style={{ color: "var(--accent)" }} onClick={() => goToStep(0)}>Edit</button></div>
                    <div className="mt-4 divide-y" style={{ borderColor: "var(--border)" }}>{tracks.map((track, index) => <div key={`${track.id}-summary`} className="py-4 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>Track {index + 1}</p><p className="mt-1 truncate font-semibold">{track.trackTitle || "Untitled track"}</p></div><span className="rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{track.explicitContent ? "Explicit" : "Clean"}</span></div><div className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2">{[["Artist", namesFor(track.primaryArtistIds) || track.primaryArtistQuery || "Missing"], ["Genre", release.primaryGenre || "—"], ["Language", track.titleLanguage || release.language || "—"], ["ISRC", track.existingIsrcCode || "Pending"]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><span style={{ color: "var(--text-muted)" }}>{label}</span><span className="truncate text-right">{value}</span></div>)}</div></div>)}</div>
                  </section>

                  <section className="border-t p-5 md:p-7" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Release details</h3><button type="button" className="text-sm font-semibold" style={{ color: "var(--accent)" }} onClick={() => goToStep(1)}>Edit</button></div>
                    <div className="mt-4 grid gap-x-7 gap-y-3 text-sm sm:grid-cols-2">{[["Release title", displayedReleaseTitle], ["Version", tracks[0]?.versionPreset === "Other" ? tracks[0]?.customVersion : tracks[0]?.versionPreset], ["Release type", releaseType === "single" ? "Single" : releaseType === "ep" ? "EP" : "Album"], ["Genre", release.primaryGenre], ["Subgenre", release.secondaryGenre], ["Mood", release.mood], ["Language", release.language], ["Release date", selectedReleaseDate], ["Label", release.recordLabelName], ["Copyright", release.copyrightOwner], ["UPC", release.upcCode || "Pending"]].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 border-b pb-2" style={{ borderColor: "color-mix(in srgb, var(--border) 65%, transparent)" }}><span style={{ color: "var(--text-muted)" }}>{label}</span><span className="max-w-[60%] text-right">{value || "—"}</span></div>)}</div>
                  </section>
                </div>

                <div className="grid content-start divide-y" style={{ borderColor: "var(--border)" }}>
                  <section className="p-5 md:p-7">
                    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Artist details</h3><button type="button" className="text-sm font-semibold" style={{ color: "var(--accent)" }} onClick={() => goToStep(0)}>Edit</button></div>
                    <div className="mt-4 grid gap-3 text-sm">{[["Primary artist", primaryArtistName || "Missing"], ["Featured artists", tracks.map((track) => track.featuredArtists).filter(Boolean).join(", ") || "—"], ["Artist profile", tracks.every((track) => track.primaryArtistIds.length > 0) ? "Connected" : "Required"]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4"><span style={{ color: "var(--text-muted)" }}>{label}</span><span>{value}</span></div>)}</div>
                  </section>

                  <section className="p-5 md:p-7">
                    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-semibold">Distribution details</h3><button type="button" className="text-sm font-semibold" style={{ color: "var(--accent)" }} onClick={() => goToStep(3)}>Edit</button></div>
                    <div className="mt-4 grid gap-3 text-sm">{[["Platforms", `${storeSelections.length} platform${storeSelections.length === 1 ? "" : "s"} selected`], ["Territories", release.territory === "Selected countries" ? `${release.selectedCountries.length} countries selected` : "Worldwide"], ["Monetisation", socialConsentAccepted ? "Enabled" : "Off"], ["YouTube Content ID", youtubeContentIdEnabled ? "Enabled" : "Off"], ["Release timing", release.releaseTiming === "schedule_release" ? "Scheduled" : "Quick release"], ["Plan", currentPlan.title]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4"><span style={{ color: "var(--text-muted)" }}>{label}</span><span className="text-right">{value}</span></div>)}</div>
                  </section>

                  <section className="p-5 md:p-7">
                    <h3 className="text-lg font-semibold">Payment summary</h3>
                    <div className="mt-4 grid gap-3 text-sm">{[["Plan", currentPlan.title], ["Release fee", `Rs ${distributionBaseAmount.toLocaleString("en-IN")}`], ...(trackPricingQuote.discountAmount > 0 ? [["Discount", `-Rs ${trackPricingQuote.discountAmount.toLocaleString("en-IN")}`]] : []), ...(ugcAddOnAmount > 0 ? [["UGC add-on", `Rs ${ugcAddOnAmount.toLocaleString("en-IN")}`]] : []), ["Payment status", "Pending"]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4"><span style={{ color: "var(--text-muted)" }}>{label}</span><span>{value}</span></div>)}</div>
                    <div className="mt-5 flex items-end justify-between border-t pt-4" style={{ borderColor: "var(--border)" }}><span className="font-semibold">Total payable</span><span className="text-2xl font-semibold" style={{ color: "var(--accent)" }}>Rs {distributionAmount.toLocaleString("en-IN")}</span></div>
                  </section>

                  <section className="p-5 md:p-7">
                    <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" style={{ color: validationIssues.length === 0 ? "#86efac" : "#fde68a" }} /><div><h3 className="font-semibold">{validationIssues.length === 0 ? "Ready to submit" : "Submission readiness"}</h3><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{validationIssues.length === 0 ? "Your release is ready for HYMN review." : "Fix the required items before submitting."}</p></div></div>
                    <div className="mt-4 grid gap-2">{readinessItems.map((item) => <div key={item.label} className="flex items-center gap-2 text-sm"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ background: item.complete ? "rgba(34,197,94,0.14)" : "rgba(250,204,21,0.12)", color: item.complete ? "#86efac" : "#fde68a" }}>{item.complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : "!"}</span><span style={{ color: "var(--text-muted)" }}>{item.shortLabel}{item.complete ? "" : " missing"}</span></div>)}</div>
                  </section>
                </div>
              </div>

              {submitting ? <div className="border-t p-5" style={{ borderColor: "var(--border)" }}><div className="flex items-center justify-between text-sm" style={{ color: "var(--text-muted)" }}><span>Uploading release…</span><span>{uploadProgress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}><div className="shimmer-track h-full rounded-full" style={{ width: `${uploadProgress}%` }} /></div></div> : null}
            </div>

            <div className="sticky bottom-3 z-20 grid gap-3 rounded-[1.4rem] border p-3 shadow-2xl backdrop-blur-xl sm:grid-cols-[auto,1fr,auto]" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 90%, transparent)" }}>
              <button type="button" disabled={submitting} onClick={() => goToStep(3)} className="btn-outline pressable w-full sm:w-auto">Previous</button>
              <button type="button" disabled={submitting} onClick={saveDraftRelease} className="btn-outline pressable w-full sm:ml-auto sm:w-auto">Save draft</button>
              <button type="submit" disabled={submitting} className="btn-primary pressable w-full px-6 disabled:opacity-60 sm:w-auto">{submitting ? "Processing…" : `Pay Rs ${distributionAmount.toLocaleString("en-IN")} & Submit`}</button>
            </div>
          </section>
        ) : null}
        {step !== 4 ? <div className="grid gap-2 md:gap-3 md:flex md:flex-wrap md:items-center md:justify-between">
          <button type="button" disabled={step === 0 || submitting} onClick={() => goToStep(Math.max(step - 1, 0))} className="btn-outline pressable w-full md:w-auto py-2.5 md:py-3 disabled:opacity-40 text-sm">← Previous</button>
          <div className="grid w-full grid-cols-2 items-center gap-2 md:gap-3 md:flex md:w-auto md:flex-wrap">
            <button type="button" disabled={submitting} onClick={saveDraftRelease} className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-semibold text-amber-300 transition hover:-translate-y-0.5 hover:bg-amber-400/20 disabled:opacity-60">
              Draft
            </button>
            {step < steps.length - 1 ? <button type="button" onClick={() => { setAttemptedStep(null); setStatus(null); goToStep(Math.min(step + 1, steps.length - 1)); }} className="btn-primary pressable w-full md:w-auto py-2.5 md:py-3 text-sm">Next →</button> : null}
          </div>
        </div> : null}
        {status ? <p className="text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>{status}</p> : null}
      </form>
      <MonetisationConsentModal
        open={monetisationModalOpen}
        onClose={() => setMonetisationModalOpen(false)}
        onConfirm={() => { setSocialConsentAccepted(true); setMonetisationModalOpen(false); }}
        value={monetisationClauses}
        onChange={setMonetisationClauses}
      />
      <LegalConsentModal
        open={legalModalOpen}
        onClose={() => setLegalModalOpen(false)}
        onConfirm={() => setLegalModalOpen(false)}
        value={legal as Record<string, boolean>}
        onChange={(value) => setLegal(value as LegalState)}
      />
      <YoutubeContentIdModal
        open={youtubeContentIdModalOpen}
        onClose={() => setYoutubeContentIdModalOpen(false)}
        onSave={() => { setYoutubeContentIdEnabled(true); setYoutubeContentIdModalOpen(false); }}
        channelUrl={youtubeContentIdChannelUrl}
        onChannelUrlChange={setYoutubeContentIdChannelUrl}
      />
      <ContributorsModal state={contributorsModal} onClose={closeContributors} onSave={(value) => { if (contributorsModal.trackIndex == null) return; updateTrack(contributorsModal.trackIndex, value); closeContributors(); }} createContributor={createContributor} contributorsValid={contributorsValid} />
    </>
  );
}



















// vercel trigger

// vercel trigger
// vercel trigger 4
// vercel trigger 6
