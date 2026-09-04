"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Disc3, ExternalLink, ListMusic, Pause, Play, Repeat, ShoppingBag, Volume2, VolumeX, X } from "lucide-react";
import { beatLicenseCatalog, beatLicensePrice, normalizeBeatLicenseType, type BeatStoreLicenseType, type StorefrontBeat } from "@/lib/beat-store";

type LicenseChoice = BeatStoreLicenseType;

type BeatPreviewContextValue = {
  activeBeat: StorefrontBeat | null;
  activeBeatId: number | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  loop: boolean;
  volume: number;
  muted: boolean;
  error: string | null;
  playBeat: (beat: StorefrontBeat, queue?: StorefrontBeat[]) => void;
  togglePlay: () => void;
  previous: () => void;
  next: () => void;
  seek: (time: number) => void;
  setLoop: (value: boolean) => void;
  setVolume: (value: number) => void;
  setMuted: (value: boolean) => void;
  openLicensing: (beat?: StorefrontBeat | null, licenseType?: LicenseChoice) => void;
  closeLicensing: () => void;
};

const BeatPreviewContext = createContext<BeatPreviewContextValue | null>(null);

function formatMoney(value: number) {
  return `\u20B9${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function fallbackImage(id: number | string) {
  const seed = typeof id === "number" ? id : id.length;
  return `/assets/producers/placeholder-${(seed % 5) + 1}.jpg`;
}

function safePreviewUrl(beat: StorefrontBeat | null) {
  return beat?.previewUrl || beat?.fileUrl || "";
}

function licensePrice(beat: StorefrontBeat, licenseType: LicenseChoice) {
  return beatLicensePrice(beat, licenseType);
}

function cartItemsFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("hymn-beat-cart") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCartItem(beat: StorefrontBeat, licenseType: LicenseChoice) {
  if (typeof window === "undefined") return;
  const next = [
    ...cartItemsFromStorage().filter((item) => Number(item?.beatId) !== beat.id),
    { beatId: beat.id, licenseType, price: licensePrice(beat, licenseType) }
  ];
  window.localStorage.setItem("hymn-beat-cart", JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("hymn-cart-updated", { detail: { count: next.length, items: next } }));
}

function PlayerArtwork({ beat, size = "small" }: { beat: StorefrontBeat; size?: "small" | "large" }) {
  const [failed, setFailed] = useState(false);
  const className = size === "large" ? "h-48 w-48 rounded-[1.5rem] sm:h-60 sm:w-60" : "h-12 w-12 rounded-xl";
  return (
    <div className={`relative shrink-0 overflow-hidden border border-white/10 bg-white/[0.04] ${className}`}>
      {!failed && beat.coverImage ? (
        <img src={beat.coverImage} alt={`${beat.title} cover artwork`} className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[linear-gradient(145deg,#11151b,#2f343d)] text-white/55">
          <Disc3 className={size === "large" ? "h-16 w-16" : "h-6 w-6"} />
        </div>
      )}
    </div>
  );
}

function LicensingSurface({ beat, open, selected, onSelect, onClose }: { beat: StorefrontBeat | null; open: boolean; selected: LicenseChoice; onSelect: (value: LicenseChoice) => void; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback((event?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    onClose();
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", handleKey);
    window.setTimeout(() => panelRef.current?.focus(), 0);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [close, open]);

  if (!beat || !open) return null;
  const options = beatLicenseCatalog.map((entry) => ({
    ...entry,
    price: licensePrice(beat, entry.purchasableKey),
    disabled: entry.purchasableKey === "exclusive" && (beat.exclusiveRemaining === 0 || licensePrice(beat, "exclusive") <= 0)
  }));
  const selectedOption = options.find((option) => option.purchasableKey === selected) ?? options[0];
  const normalizedSelected = normalizeBeatLicenseType(selectedOption.purchasableKey);
  const terms = [
    ["Files Included", normalizedSelected === "mp3" ? "MP3 deliverable only." : normalizedSelected === "wav" ? "WAV/master deliverable." : normalizedSelected === "stems" ? "Stem files if supplied by the producer." : "Stem files plus WAV/master deliverable."],
    ["Commercial Usage", selectedOption.commercialUse ? "Commercial use is allowed under the stored licence snapshot." : "Commercial use is not enabled for this licence."],
    ["Release Limit", normalizedSelected === "exclusive" ? "Complete exclusive right after successful purchase." : `${beat.generalMaxCommercialReleases ?? 1} commercial release${(beat.generalMaxCommercialReleases ?? 1) === 1 ? "" : "s"}.`],
    ["Streams / Views", beat.generalStreamingLimit ? `${beat.generalStreamingLimit.toLocaleString("en-IN")} streams/views for General Licence.` : normalizedSelected === "exclusive" ? "As stated in the exclusive agreement snapshot." : "Configured per beat/licence snapshot."],
    ["Monetisation", (normalizedSelected === "exclusive" || beat.generalMonetizationAllowed !== false) ? "Monetisation is allowed." : "Monetisation is not allowed."],
    ["Credit Requirement", normalizedSelected === "exclusive" ? "Credit terms follow the exclusive agreement." : beat.generalCreditRequired === false ? "Producer credit is optional." : "Producer credit is required."],
    ["Content ID", normalizedSelected === "exclusive" ? "Content ID is included for the exclusive buyer." : "Content ID is not allowed for this general licence."],
    ["Exclusivity", normalizedSelected === "exclusive" ? "Beat is removed from future marketplace sales after successful exclusive purchase. Prior General licences remain valid." : "Non-exclusive. The beat remains available to other customers."],
    ["Refund Policy", "Checkout and licence delivery use HYMN's existing verified purchase flow."]
  ];

  const addToCart = () => writeCartItem(beat, selected);
  const buyNow = () => {
    writeCartItem(beat, selected);
    window.location.href = "/checkout?product=beatstore";
  };

  return (
    <div className="fixed inset-0 z-[2147483500]">
      <button type="button" className="absolute inset-0 bg-black/64 backdrop-blur-sm" onClick={(event) => close(event)} aria-label="Close licensing options" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Licence ${beat.title}`}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[92svh] w-full max-w-5xl overflow-y-auto overscroll-contain rounded-t-[2rem] border border-white/10 bg-[var(--bg)] p-4 pb-28 shadow-[0_-24px_90px_rgba(0,0,0,0.45)] outline-none sm:bottom-6 sm:max-h-[min(820px,88svh)] sm:rounded-[2rem] sm:p-6 sm:pb-28"
      >
        <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-white/18 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-4">
            <PlayerArtwork beat={beat} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-soft)]">Licensing</p>
              <h2 className="mt-1 truncate text-2xl font-semibold tracking-[-0.04em] text-[var(--text)]">{beat.title}</h2>
              <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{beat.producer.name} · {beat.bpm} BPM · {beat.keySignature || "Key not supplied"}</p>
            </div>
          </div>
          <button type="button" onClick={(event) => close(event)} className="sticky top-0 z-20 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--text)] shadow-lg" aria-label="Close licensing options"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const active = selected === option.purchasableKey;
            return (
              <button
                key={option.id}
                type="button"
                disabled={option.disabled}
                onClick={() => onSelect(option.purchasableKey)}
                className={`min-h-44 rounded-[1.35rem] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)]" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">{option.title}</p>
                    <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[var(--text)]">{formatMoney(option.price)}</p>
                    <p className="mt-1 text-xs text-[var(--text-soft)]">{option.bestFor}</p>
                  </div>
                  <span className={`grid h-7 w-7 place-items-center rounded-full border ${active ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]" : "border-[var(--border)]"}`}>{active ? <Check className="h-4 w-4" /> : null}</span>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-[var(--text-muted)]">
                  <span>{option.delivery}</span>
                  <span>{option.streamLimit}</span>
                  <span>{option.exclusive ? "Exclusive after purchase" : "Beat remains available"}</span>
                  <span>{option.includesStems ? "Stems if producer uploaded them" : "No stems by default"}</span>
                </div>
              </button>
            );
          })}
        </div>

        <section className="mt-5 rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-lg font-semibold text-[var(--text)]">Usage Terms</h3>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {terms.map(([title, body]) => (
              <details key={title} className="group py-3" open={title === "Files Included" || title === "Exclusivity"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--text)]">{title}<ChevronRight className="h-4 w-4 text-[var(--text-soft)] transition group-open:rotate-90" /></summary>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-5xl border-t border-[var(--border)] bg-[var(--bg)] p-4 shadow-[0_-18px_48px_rgba(0,0,0,0.32)] sm:bottom-6 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:rounded-b-[2rem] sm:px-6">
          <p className="mb-3 text-sm text-[var(--text-muted)] sm:mb-0">Selected: <span className="font-semibold text-[var(--text)]">{selectedOption.title}</span> · {formatMoney(selectedOption.price)}</p>
          <div className="grid gap-2 sm:flex">
            <button type="button" onClick={addToCart} className="btn-outline pressable"><ShoppingBag className="mr-2 h-4 w-4" />Add to Cart</button>
            <button type="button" onClick={buyNow} className="btn-primary pressable">Buy Now · {formatMoney(selectedOption.price)}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomPlayer({ value, licensingOpen }: { value: BeatPreviewContextValue; licensingOpen: boolean }) {
  const beat = value.activeBeat;
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (licensingOpen) {
        setCollapsed(false);
        lastScrollYRef.current = window.scrollY;
        return;
      }
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const current = window.scrollY;
        const delta = current - lastScrollYRef.current;
        if (current < 80 || delta < -10) setCollapsed(false);
        else if (delta > 14 && current > 180) setCollapsed(true);
        lastScrollYRef.current = current;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [licensingOpen]);
  if (!beat) return null;
  const progress = value.duration > 0 ? Math.min(100, Math.max(0, (value.currentTime / value.duration) * 100)) : 0;
  const canUseQueue = true;
  const fromPrice = licensePrice(beat, "mp3");
  const addToCart = () => writeCartItem(beat, "mp3");
  const buyNow = () => {
    writeCartItem(beat, "mp3");
    window.location.href = "/checkout?product=beatstore";
  };

  return (
    <aside className={`fixed inset-x-0 bottom-0 z-[2147483640] border-t border-white/10 bg-[color-mix(in_srgb,var(--bg)_92%,black)] shadow-[0_-24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-transform duration-300 ${collapsed && !menuOpen && !licensingOpen ? "translate-y-[calc(100%-0.55rem-env(safe-area-inset-bottom))]" : "translate-y-0"}`} onPointerEnter={() => setCollapsed(false)} onFocus={() => setCollapsed(false)}>
      <button type="button" onClick={() => setCollapsed((current) => !current)} className="absolute left-1/2 top-0 h-4 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-[var(--card-strong)] shadow-lg" aria-label={collapsed ? "Expand preview player" : "Collapse preview player"} />
      <div className="mx-auto max-w-[1700px] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 sm:px-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-soft)]">
          <span>{formatTime(value.currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, value.duration || 1)}
            step={0.1}
            value={Math.min(value.currentTime, value.duration || value.currentTime)}
            onChange={(event) => value.seek(Number(event.target.value))}
            className="beat-player-range h-8 flex-1"
            style={{ ["--beat-progress" as string]: `${progress}%` }}
            aria-label={`Seek ${beat.title}`}
          />
          <span>{formatTime(value.duration)}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(220px,0.85fr)_minmax(240px,1fr)_minmax(230px,0.9fr)]">
          <button type="button" onClick={() => value.openLicensing(beat)} className="flex min-w-0 items-center gap-3 text-left" aria-label={`Open licence options for ${beat.title}`}>
            <PlayerArtwork beat={beat} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[var(--text)]">{beat.title}</span>
              <span className="block truncate text-xs text-[var(--text-soft)]">{beat.producer.name}</span>
            </span>
          </button>

          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <button type="button" onClick={value.previous} className="hidden h-10 w-10 place-items-center rounded-full text-[var(--text)] transition hover:bg-white/8 sm:grid" aria-label="Previous beat" disabled={!canUseQueue}><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={value.togglePlay} className="grid h-12 w-12 place-items-center rounded-full bg-white text-black shadow-[0_14px_36px_rgba(255,255,255,0.18)] transition hover:scale-105" aria-label={value.playing ? `Pause ${beat.title}` : `Play ${beat.title}`}>
              {value.playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
            </button>
            <button type="button" onClick={value.next} className="hidden h-10 w-10 place-items-center rounded-full text-[var(--text)] transition hover:bg-white/8 sm:grid" aria-label="Next beat" disabled={!canUseQueue}><ChevronRight className="h-5 w-5" /></button>
          </div>

          <div className="hidden items-center justify-end gap-2 sm:flex">
            <button type="button" onClick={() => value.setLoop(!value.loop)} className={`grid h-10 w-10 place-items-center rounded-full border transition ${value.loop ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-transparent text-[var(--text-soft)] hover:bg-white/8 hover:text-[var(--text)]"}`} aria-label={value.loop ? "Disable loop" : "Loop preview"}><Repeat className="h-4 w-4" /></button>
            <button type="button" onClick={() => value.setMuted(!value.muted)} className="grid h-10 w-10 place-items-center rounded-full text-[var(--text-soft)] transition hover:bg-white/8 hover:text-[var(--text)]" aria-label={value.muted ? "Unmute audio" : "Mute audio"}>{value.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
            <input type="range" min={0} max={1} step={0.01} value={value.volume} onChange={(event) => value.setVolume(Number(event.target.value))} className="beat-volume-range w-20" aria-label="Preview volume" />
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((current) => !current)} className="grid h-10 w-10 place-items-center rounded-full text-[var(--text-soft)] transition hover:bg-white/8 hover:text-[var(--text)]" aria-label="More beat actions"><ListMusic className="h-4 w-4" /></button>
              {menuOpen ? (
                <div className="absolute bottom-12 right-0 w-[min(92vw,560px)] overflow-hidden rounded-[1.4rem] border border-white/10 bg-[color-mix(in_srgb,var(--bg)_94%,black)] shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <PlayerArtwork beat={beat} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">{beat.title}</p>
                        <p className="truncate text-xs text-[var(--text-soft)]">{beat.producer.name} · {beat.bpm} BPM</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-full bg-white/8 text-[var(--text-soft)] transition hover:bg-white/12 hover:text-[var(--text)]" aria-label="Close beat menu"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <button type="button" onClick={() => { value.openLicensing(beat); setMenuOpen(false); }} className="rounded-2xl border border-[var(--border)] bg-white/[0.04] p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-white/[0.06]">
                      <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-soft)]">Licensing</span>
                      <span className="mt-1 block text-2xl font-bold tracking-[-0.04em] text-[var(--text)]">From {formatMoney(fromPrice)}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">Choose General or Exclusive terms</span>
                    </button>
                    <div className="grid grid-cols-2 gap-2 sm:w-56">
                      <button type="button" onClick={addToCart} className="btn-outline pressable min-h-11 text-xs"><ShoppingBag className="mr-2 h-4 w-4" />Cart</button>
                      <button type="button" onClick={buyNow} className="btn-primary pressable min-h-11 text-xs">Buy</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-2 text-xs font-semibold text-[var(--text)] sm:grid-cols-4">
                    <Link href={`/beat-store/producers/${beat.producer.slug}`} className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 hover:bg-white/8">Producer <ExternalLink className="h-3.5 w-3.5" /></Link>
                    <button type="button" onClick={() => value.setLoop(!value.loop)} className={`rounded-xl px-3 py-2 transition hover:bg-white/8 ${value.loop ? "text-[var(--accent)]" : ""}`}>{value.loop ? "Loop On" : "Loop"}</button>
                    <button type="button" onClick={() => value.setMuted(!value.muted)} className="rounded-xl px-3 py-2 transition hover:bg-white/8">{value.muted ? "Unmute" : "Mute"}</button>
                    <button type="button" onClick={() => { value.openLicensing(beat); setMenuOpen(false); }} className="rounded-xl px-3 py-2 text-[var(--accent)] transition hover:bg-white/8">Terms</button>
                  </div>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={() => value.openLicensing(beat)} className="btn-primary pressable min-h-10 px-4 text-xs">From {formatMoney(fromPrice)}</button>
          </div>
        </div>
        {value.error ? <p className="mt-2 text-xs font-semibold text-red-300">{value.error}</p> : null}
      </div>
    </aside>
  );
}

export function BeatPreviewPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<StorefrontBeat[]>([]);
  const [activeBeat, setActiveBeat] = useState<StorefrontBeat | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoopState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licensingOpen, setLicensingOpen] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<LicenseChoice>("mp3");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedVolume = Number(window.localStorage.getItem("hymn-beat-preview-volume"));
    if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) setVolumeState(savedVolume);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "none";
      audioRef.current = audio;
    }
    return audioRef.current;
  }, []);

  useEffect(() => {
    const audio = ensureAudio();
    const sync = () => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => { setError("Preview unavailable. Try another beat or refresh."); setPlaying(false); };
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    audio.addEventListener("durationchange", sync);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("loadedmetadata", sync);
      audio.removeEventListener("durationchange", sync);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, [ensureAudio]);

  useEffect(() => {
    const audio = ensureAudio();
    audio.loop = loop;
  }, [ensureAudio, loop]);

  useEffect(() => {
    const audio = ensureAudio();
    audio.volume = volume;
    audio.muted = muted;
    if (typeof window !== "undefined") window.localStorage.setItem("hymn-beat-preview-volume", String(volume));
  }, [ensureAudio, muted, volume]);

  const playBeat = useCallback((beat: StorefrontBeat, queue?: StorefrontBeat[]) => {
    const audio = ensureAudio();
    const url = safePreviewUrl(beat);
    if (!url) {
      setActiveBeat(beat);
      setError("Preview unavailable for this beat.");
      setPlaying(false);
      return;
    }
    if (queue?.length) queueRef.current = queue.filter((item) => safePreviewUrl(item));
    setError(null);
    if (activeBeat?.id === beat.id) {
      if (audio.paused) void audio.play().catch(() => setError("Tap play again to start the preview."));
      else audio.pause();
      return;
    }
    audio.pause();
    audio.src = url;
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    setActiveBeat(beat);
    void audio.play().catch(() => setError("Preview unavailable. Try again."));
  }, [activeBeat?.id, ensureAudio]);

  const playQueueOffset = useCallback((offset: number) => {
    if (!activeBeat || !queueRef.current.length) return;
    const currentIndex = queueRef.current.findIndex((beat) => beat.id === activeBeat.id);
    if (currentIndex < 0) return;
    const nextBeat = queueRef.current[(currentIndex + offset + queueRef.current.length) % queueRef.current.length];
    if (nextBeat) playBeat(nextBeat, queueRef.current);
  }, [activeBeat, playBeat]);

  const value = useMemo<BeatPreviewContextValue>(() => ({
    activeBeat,
    activeBeatId: activeBeat?.id ?? null,
    playing,
    currentTime,
    duration,
    loop,
    volume,
    muted,
    error,
    playBeat,
    togglePlay: () => {
      const audio = ensureAudio();
      if (!activeBeat) return;
      if (audio.paused) void audio.play().catch(() => setError("Preview unavailable. Try again."));
      else audio.pause();
    },
    previous: () => playQueueOffset(-1),
    next: () => playQueueOffset(1),
    seek: (time: number) => {
      const audio = ensureAudio();
      if (!Number.isFinite(time)) return;
      audio.currentTime = Math.max(0, Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time));
      setCurrentTime(audio.currentTime);
    },
    setLoop: setLoopState,
    setVolume: (next) => setVolumeState(Math.max(0, Math.min(1, next))),
    setMuted: setMutedState,
    openLicensing: (beat, licenseType = "mp3") => {
      if (beat) setActiveBeat(beat);
      setSelectedLicense(normalizeBeatLicenseType(licenseType));
      setLicensingOpen(true);
    },
    closeLicensing: () => setLicensingOpen(false)
  }), [activeBeat, currentTime, duration, ensureAudio, error, loop, muted, playBeat, playQueueOffset, playing, volume]);

  return (
    <BeatPreviewContext.Provider value={value}>
      <div className={activeBeat ? "pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:pb-[7.25rem]" : undefined}>
        {children}
      </div>
      <BottomPlayer value={value} licensingOpen={licensingOpen} />
      <LicensingSurface beat={activeBeat} open={licensingOpen} selected={selectedLicense} onSelect={setSelectedLicense} onClose={() => setLicensingOpen(false)} />
    </BeatPreviewContext.Provider>
  );
}

export function useBeatPreviewPlayer() {
  const context = useContext(BeatPreviewContext);
  if (!context) throw new Error("useBeatPreviewPlayer must be used inside BeatPreviewPlayerProvider.");
  return context;
}
