"use client";

import { customerMessage } from "@/lib/customer-message";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Disc3, ExternalLink, ListMusic, Pause, Play, Repeat, ShoppingBag, Volume2, VolumeX, X } from "lucide-react";
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
  const [hoveredLicense, setHoveredLicense] = useState<LicenseChoice | null>(null);
  const lastTouchRef = useRef<{ license: LicenseChoice; at: number } | null>(null);
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

  const addToCart = () => writeCartItem(beat, selected);
  const selectAndAdd = (licenseType: LicenseChoice) => {
    onSelect(licenseType);
    writeCartItem(beat, licenseType);
    onClose();
  };
  const handleTouch = (licenseType: LicenseChoice) => {
    const now = Date.now();
    const previous = lastTouchRef.current;
    onSelect(licenseType);
    if (previous?.license === licenseType && now - previous.at < 420) {
      lastTouchRef.current = null;
      selectAndAdd(licenseType);
      return;
    }
    lastTouchRef.current = { license: licenseType, at: now };
  };
  const buyNow = () => {
    writeCartItem(beat, selected);
    window.location.href = "/checkout?product=beatstore";
  };

  return (
    <div className="fixed inset-x-0 bottom-[6.25rem] top-16 z-[2147483500] grid place-items-center overflow-hidden p-2 sm:bottom-[4.75rem] sm:top-[4.5rem] sm:p-3">
      <button type="button" className="absolute inset-0 bg-black/72 backdrop-blur-md" onClick={(event) => close(event)} aria-label="Close licensing options" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Licence ${beat.title}`}
        tabIndex={-1}
        className="relative my-auto w-full max-w-[44rem] overflow-hidden rounded-[1.6rem] border border-white/12 bg-[linear-gradient(145deg,rgba(19,21,25,.98),rgba(7,8,10,.98))] p-3 shadow-[0_30px_90px_rgba(0,0,0,.7)] outline-none sm:p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-4">
            <PlayerArtwork beat={beat} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">Choose your licence</p>
              <h2 className="mt-1 truncate text-2xl font-semibold tracking-[-0.04em] text-[var(--text)]">{beat.title}</h2>
              <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{beat.producer.name} &middot; {beat.bpm} BPM &middot; {beat.keySignature || "Key not supplied"}</p>
            </div>
          </div>
          <button type="button" onClick={(event) => close(event)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--text)]" aria-label="Close licensing options"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-3 grid items-center gap-4 md:grid-cols-[16.5rem_1fr]">
          <div className="mx-auto w-full max-w-[13rem] sm:max-w-[16.5rem]">
            <div className="relative aspect-square overflow-hidden rounded-full border border-white/20 bg-[radial-gradient(circle,#181b20_0_20%,#0b0d10_21%_53%,#15181d_54%_55%,#090a0c_56%)] shadow-[0_22px_60px_rgba(0,0,0,.55),inset_0_0_0_8px_rgba(255,255,255,.025),inset_0_0_45px_rgba(255,255,255,.035)] ring-1 ring-black/60">
              <div className="grid h-full grid-cols-2 grid-rows-2">
                {options.map((option, index) => {
                  const active = selected === option.purchasableKey;
                  const lit = hoveredLicense ? hoveredLicense === option.purchasableKey : active;
                  const wheelLabel = option.id === "mp3" ? "MP3" : option.id === "wav" ? "WAV" : option.id === "stems" ? "Stems" : "Exclusive";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={option.disabled}
                      onPointerEnter={() => setHoveredLicense(option.purchasableKey)}
                      onPointerLeave={() => setHoveredLicense(null)}
                      onPointerUp={(event) => { if (event.pointerType === "touch") handleTouch(option.purchasableKey); }}
                      onClick={(event) => { if (event.detail !== 2) onSelect(option.purchasableKey); }}
                      onDoubleClick={() => selectAndAdd(option.purchasableKey)}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); selectAndAdd(option.purchasableKey); } }}
                      className={`group relative flex flex-col items-start overflow-hidden text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-35 ${index % 2 ? "border-l border-white/10 pl-8 pr-3 sm:pl-10" : "pl-4 pr-8 sm:pl-6 sm:pr-10"} ${index > 1 ? "border-t border-white/10 pb-4 pt-8 sm:pt-10" : "pb-8 pt-4 sm:pb-10 sm:pt-6"} ${lit ? "bg-[linear-gradient(145deg,var(--accent),color-mix(in_srgb,var(--accent)_72%,black))] text-[var(--accent-foreground)] shadow-[inset_0_0_28px_rgba(255,255,255,.15)]" : "bg-transparent text-white hover:bg-white/[.09]"}`}
                      aria-label={`${option.title}, ${formatMoney(option.price)}. Double click to add to cart.`}
                    >
                      <span className={`text-[9px] font-bold uppercase tracking-[.18em] ${lit ? "opacity-65" : "text-white/35"}`}>{String(index + 1).padStart(2, "0")}</span>
                      <strong className="mt-1 whitespace-nowrap text-xs leading-tight sm:text-sm">{wheelLabel}</strong>
                      <span className={`mt-1 whitespace-nowrap text-sm font-semibold sm:text-base ${lit ? "" : "text-white/70"}`}>{formatMoney(option.price)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="pointer-events-none absolute left-1/2 top-1/2 grid h-[5.35rem] w-[5.35rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_40%_30%,#242830,#090a0c_68%)] p-2 text-center shadow-[0_0_0_7px_rgba(5,6,8,.72),0_12px_28px_rgba(0,0,0,.65)]">
                <div><Disc3 className="mx-auto h-4 w-4 text-[var(--accent)]" /><span className="mt-1 block text-[8px] font-semibold uppercase tracking-[.15em] text-white/45">Double click</span><span className="block text-[9px] font-semibold text-white">Add to cart</span></div>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--text-soft)]">Current choice</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-.05em] text-[var(--text)]">{selectedOption.title}</h3>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{formatMoney(selectedOption.price)}</p>
            <p className="mt-3 text-sm leading-5 text-[var(--text-muted)]">{selectedOption.id === "mp3" ? "For writing, demos and an easy MP3 delivery." : selectedOption.id === "wav" ? "The clean release-ready file most artists need." : selectedOption.id === "stems" ? "Individual parts for a detailed custom mix." : "Full ownership with the exclusive agreement."}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
              <span className="rounded-full border border-[var(--border)] px-3 py-1.5">{selectedOption.delivery}</span>
              <span className="rounded-full border border-[var(--border)] px-3 py-1.5">{selectedOption.streamLimit}</span>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <button type="button" onClick={addToCart} className="btn-outline pressable"><ShoppingBag className="mr-2 h-4 w-4" />Add selected</button>
              <button type="button" onClick={buyNow} className="btn-primary pressable">Buy now &middot; {formatMoney(selectedOption.price)}</button>
            </div>
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
    <aside className={`fixed inset-x-0 bottom-0 z-[2147483640] border-t border-white/10 bg-black/65 shadow-[0_-12px_40px_rgba(0,0,0,0.25)] backdrop-blur-2xl transition-transform duration-300 ${collapsed && !menuOpen && !licensingOpen ? "translate-y-[calc(100%-0.4rem-env(safe-area-inset-bottom))]" : "translate-y-0"}`} onPointerEnter={() => setCollapsed(false)} onFocus={() => setCollapsed(false)}>
      <button type="button" onClick={() => setCollapsed((current) => !current)} className="absolute left-1/2 top-0 h-2 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-white/15" aria-label={collapsed ? "Expand preview player" : "Collapse preview player"} />
      <div className="mx-auto grid max-w-[1700px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 pb-[calc(0.45rem+env(safe-area-inset-bottom))] pt-2 sm:grid-cols-[minmax(180px,.75fr)_minmax(360px,1.35fr)_auto] sm:px-5">
        <button type="button" onClick={() => value.openLicensing(beat)} className="flex min-w-0 items-center gap-2.5 text-left" aria-label={`Open licence options for ${beat.title}`}>
          <span className="scale-90"><PlayerArtwork beat={beat} /></span>
          <span className="min-w-0"><span className="block truncate text-xs font-semibold text-white sm:text-sm">{beat.title}</span><span className="block truncate text-[10px] text-white/45 sm:text-xs">{beat.producer.name} · {beat.bpm} BPM</span></span>
        </button>

        <div className="order-3 col-span-2 flex min-w-0 items-center gap-2 sm:order-none sm:col-span-1">
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={value.previous} className="grid h-8 w-8 place-items-center rounded-full text-white/65 transition hover:bg-white/10 hover:text-white" aria-label="Previous beat" disabled={!canUseQueue}><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={value.togglePlay} className="grid h-10 w-10 place-items-center rounded-full bg-white text-black transition hover:scale-105" aria-label={value.playing ? `Pause ${beat.title}` : `Play ${beat.title}`}>{value.playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}</button>
            <button type="button" onClick={value.next} className="grid h-8 w-8 place-items-center rounded-full text-white/65 transition hover:bg-white/10 hover:text-white" aria-label="Next beat" disabled={!canUseQueue}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <span className="w-8 text-right font-mono text-[9px] text-white/45">{formatTime(value.currentTime)}</span>
          <input type="range" min={0} max={Math.max(1, value.duration || 1)} step={0.1} value={Math.min(value.currentTime, value.duration || value.currentTime)} onChange={(event) => value.seek(Number(event.target.value))} className="beat-player-range h-6 min-w-0 flex-1" style={{ ["--beat-progress" as string]: `${progress}%` }} aria-label={`Seek ${beat.title}`} />
          <span className="w-8 font-mono text-[9px] text-white/45">{value.duration ? `-${formatTime(Math.max(0, value.duration - value.currentTime))}` : "0:00"}</span>
        </div>

        <div className="flex items-center justify-end gap-1">
            <button type="button" onClick={() => value.setLoop(!value.loop)} className={`grid h-10 w-10 place-items-center rounded-full border transition ${value.loop ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-transparent text-[var(--text-soft)] hover:bg-white/8 hover:text-[var(--text)]"}`} aria-label={value.loop ? "Disable loop" : "Loop preview"}><Repeat className="h-4 w-4" /></button>
            <button type="button" onClick={() => value.setMuted(!value.muted)} className="hidden h-9 w-9 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white md:grid" aria-label={value.muted ? "Unmute audio" : "Mute audio"}>{value.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
            <input type="range" min={0} max={1} step={0.01} value={value.volume} onChange={(event) => value.setVolume(Number(event.target.value))} className="beat-volume-range hidden w-16 lg:block" aria-label="Preview volume" />
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((current) => !current)} className="grid h-9 w-9 place-items-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white" aria-label="More beat actions"><ListMusic className="h-4 w-4" /></button>
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
            <button type="button" onClick={addToCart} className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white transition hover:border-[var(--accent)] hover:text-[var(--accent)]" aria-label={`Add ${beat.title} to cart`}><ShoppingBag className="h-4 w-4" /></button>
            <button type="button" onClick={() => value.openLicensing(beat, "wav")} className="hidden rounded-full bg-white px-3.5 py-2 text-[10px] font-bold text-black transition hover:scale-[1.02] sm:block">From {formatMoney(fromPrice)}</button>
        </div>
        </div>
        {value.error ? <p className="mt-2 text-xs font-semibold text-red-300">{customerMessage(value.error)}</p> : null}
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
      <div className={activeBeat ? "pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-[4.75rem]" : undefined}>
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
