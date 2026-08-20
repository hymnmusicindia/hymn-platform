"use client";

import clsx from "clsx";
import { ArrowRight, CheckCircle2, Clock3, Disc3, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles, ChevronDown } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

type TrackDraft = {
  id: string;
  trackNumber: number;
  trackTitle: string;
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
  audioPreviewUrl: string;
  duration: string;
  explicitContent: boolean;
  dolbyAtmos: boolean;
};

type ReleaseDraft = {
  releaseTitle: string;
  recordLabelName: string;
  primaryGenre: string;
  secondaryGenre: string;
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
  return { id: createId(), legalName: "", artistName: "" };
}

function createTrack(trackNumber = 1): TrackDraft {
  return {
    id: createId(),
    trackNumber,
    trackTitle: "",
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
    audioPreviewUrl: "",
    duration: "",
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
    return { releaseTitle: "", recordLabelName: "", primaryGenre: "", secondaryGenre: "", language: "", territory: "Worldwide", selectedCountries: [], releaseTiming: "quick_release", scheduledReleaseDate: minimumScheduledDate, copyrightOwner: "" };
  }

  const territory = initialRelease.territory && initialRelease.territory !== "Worldwide" ? "Selected countries" : "Worldwide";
  return {
    releaseTitle: initialRelease.releaseTitle?.trim() || "",
    recordLabelName: initialRelease.labelName?.trim() || initialRelease.labelDisplayName?.trim() || "",
    primaryGenre: initialRelease.primaryGenre?.trim() || initialRelease.genre?.trim() || "",
    secondaryGenre: initialRelease.secondaryGenre?.trim() || initialRelease.primaryGenre?.trim() || initialRelease.genre?.trim() || "",
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
      audioPreviewUrl: track?.audioUrl || initialRelease?.audioUrl || "",
      duration: track?.duration?.trim() || "",
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
  return entries.length > 0 && entries.every((entry) => entry.legalName.trim());
}

function contributorNames(entries: ContributorDraft[]) {
  return entries.map((entry) => entry.legalName.trim()).filter(Boolean).join(", ");
}

function contributorCredits(role: ContributorCredit["role"], entries: ContributorDraft[]): ContributorCredit[] {
  return entries.map((entry) => ({ role, legalName: entry.legalName.trim(), artistName: entry.artistName.trim() || undefined })).filter((entry) => entry.legalName);
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
  if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Artwork must be a JPG or PNG file.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.width, height: image.height });
      image.onerror = () => reject(new Error("Could not read artwork dimensions."));
      image.src = objectUrl;
    });
    if (dimensions.width !== dimensions.height) throw new Error("Artwork must be perfectly square (1:1).");
    if (dimensions.width < 1500 || dimensions.height < 1500) throw new Error("Artwork must be at least 1500 x 1500 px.");
    if (dimensions.width > 4500 || dimensions.height > 4500) throw new Error("Artwork must not exceed 4500 x 4500 px.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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

export function ReleaseForm({ selectedPlan, initialRelease }: { selectedPlan: DistributionPlanOption; initialRelease?: Release | null }) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const quickReleaseDate = useMemo(() => toDateInputValue(addDays(today, 3)), [today]);
  const minimumScheduledDate = useMemo(() => toDateInputValue(addDays(today, 20)), [today]);
  const [step, setStep] = useState(initialRelease ? 4 : 0);
  const [mobileStepMenuOpen, setMobileStepMenuOpen] = useState(false);
  const [expandedTrack, setExpandedTrack] = useState(0);
  const [queue, setQueue] = useState<DistributionQueueSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [attemptedStep, setAttemptedStep] = useState<number | null>(null);
  const [knownProfiles, setKnownProfiles] = useState<Record<number, ArtistProfile>>({});
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(initialRelease?.artworkUrl ?? null);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [artworkWarning, setArtworkWarning] = useState<string | null>(null);
  const [artworkScanning, setArtworkScanning] = useState(false);
  const [contributorsModal, setContributorsModal] = useState<ContributorModalState>({ open: false, trackIndex: null, songwriters: [createContributor()], composers: [createContributor()], producers: [createContributor()] });
  const [monetisationModalOpen, setMonetisationModalOpen] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [youtubeContentIdModalOpen, setYoutubeContentIdModalOpen] = useState(false);
  const [draftReleaseId, setDraftReleaseId] = useState<number | null>(() => initialRelease?.status === "draft" ? initialRelease.id : null);
  const [socialConsentAccepted, setSocialConsentAccepted] = useState(() => initialRelease?.monetisationAccepted ?? Boolean(initialRelease?.platforms?.length ? socialPlatformSelected(initialRelease.platforms) : false));
  const [monetisationClauses, setMonetisationClauses] = useState<MonetisationClauseState>(() => {
    const base = createMonetisationClauseState();
    if (!initialRelease?.monetisationClauses) return base;
    return { ...base, ...Object.fromEntries(Object.entries(initialRelease.monetisationClauses).filter(([key]) => key in base)) } as MonetisationClauseState;
  });
  const [youtubeContentIdEnabled, setYoutubeContentIdEnabled] = useState(() => Boolean(initialRelease?.youtubeContentIdEnabled));
  const [youtubeContentIdChannelUrl, setYoutubeContentIdChannelUrl] = useState(() => initialRelease?.youtubeContentIdChannelUrl ?? "");
  const [release, setRelease] = useState<ReleaseDraft>(() => createInitialReleaseDraft(initialRelease, minimumScheduledDate));
  const [legal, setLegal] = useState<LegalState>(() => createInitialLegalState(initialRelease));
  const [platforms, setPlatforms] = useState<string[]>(initialRelease?.platforms?.length ? initialRelease.platforms : ["Spotify", "Apple Music"]);
  const [tracks, setTracks] = useState<TrackDraft[]>(() => createTracksFromRelease(initialRelease));
  const [submittedRelease, setSubmittedRelease] = useState<Release | null>(null);
  const [shakingField, setShakingField] = useState<string | null>(null);
  const isEditing = Boolean(initialRelease);
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const releaseType = useMemo(() => releaseTypeFromCount(tracks.length), [tracks.length]);
  const requiresReleaseTitle = releaseType !== "single";
  const displayedReleaseTitle = useMemo(() => releaseType === "single" ? tracks[0]?.trackTitle.trim() || "Untitled single" : release.releaseTitle.trim() || (releaseType === "ep" ? "Untitled EP" : "Untitled Album"), [release.releaseTitle, releaseType, tracks]);
  const selectedReleaseDate = release.releaseTiming === "schedule_release" ? release.scheduledReleaseDate : quickReleaseDate;
  const releaseDateValid = release.releaseTiming === "quick_release" || (Boolean(release.scheduledReleaseDate) && release.scheduledReleaseDate >= minimumScheduledDate);
  const currentPlan = findDistributionPlan(selectedPlan);
  const trackPricingQuote = useMemo(() => getTrackPricingQuote(tracks.length), [tracks.length]);
  const trackPricingBadge = getTrackPricingBadge(trackPricingQuote);
  const trackPricingNudge = getTrackPricingNudge(trackPricingQuote);
  const pricingCallout = trackPricingBadge ? `${trackPricingBadge} - ${trackPricingNudge}` : trackPricingNudge;
  const ugcAddOnAmount = useMemo(() => getUgcAddonPrice(platforms, selectedPlan, { youtubeContentIdEnabled }), [platforms, selectedPlan, youtubeContentIdEnabled]);
  const distributionBaseAmount = selectedPlan === "pay_per_release" ? trackPricingQuote.basePrice : currentPlan.price;
  const distributionAmount = (selectedPlan === "pay_per_release" ? trackPricingQuote.finalPrice : currentPlan.price) + ugcAddOnAmount;
  const youtubeContentIdFee = selectedPlan === "pay_per_release" && youtubeContentIdEnabled ? 200 : 0;
  const legalComplete = useMemo(() => Object.values(legal).every(Boolean), [legal]);
  const storeSelections = useMemo(() => storePlatforms.filter((platform) => platforms.includes(platform.name)).map((platform) => platform.name), [platforms]);
  const territoryValue = release.selectedCountries.length > 0 ? `Worldwide excluding ${release.selectedCountries.join(", ")}` : "Worldwide";
  const audioComplete = tracks.length > 0 && tracks.every((track) => Boolean(track.audioFile || track.existingAudioUrl || track.audioPreviewUrl));
  const metadataComplete = Boolean(displayedReleaseTitle.trim() && release.recordLabelName.trim() && release.primaryGenre && release.secondaryGenre && release.language.trim() && platforms.length > 0 && release.copyrightOwner.trim());
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
  const projectedPosition = (queue?.pendingQueue ?? 0) + 1;
  const queuePercent = queueProgressPercent(queue?.currentlyReviewing ?? 128, queue?.pendingQueue ?? 22);

  useEffect(() => {
    fetch("/api/distribution/queue").then((response) => response.json()).then((data) => setQueue(data.summary)).catch(() => setQueue({ currentlyReviewing: 128, nextBatchIn: "4h 21m", averageApprovalTime: "36-48 hours", pendingQueue: 22 }));
  }, []);

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
  const fieldClass = (key: string, invalid: boolean) => clsx("field", invalid ? "field-invalid" : "", shakingField === key ? "field-shake" : "");

  function triggerFieldFocus(issue: ValidationIssue) {
    if (issue.trackIndex != null) setExpandedTrack(issue.trackIndex);
    setStep(issue.step);
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

  async function handleAudioFile(index: number, file: File) {
    const currentTrack = tracks[index];
    if (currentTrack?.audioPreviewUrl) safeRevokePreviewUrl(currentTrack.audioPreviewUrl);
    const previewUrl = URL.createObjectURL(file);
    const duration = await getAudioDuration(file).catch(() => { throw new Error("Could not read the uploaded audio."); });
    updateTrack(index, { audioFile: file, audioFileName: file.name, existingAudioUrl: "", audioPreviewUrl: previewUrl, duration });
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
    await validateArtwork(file);
    if (artworkPreview) safeRevokePreviewUrl(artworkPreview);
    setArtworkFile(file);
    setArtworkPreview(await readAsDataUrl(file));
    setArtworkError(null);
    setArtworkWarning(null);
    setArtworkScanning(true);
    void detectArtworkWarning(file).then((warning) => { setArtworkWarning(warning); setArtworkScanning(false); });
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
    if (!track.duration) return { step: 0, key: `track-${index}-duration`, trackIndex: index, message: "Track duration is required before continuing." };
    if (track.isCover && !track.originalArtist.trim()) return { step: 0, key: `track-${index}-original-artist`, trackIndex: index, message: "Cover songs need the original artist name." };
    if (track.isCover && !track.originalTrackLink.trim()) return { step: 0, key: `track-${index}-original-link`, trackIndex: index, message: "Cover songs need a reference link to the original release." };
    if (track.isCover && !track.coverLicenseFile && !track.existingCoverLicenseConfirmed) return { step: 0, key: `track-${index}-cover-license`, trackIndex: index, message: "Cover songs need a PDF license or rights proof upload." };
    return null;
  }

  const releaseInfoIssue = (): ValidationIssue | null => {
    if (requiresReleaseTitle && !release.releaseTitle.trim()) return { step: 1, key: "release-title", message: releaseType === "ep" ? "Add an EP name before continuing." : "Add an album name before continuing." };
    if (!release.recordLabelName.trim()) return { step: 1, key: "record-label", message: "Enter the record label or imprint name." };
    if (!release.primaryGenre || !release.secondaryGenre) return { step: 1, key: "genre-picker", message: "Choose both a genre and subgenre before continuing." };
    if (!release.language.trim()) return { step: 1, key: "language", message: "Language is required before continuing." };
    if (!releaseDateValid) return { step: 1, key: "release-date", message: "Scheduled releases must be at least 20 days from today." };
    return null;
  };

  const artworkIssue = (): ValidationIssue | null => !artworkFile || !artworkPreview || artworkError ? { step: 2, key: "artwork-upload", message: artworkError || "Upload approved artwork before continuing." } : null;

  const destinationsIssue = (): ValidationIssue | null => {
    if (platforms.length === 0) return { step: 3, key: "store-selection", message: "Choose at least one store or social destination." };
    if (!release.copyrightOwner.trim()) return { step: 3, key: "copyright-owner", message: "Copyright owner is required before continuing." };
    if (socialPlatformSelected(platforms) && !socialConsentAccepted) return { step: 3, key: "social-confirmation", message: "Enable monetisation before selecting UGC platforms." };
    if (platforms.includes("YouTube Music") && youtubeContentIdEnabled && !youtubeContentIdChannelUrl.trim()) return { step: 3, key: "youtube-content-id-url", message: "Add your YouTube channel URL for Content ID." };
    if (!Object.values(legal).every(Boolean)) return { step: 3, key: "legal-checks", message: "Complete the final legal confirmations before continuing." };
    return null;
  };

  const stepChecks = [tracks.every((track, index) => !trackIssue(track, index)), !releaseInfoIssue(), !artworkIssue(), !destinationsIssue()];
  const validationIssues = [
    ...tracks.map((track, index) => trackIssue(track, index)).filter((issue): issue is ValidationIssue => Boolean(issue)),
    releaseInfoIssue(),
    artworkIssue(),
    destinationsIssue()
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
    setStep(index);
    setMobileStepMenuOpen(false);
  }

  async function verifyAndUpdateRelease(formData: FormData) {
    return await new Promise<{ release: Release }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/distribution/update-release");
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100)); };
      xhr.onerror = () => reject(new Error("Update failed during upload."));
      xhr.onload = () => {
        const response = xhr.response ?? JSON.parse(xhr.responseText || "{}");
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(response.error || "Update failed."));
        resolve(response);
      };
      xhr.send(formData);
    });
  }

  async function submitEditedRelease() {
    const payload = {
      metadata: {
        editReleaseId: initialRelease?.id ?? 0,
        artistName: initialRelease?.artistName || tracks[0]?.primaryArtistQuery.trim() || namesFor(tracks[0]?.primaryArtistIds ?? []) || "",
        releaseTitle: displayedReleaseTitle,
        releaseType,
        releaseDate: selectedReleaseDate,
        originalReleaseDate: release.scheduledReleaseDate,
        recordLabelName: release.recordLabelName,
        labelName: release.recordLabelName,
        primaryGenre: release.primaryGenre,
        secondaryGenre: release.secondaryGenre,
        language: release.language,
        mood: initialRelease?.mood,
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
        paymentModel: selectedPlan === "pay_per_release" ? "one_time" : "subscription",
        plan: selectedPlan,
        artworkFileKey: "artwork",
        existingArtworkUrl: initialRelease?.artworkUrl ?? undefined,
        tracks: tracks.map((track, index) => ({
          trackTitle: track.trackTitle,
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
          artistProfileIds: track.primaryArtistIds,
        }))
      }
    };

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    if (artworkFile) formData.append("artwork", artworkFile);
    tracks.forEach((track, index) => {
      if (track.audioFile) formData.append(`audio-${index}`, track.audioFile);
      if (track.coverLicenseFile) formData.append(`cover-license-${index}`, track.coverLicenseFile);
    });
    return await verifyAndUpdateRelease(formData);
  }
  async function verifyAndSubmitRelease(formData: FormData) {
    return await new Promise<{ release: Release }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/distribution/payment/verify-submit");
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100)); };
      xhr.onerror = () => reject(new Error("Submission failed during upload."));
      xhr.onload = () => {
        const response = xhr.response ?? JSON.parse(xhr.responseText || "{}");
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(response.error || "Submission failed."));
        resolve(response);
      };
      xhr.send(formData);
    });
  }

  async function saveDraftRelease() {
    setSubmitting(true);
    setUploadProgress(0);
    setStatus("Saving draft...");
    try {
      const payload = {
        draftReleaseId,
        metadata: {
          artistName: namesFor(tracks[0]?.primaryArtistIds ?? []) || tracks[0]?.primaryArtistQuery.trim() || initialRelease?.artistName || "",
          trackName: tracks[0]?.trackTitle.trim() || displayedReleaseTitle,
          releaseTitle: displayedReleaseTitle,
          releaseType,
          releaseDate: selectedReleaseDate,
          originalReleaseDate: initialRelease?.originalReleaseDate ?? null,
          recordLabelName: release.recordLabelName,
          labelName: release.recordLabelName,
          labelDisplayName: release.recordLabelName,
          primaryGenre: release.primaryGenre,
          secondaryGenre: release.secondaryGenre,
          genre: release.primaryGenre,
          mood: initialRelease?.mood ?? null,
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
          paymentModel: selectedPlan === "pay_per_release" ? "one_time" : "subscription",
          plan: selectedPlan,
          artworkFileKey: "artwork",
          existingArtworkUrl: initialRelease?.artworkUrl ?? undefined,
          tracks: tracks.map((track, index) => ({
            trackTitle: track.trackTitle,
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
            artistProfileIds: track.primaryArtistIds
          }))
        }
      };

      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      if (artworkFile) formData.append("artwork", artworkFile);
      tracks.forEach((track, index) => {
        if (track.audioFile) formData.append(`audio-${index}`, track.audioFile);
        if (track.coverLicenseFile) formData.append(`cover-license-${index}`, track.coverLicenseFile);
      });

      const response = await fetch("/api/distribution/save-draft", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save draft.");
      const savedId = Number(data.release?.id ?? draftReleaseId ?? 0);
      if (savedId > 0) {
        setDraftReleaseId(savedId);
        router.replace(`/distribution/start?edit=${savedId}`);
      }
      setStatus("Draft saved. You can finish your release from Your Releases.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save draft.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitRelease(orderId: string, paymentId: string, signature: string) {
    const payload = {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      metadata: {
        artistName: namesFor(tracks[0]?.primaryArtistIds ?? []) || tracks[0]?.primaryArtistQuery.trim() || initialRelease?.artistName || "",
        releaseTitle: displayedReleaseTitle,
        releaseType,
        releaseDate: selectedReleaseDate,
        recordLabelName: release.recordLabelName,
        primaryGenre: release.primaryGenre,
        secondaryGenre: release.secondaryGenre,
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
        paymentModel: selectedPlan === "pay_per_release" ? "one_time" : "subscription",
        plan: selectedPlan,
        artworkFileKey: "artwork",
        tracks: tracks.map((track, index) => ({
          trackTitle: track.trackTitle,
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
          artistProfileIds: track.primaryArtistIds,
        }))
      }
    };

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    if (artworkFile) formData.append("artwork", artworkFile);
    tracks.forEach((track, index) => {
      if (track.audioFile) formData.append(`audio-${index}`, track.audioFile);
      if (track.coverLicenseFile) formData.append(`cover-license-${index}`, track.coverLicenseFile);
    });
    return await verifyAndSubmitRelease(formData);
  }

  async function handleFinalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationIssues.length > 0) {
      const issue = validationIssues[0];
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

      const orderResponse = await fetch("/api/distribution/payment/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: selectedPlan, paymentModel: selectedPlan === "pay_per_release" ? "one_time" : "subscription", trackCount: tracks.length, releaseType, platforms, youtubeContentIdEnabled }) });
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
    setStep(initialRelease ? 4 : 0); setMobileStepMenuOpen(false); setExpandedTrack(0); setSubmitting(false); setUploadProgress(0); setStatus(null); setAttemptedStep(null); setArtworkFile(null); setArtworkPreview(initialRelease?.artworkUrl ?? null); setArtworkError(null); setArtworkWarning(null); setArtworkScanning(false); setMonetisationModalOpen(false); setLegalModalOpen(false); setYoutubeContentIdModalOpen(false); setDraftReleaseId(initialRelease?.status === "draft" ? initialRelease.id : null); setSocialConsentAccepted(initialRelease?.monetisationAccepted ?? Boolean(initialRelease?.platforms?.length ? socialPlatformSelected(initialRelease.platforms) : false)); setMonetisationClauses(() => { const base = createMonetisationClauseState(); if (!initialRelease?.monetisationClauses) return base; return { ...base, ...Object.fromEntries(Object.entries(initialRelease.monetisationClauses).filter(([key]) => key in base)) } as MonetisationClauseState; }); setYoutubeContentIdEnabled(Boolean(initialRelease?.youtubeContentIdEnabled)); setYoutubeContentIdChannelUrl(initialRelease?.youtubeContentIdChannelUrl ?? ""); setPlatforms(initialRelease?.platforms?.length ? initialRelease.platforms : ["Spotify", "Apple Music"]); setTracks(createTracksFromRelease(initialRelease)); setRelease(createInitialReleaseDraft(initialRelease, minimumScheduledDate)); setLegal(createInitialLegalState(initialRelease)); setSubmittedRelease(null);
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
                    {label}
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
              {label}
            </button>
          );
        })}</div>
        {step === 0 ? <section className="grid gap-4 md:gap-5 fade-up"><div className="rounded-[1.5rem] border p-4 md:p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}><div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between"><div><h3 className="text-lg md:text-2xl font-semibold" style={{ color: "var(--text)" }}>Build the release one track at a time</h3><p className="mt-2 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>Singles, EPs, and albums are derived automatically from how many tracks you add.</p></div><div className="rounded-[1.2rem] border px-3 md:px-4 py-2 md:py-3 text-sm w-fit" style={{ borderColor: "var(--border)", background: "var(--card)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}><p className="text-xs md:text-sm font-medium" style={{ color: "var(--text)" }}>{releaseType === "single" ? "Single" : releaseType === "ep" ? "EP" : "Album"}</p><p className="text-xs" style={{ color: "var(--text-soft)" }}>{tracks.length} track{tracks.length > 1 ? "s" : ""}</p></div></div></div>
          {tracks.map((track, index) => { const expanded = expandedTrack === index; const issue = showErrors ? trackIssue(track, index) : null; return <div key={track.id} className="rounded-[1.7rem] border p-4 md:p-5 transition-all duration-300" style={{ borderColor: issue ? "rgba(248,113,113,0.4)" : "var(--border)", background: "var(--card)", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}><button type="button" className={clsx("group pressable accordion-trigger flex w-full items-center justify-between gap-3 md:gap-4 rounded-[1.25rem] border px-3 md:px-4 py-3 md:py-4 text-left transition-all", expanded ? "is-open" : "")} onClick={() => setExpandedTrack((current) => (current === index ? -1 : index))} aria-expanded={expanded} style={expanded ? { borderColor: "var(--accent)", background: "linear-gradient(135deg, rgba(89,223,224,0.1), rgba(89,223,224,0.04))" } : { borderColor: "var(--border)" }}><div className="min-w-0"><p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Track {index + 1}</p><h3 className="mt-1 md:mt-2 truncate text-base md:text-2xl font-semibold" style={{ color: "var(--text)" }}>{track.trackTitle || "Untitled track"}</h3><p className="mt-1 md:mt-2 truncate text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>{namesFor(track.primaryArtistIds) || track.primaryArtistQuery || "No primary artist selected yet"}</p></div><span className={clsx("inline-flex items-center gap-1 md:gap-2 rounded-full border px-2 md:px-3 py-1 text-[10px] md:text-xs uppercase tracking-[0.18em] transition duration-300 flex-shrink-0", expanded ? "bg-[color-mix(in_srgb,var(--card)_82%,var(--text)_10%)]" : "")} style={{ borderColor: "var(--border)", color: expanded ? "var(--text)" : "var(--text-soft)" }}>{expanded ? "Collapse" : "Expand"}<ChevronDown className={clsx("h-3 w-3 md:h-3.5 md:w-3.5 transition-transform duration-300", expanded ? "rotate-180" : "")} /></span></button>
          <div className={clsx("grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out", expanded ? "grid-rows-[1fr] opacity-100 translate-y-0" : "grid-rows-[0fr] opacity-0 -translate-y-1")} aria-hidden={!expanded}><div className="overflow-hidden"><div className="mt-4 md:mt-6 grid gap-4 md:gap-6"><div className="grid gap-3 md:gap-4 md:grid-cols-2"><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Track title</label><input ref={registerField(`track-${index}-title`)} className={fieldClass(`track-${index}-title`, Boolean(showErrors && issue?.key === `track-${index}-title`))} value={track.trackTitle} onChange={(event) => updateTrack(index, { trackTitle: event.target.value })} placeholder="Track title" /></div><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Version</label><select className={fieldClass(`track-${index}-version`, Boolean(showErrors && issue?.key === `track-${index}-version`))} value={track.versionPreset} onChange={(event) => updateTrack(index, { versionPreset: event.target.value, customVersion: event.target.value === "Other" ? track.customVersion : "" })}>{versionOptions.map((option) => <option key={option}>{option}</option>)}</select>{track.versionPreset === "Other" ? <input className={clsx("field mt-3", showErrors && issue?.key === `track-${index}-version` ? "field-invalid" : "", shakingField === `track-${index}-version` ? "field-shake" : "")} value={track.customVersion} placeholder="Custom version label" onChange={(event) => updateTrack(index, { customVersion: event.target.value })} /> : null}</div></div>
          <div ref={registerField(`track-${index}-artists`)} className={clsx(showErrors && issue?.key === `track-${index}-artists` ? "field-shake" : "") }><div className="grid gap-3 md:gap-4 lg:grid-cols-3"><ArtistPicker label="Primary Artist" helper="Max 3 artists" valueIds={profilesFor(track.primaryArtistIds)} query={track.primaryArtistQuery} max={3} required={showErrors && issue?.key === `track-${index}-artists`} onQueryChange={(value) => updateTrack(index, { primaryArtistQuery: value })} onSelect={(profile) => { upsertKnownProfile(profile); updateTrack(index, { primaryArtistIds: track.primaryArtistIds.includes(profile.id) ? track.primaryArtistIds : [...track.primaryArtistIds, profile.id], primaryArtistQuery: "" }); }} onRemove={(profileId) => updateTrack(index, { primaryArtistIds: track.primaryArtistIds.filter((id) => id !== profileId) })} /><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Featured artists</label><input className="field" value={track.featuredArtists} onChange={(event) => updateTrack(index, { featuredArtists: event.target.value })} placeholder="Featured artist names only" /><p className="mt-2 text-[11px]" style={{ color: "var(--text-soft)" }}>Text only. No profile creation.</p></div><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Remixer</label><input className="field" value={track.remixers} onChange={(event) => updateTrack(index, { remixers: event.target.value })} placeholder="Remixer names only" /><p className="mt-2 text-[11px]" style={{ color: "var(--text-soft)" }}>Text only. No profile creation.</p></div></div></div>
            <div ref={registerField(`track-${index}-contributors`)} className={clsx("rounded-[1.3rem] border p-3 md:p-4", showErrors && issue?.key === `track-${index}-contributors` ? "field-shake" : "")} style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <div className="flex flex-col gap-2 md:flex-wrap md:items-center md:justify-between md:gap-3">
                <div>
                  <p className="text-xs md:text-sm font-semibold" style={{ color: "var(--text)" }}>Contributors</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <strong className="uppercase" style={{ color: "var(--text-soft)", fontSize: 11 }}>S</strong>
                      <span style={{ color: contributorNames(track.songwriters) ? "var(--text)" : "var(--text-soft)" }}>{contributorNames(track.songwriters) || "Pending"}</span>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <strong className="uppercase" style={{ color: "var(--text-soft)", fontSize: 11 }}>C</strong>
                      <span style={{ color: contributorNames(track.composers) ? "var(--text)" : "var(--text-soft)" }}>{contributorNames(track.composers) || "Pending"}</span>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <strong className="uppercase" style={{ color: "var(--text-soft)", fontSize: 11 }}>P</strong>
                      <span style={{ color: contributorNames(track.producers) ? "var(--text)" : "var(--text-soft)" }}>{contributorNames(track.producers) || "Pending"}</span>
                    </span>
                  </div>
                </div>
                <button type="button" className="btn-outline pressable text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-3 w-fit" onClick={() => openContributors(index)}>Edit</button>
              </div>
            </div>
          <div ref={registerField(`track-${index}-audio`)}><UploadDropzone accept="audio/*,.wav,.mp3" title="Audio upload" description="Drop the master audio here" helperLines={["WAV preferred", "MP3 accepted", "One file per track"]} fileName={track.audioFile?.name} error={showErrors && issue?.key === `track-${index}-audio` ? issue.message : null} onSelect={async (file) => { await handleAudioFile(index, file); }}><AudioWaveform src={track.audioPreviewUrl} title={track.trackTitle || `Track ${index + 1} preview`} subtitle={track.duration ? `${track.duration} ready for review` : "Upload audio to generate the waveform"} compact /></UploadDropzone></div>
          <div className="grid gap-3 md:gap-4 md:grid-cols-3"><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Duration</label><input ref={registerField(`track-${index}-duration`)} className={fieldClass(`track-${index}-duration`, Boolean(showErrors && issue?.key === `track-${index}-duration`))} value={track.duration} onChange={(event) => updateTrack(index, { duration: event.target.value })} placeholder="00:00" /></div><label className="flex items-center gap-2 md:gap-3 rounded-xl border px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}><input type="checkbox" checked={track.explicitContent} onChange={(event) => updateTrack(index, { explicitContent: event.target.checked })} />Explicit</label><label className="flex items-center gap-2 md:gap-3 rounded-xl border px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}><input type="checkbox" checked={track.dolbyAtmos} onChange={(event) => updateTrack(index, { dolbyAtmos: event.target.checked })} />Dolby Atmos</label></div>
          <label className="flex items-center gap-2 md:gap-3 rounded-xl border px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}><input type="checkbox" checked={track.isCover} onChange={(event) => updateTrack(index, { isCover: event.target.checked, originalArtist: event.target.checked ? track.originalArtist : "", originalTrackLink: event.target.checked ? track.originalTrackLink : "", coverLicenseFile: event.target.checked ? track.coverLicenseFile : null, coverLicenseFileName: event.target.checked ? track.coverLicenseFileName : "" })} />This is a cover song</label>
          {track.isCover ? <div className="grid gap-3 md:gap-4 md:grid-cols-2"><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Original artist name</label><input ref={registerField(`track-${index}-original-artist`)} className={fieldClass(`track-${index}-original-artist`, Boolean(showErrors && issue?.key === `track-${index}-original-artist`))} value={track.originalArtist} onChange={(event) => updateTrack(index, { originalArtist: event.target.value })} /></div><div><label className="mb-2 block text-xs md:text-sm font-medium" style={{ color: "var(--text-muted)" }}>Original track link</label><input ref={registerField(`track-${index}-original-link`)} className={fieldClass(`track-${index}-original-link`, Boolean(showErrors && issue?.key === `track-${index}-original-link`))} value={track.originalTrackLink} onChange={(event) => updateTrack(index, { originalTrackLink: event.target.value })} placeholder="Spotify, YouTube, or store link" /></div><div className="md:col-span-2" ref={registerField(`track-${index}-cover-license`)}><UploadDropzone accept="application/pdf" title="License proof" description="Upload the PDF rights or license document" helperLines={["PDF only", "Required for cover songs"]} fileName={track.coverLicenseFileName} error={showErrors && issue?.key === `track-${index}-cover-license` ? issue.message : null} onSelect={async (file) => { handleCoverLicense(index, file); }} /></div></div> : null}
          {tracks.length > 1 ? <button type="button" className="btn-outline pressable max-w-max text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-3" onClick={() => removeTrack(index)}>Remove track</button> : null}</div></div></div></div>; })}
          <button type="button" className="btn-outline pressable hover-lift max-w-max text-xs md:text-sm py-2 md:py-2.5 px-3 md:px-4" onClick={addTrack}>+ Add another track</button></section> : null}
        {step === 1 ? <section className="grid gap-5 fade-up md:grid-cols-[1.1fr,0.9fr]"><div className="grid gap-5">{requiresReleaseTitle ? <div><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>{releaseType === "ep" ? "EP Name" : "Album Name"}</label><input ref={registerField("release-title")} className={fieldClass("release-title", Boolean(showErrors && releaseInfoIssue()?.key === "release-title"))} value={release.releaseTitle} onChange={(event) => setRelease((current) => ({ ...current, releaseTitle: event.target.value }))} placeholder={releaseType === "ep" ? "Enter EP name" : "Enter album name"} /></div> : <div className="rounded-[1.4rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Single release</p><p className="mt-3 text-lg font-semibold" style={{ color: "var(--text)" }}>No extra release title needed</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>We&apos;ll use the first track title as the release title for this single.</p></div>}
        <div><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Record label / imprint</label><input ref={registerField("record-label")} className={fieldClass("record-label", Boolean(showErrors && releaseInfoIssue()?.key === "record-label"))} value={release.recordLabelName} onChange={(event) => setRelease((current) => ({ ...current, recordLabelName: event.target.value }))} placeholder="HYMN Music or your imprint" /></div>
        <div ref={registerField("genre-picker") as (node: HTMLDivElement | null) => void} className={clsx(showErrors && releaseInfoIssue()?.key === "genre-picker" ? "field-shake" : "") }><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Genre + subgenre</label><GenreSelector genre={release.primaryGenre} subgenre={release.secondaryGenre} onChange={(genre, subgenre) => setRelease((current) => ({ ...current, primaryGenre: genre, secondaryGenre: subgenre }))} error={Boolean(showErrors && releaseInfoIssue()?.key === "genre-picker")} /></div>
        <div><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Language</label><input ref={registerField("language")} className={fieldClass("language", Boolean(showErrors && releaseInfoIssue()?.key === "language"))} value={release.language} onChange={(event) => setRelease((current) => ({ ...current, language: event.target.value }))} placeholder="Hindi, English, Punjabi..." /></div></div>
        <div className="grid gap-5"><div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Release timing</p><div className="mt-4 grid gap-3"><button type="button" className="pressable hover-lift rounded-[1.2rem] border p-4 text-left" style={release.releaseTiming === "quick_release" ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : { borderColor: "var(--border)", background: "var(--card)" }} onClick={() => setRelease((current) => ({ ...current, releaseTiming: "quick_release" }))}><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Quick release</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Release ASAP in 3-8 days.</p></button><button type="button" className="pressable hover-lift rounded-[1.2rem] border p-4 text-left" style={release.releaseTiming === "schedule_release" ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : { borderColor: "var(--border)", background: "var(--card)" }} onClick={() => setRelease((current) => ({ ...current, releaseTiming: "schedule_release" }))}><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Schedule release</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Earliest date: {minimumScheduledDate}</p></button></div>{release.releaseTiming === "schedule_release" ? <div className="mt-4"><label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Scheduled release date</label><input ref={registerField("release-date")} className={fieldClass("release-date", Boolean(showErrors && releaseInfoIssue()?.key === "release-date"))} type="date" min={minimumScheduledDate} value={release.scheduledReleaseDate} onChange={(event) => setRelease((current) => ({ ...current, scheduledReleaseDate: event.target.value }))} /></div> : <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>Estimated release date: {quickReleaseDate}</p>}</div>
        <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Release summary</p><div className="mt-4 grid gap-3 text-sm" style={{ color: "var(--text-muted)" }}><div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}><span>Release type</span><span style={{ color: "var(--text)" }}>{releaseType === "single" ? "Single" : releaseType === "ep" ? "EP" : "Album"}</span></div><div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}><span>Tracks</span><span style={{ color: "var(--text)" }}>{tracks.length}</span></div><div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}><span>Live title</span><span style={{ color: "var(--text)" }}>{displayedReleaseTitle}</span></div></div></div></div></section> : null}
        {step === 2 ? <section className="grid gap-4 md:gap-5 fade-up lg:grid-cols-[0.95fr,1.05fr]"><div ref={registerField("artwork-upload") as (node: HTMLDivElement | null) => void}><ArtworkSquareDropzone previewUrl={artworkPreview} fileName={artworkFile?.name} error={showErrors && artworkIssue() ? artworkIssue()?.message ?? null : artworkError} onSelect={async (file) => { await handleArtwork(file); }} />{artworkScanning ? <p className="mt-3 text-xs md:text-sm" style={{ color: "var(--text-soft)" }}>Scanning artwork for excessive text...</p> : null}{artworkWarning ? <ArtworkWarning warning={artworkWarning} /> : null}</div><div className="card-base"><p className="text-uppercase-medium" style={{ color: "var(--text-soft)" }}>Artwork checklist</p><div className="mt-3 md:mt-4 grid gap-2 md:gap-3 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}><div className="summary-card">✓ Upload a square JPG or PNG only.</div><div className="summary-card">✓ Accepted size: 1500x1500 to 4500x4500.</div><div className="summary-card">✓ Preview replaces the placeholder instantly after drop.</div></div></div></section> : null}
        {step === 3 ? (
          <section className="grid gap-6 fade-up">
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
                          className="pressable group flex min-h-[104px] w-full items-center gap-4 rounded-2xl border p-4 text-left transition duration-200 hover:-translate-y-0.5"
                          style={active ? { borderColor: "var(--accent)", background: "linear-gradient(180deg, rgba(89,223,224,0.14), rgba(89,223,224,0.045))", color: "var(--text)", boxShadow: "0 18px 48px rgba(89,223,224,0.08)" } : { borderColor: "var(--border)", background: "var(--card)", color: "var(--text-muted)" }}
                          onClick={() => togglePlatform(platform.name, "store")}
                          aria-pressed={active}
                        >
                          <span className="flex h-16 w-32 shrink-0 items-center justify-center rounded-2xl border bg-white px-4 shadow-sm" style={{ borderColor: active ? "rgba(89,223,224,0.65)" : "rgba(255,255,255,0.18)" }}>
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
                          <span className="flex h-12 w-20 items-center justify-center rounded-2xl bg-white px-3">
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
                      {selectedPlan === "pay_per_release" && youtubeContentIdEnabled
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
                    {selectedPlan === "pay_per_release" ? pricingCallout : "Use the cards above the form if you want to switch between one-time, half-yearly, and annual billing."}
                  </p>
                </div>
              </aside>
            </div>
          </section>
        ) : null}
        {step === 4 ? <section className="grid gap-4 md:gap-5 fade-up"><div className="grid gap-4 md:gap-5 lg:grid-cols-2"><div className="card-base"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-uppercase-small" style={{ color: "var(--text-soft)" }}>Tracks</p><p className="mt-2 text-lg md:text-xl font-semibold" style={{ color: "var(--text)" }}>{tracks.length} track{tracks.length > 1 ? "s" : ""} ready</p></div><button type="button" className="btn-outline pressable text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-3 w-fit" onClick={() => setStep(0)}>Edit</button></div><div className="mt-4 grid gap-3">{tracks.map((track, index) => <div key={track.id} className="rounded-[1.2rem] border p-3 md:p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><p className="text-sm md:text-base font-semibold truncate" style={{ color: "var(--text)" }}>{index + 1}. {track.trackTitle}</p><p className="mt-1 truncate text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>{namesFor(track.primaryArtistIds)} | {track.duration}</p></div><span className="rounded-full border px-2 md:px-3 py-1 text-[10px] md:text-xs uppercase tracking-[0.16em] w-fit" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>{track.versionPreset === "Other" ? track.customVersion : track.versionPreset}</span></div><div className="mt-3"><AudioWaveform src={track.audioPreviewUrl} title={track.trackTitle} subtitle="Seek the waveform to review." compact /></div></div>)}</div></div>
        <div className="card-base"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-uppercase-small" style={{ color: "var(--text-soft)" }}>Artists</p><p className="mt-2 text-lg md:text-xl font-semibold" style={{ color: "var(--text)" }}>Metadata-ready credits</p></div><button type="button" className="btn-outline pressable text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-3 w-fit" onClick={() => setStep(0)}>Edit</button></div><div className="mt-4 grid gap-2 md:gap-3">{tracks.map((track, index) => <div key={`${track.id}-artists`} className="rounded-[1.2rem] border p-3 md:p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Track {index + 1}</p><p className="mt-1 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>Primary: {namesFor(track.primaryArtistIds) || track.primaryArtistQuery || "Pending"}</p>{track.featuredArtists ? <p className="mt-0.5 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>Featured: {track.featuredArtists}</p> : null}{track.remixers ? <p className="mt-0.5 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>Remixer: {track.remixers}</p> : null}</div>)}</div></div>
        <div className="card-base"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-uppercase-small" style={{ color: "var(--text-soft)" }}>Artwork</p><p className="mt-2 text-lg md:text-xl font-semibold" style={{ color: "var(--text)" }}>Final cover preview</p></div><button type="button" className="btn-outline pressable text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-3 w-fit" onClick={() => setStep(2)}>Edit</button></div>{artworkPreview ? <img src={artworkPreview} alt="Review artwork" className="mt-4 aspect-square w-full max-w-xs rounded-[1.2rem] object-cover md:max-w-full" /> : null}{artworkWarning ? <ArtworkWarning warning={artworkWarning} /> : null}</div>
        <div className="card-base"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-uppercase-small" style={{ color: "var(--text-soft)" }}>Metadata</p><p className="mt-2 text-lg md:text-xl font-semibold" style={{ color: "var(--text)" }}>Release summary</p></div><button type="button" className="btn-outline pressable text-xs md:text-sm py-1.5 md:py-2 px-2 md:px-3 w-fit" onClick={() => setStep(1)}>Edit</button></div><div className="mt-4 grid gap-2 md:gap-3 text-xs md:text-sm">{[["Release type", releaseType === "single" ? "Single" : releaseType === "ep" ? "EP" : "Album"], [requiresReleaseTitle ? (releaseType === "ep" ? "EP Name" : "Album Name") : "Release title", displayedReleaseTitle], ["Genre", `${release.primaryGenre} / ${release.secondaryGenre}`], ["Release date", selectedReleaseDate], ["Destinations", platforms.join(", ")], ["Territory", release.territory === "Selected countries" ? release.selectedCountries.join(", ") : release.territory], ["Copyright owner", release.copyrightOwner], ["Record label", release.recordLabelName]].map(([label, value]) => <div key={String(label)} className="summary-card"><span style={{ color: "var(--text-muted)" }}>{label}</span><span className="truncate text-right">{value}</span></div>)}</div></div></div>
        <div className="grid gap-4 md:gap-5 lg:grid-cols-[1.2fr,0.8fr]"><div className="card-base"><div className="flex flex-col gap-2 md:gap-3"><div><p className="text-uppercase-medium" style={{ color: "var(--text-soft)" }}>Payment</p><h3 className="mt-2 md:mt-3 text-xl md:text-2xl font-semibold" style={{ color: "var(--text)" }}>{currentPlan.title}</h3></div><span className="rounded-full border px-2 md:px-3 py-1 text-[10px] md:text-xs uppercase tracking-[0.18em] w-fit" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>{currentPlan.cadence}</span></div><div className="mt-4 md:mt-5 grid gap-2 md:gap-3 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}><div className="summary-card"><span>What you get</span><span style={{ color: "var(--text)" }}>QC, artwork, handoff</span></div><div className="summary-card"><span>Delivery time</span><span style={{ color: "var(--text)" }}>{queue?.averageApprovalTime ?? "36-48 hrs"}</span></div><div className="rounded-xl border px-3 md:px-4 py-2.5 md:py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
  <div className="flex items-center justify-between gap-3">
    <span>Total due</span>
    <span style={{ color: "var(--text)" }} className="font-semibold">Rs {distributionAmount.toLocaleString("en-IN")}</span>
  </div>
  {selectedPlan === "pay_per_release" ? (
    <div className="mt-2 space-y-1.5 text-[11px]">
      <div className="flex items-center justify-between">
        <span>Base</span>
        <span style={{ color: "var(--text)" }}>Rs {distributionBaseAmount.toLocaleString("en-IN")}</span>
      </div>
      {trackPricingQuote.discountRate > 0 ? (
        <div className="flex items-center justify-between" style={{ color: "var(--text-soft)" }}>
          <span>Discount</span>
          <span>-Rs {trackPricingQuote.discountAmount.toLocaleString("en-IN")}</span>
        </div>
      ) : null}
      {ugcAddOnAmount > 0 ? (
        <div className="flex items-center justify-between" style={{ color: "var(--text-soft)" }}>
          <span>UGC add-on</span>
          <span>+Rs {ugcAddOnAmount.toLocaleString("en-IN")}</span>
        </div>
      ) : null}
    </div>
  ) : null}
</div></div></div>
        <div className="rounded-[1.5rem] border p-4 md:p-5" style={{ borderColor: "rgba(34,197,94,0.28)", background: "linear-gradient(180deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))" }}><div className="flex items-center gap-2 md:gap-3"><Sparkles className="h-4 md:h-5 w-4 md:w-5 flex-shrink-0" /><p className="text-xs md:text-sm uppercase tracking-[0.22em]" style={{ color: "#86efac" }}>Ready to submit</p></div><p className="mt-3 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}>We&apos;ll charge the amount, validate your package, and queue it immediately.</p>{submitting ? <div className="mt-4 rounded-[1.2rem] border p-3 md:p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div className="flex items-center justify-between gap-3 text-xs md:text-sm" style={{ color: "var(--text-muted)" }}><span>Uploading...</span><span className="font-semibold">{uploadProgress}%</span></div><div className="mt-3 h-2 md:h-3 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}><div className="shimmer-track h-full rounded-full" style={{ width: `${uploadProgress}%` }} /></div></div> : null}<button type="submit" disabled={submitting} className="btn-primary pressable mt-4 w-full disabled:opacity-60 py-2.5 md:py-3 text-sm md:text-base">{submitting ? "Processing..." : `Pay Rs ${distributionAmount.toLocaleString("en-IN")} & Submit`}</button></div></div></section> : null}
        <div className="grid gap-2 md:gap-3 md:flex md:flex-wrap md:items-center md:justify-between">
          <button type="button" disabled={step === 0 || submitting} onClick={() => setStep((value) => Math.max(value - 1, 0))} className="btn-outline pressable w-full md:w-auto py-2.5 md:py-3 disabled:opacity-40 text-sm">← Previous</button>
          <div className="grid w-full grid-cols-2 items-center gap-2 md:gap-3 md:flex md:w-auto md:flex-wrap">
            <button type="button" disabled={submitting} onClick={saveDraftRelease} className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-semibold text-amber-300 transition hover:-translate-y-0.5 hover:bg-amber-400/20 disabled:opacity-60">
              Draft
            </button>
            {step < steps.length - 1 ? <button type="button" onClick={() => { setAttemptedStep(null); setStatus(null); setStep((value) => Math.min(value + 1, steps.length - 1)); }} className="btn-primary pressable w-full md:w-auto py-2.5 md:py-3 text-sm">Next →</button> : null}
          </div>
        </div>
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


















