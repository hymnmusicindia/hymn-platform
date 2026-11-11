"use client";
import "./beat-licence-dialog.css";
import "./beat-player.css";
import { PlaybackWaveform } from "./playback-waveform";
import {exclusiveBeatEligible} from "@/lib/beat-rights-policy";

import { beatUsageSummary } from '@/lib/beat-licence-terms';
import { artworkPreviewUrl } from "@/lib/artwork-preview";
import { ArtistBeatHelp, artistSignal, useArtistListening } from '@/components/artist-listening';
import { BeatFreeDownload } from "@/components/beat-free-download";
import { customerMessage } from "@/lib/customer-message";

import Link from "next/link";
import { CustomerOverlay } from "@/components/customer-overlay";
import { LicenceWheel } from "@/components/licence-wheel";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Disc3, ExternalLink, ListMusic, Pause, Play, Share2, ShoppingBag, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { beatLicenseCatalog, beatLicensePrice, normalizeBeatLicenseType, type BeatStoreLicenseType, type StorefrontBeat } from "@/lib/beat-store";

type LicenseChoice = BeatStoreLicenseType;

type BeatPreviewContextValue = {
  activeBeat: StorefrontBeat | null;
  activeBeatId: number | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  sourceUrl: string;
  loop: boolean;
  shuffle: boolean;
  volume: number;
  muted: boolean;
  error: string | null;
  playBeat: (beat: StorefrontBeat, queue?: StorefrontBeat[]) => void;
  togglePlay: () => void;
  previous: () => void;
  next: () => void;
  seek: (time: number) => void;
  setLoop: (value: boolean) => void;
  setShuffle: (value: boolean) => void;
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
  artistSignal({kind:"cart",beatId:beat.id,license:licenseType,active:true});
  window.localStorage.setItem("hymn-beat-cart", JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("hymn-cart-updated", { detail: { count: next.length, items: next } }));
}

function PlayerArtwork({ beat, size = "small" }: { beat: StorefrontBeat; size?: "small" | "large" }) {
  const [failed, setFailed] = useState(false);
  const className = size === "large" ? "h-48 w-48 rounded-[1.5rem] sm:h-60 sm:w-60" : "h-12 w-12 rounded-xl";
  return (
    <div className={`relative shrink-0 overflow-hidden border border-white/10 bg-white/[0.04] ${className}`}>
      {!failed && beat.coverImage ? (
        <img src={artworkPreviewUrl(beat.coverImage, 96)} alt={`${beat.title} cover artwork`} className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />
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
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [close, open]);

  if (!beat || !open) return null;
  const options = beatLicenseCatalog.filter(entry=>entry.purchasableKey!=="exclusive"||exclusiveBeatEligible(beat)).map((entry) => ({
    ...entry,
    price: licensePrice(beat, entry.purchasableKey),
    disabled: licensePrice(beat, entry.purchasableKey) <= 0 || (entry.purchasableKey === "exclusive" && beat.exclusiveRemaining === 0)
  }));
  const selectedOption = options.find((option) => option.purchasableKey === selected) ?? options[0];

  const addToCart = () => {if(!selectedOption.disabled)writeCartItem(beat, selectedOption.purchasableKey);};
  const selectAndAdd = (licenseType: LicenseChoice) => {
    const option=options.find(option=>option.purchasableKey===licenseType);if(!option||option.disabled)return;
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
    if(selectedOption.disabled)return;
    writeCartItem(beat, selected);
    window.location.href = "/checkout?product=beatstore";
  };

  return (
    <CustomerOverlay open={open}><div className="beat-licence-layer fixed inset-0 z-[180] grid place-items-center overflow-hidden p-2 pb-[6.75rem] sm:p-3 sm:pb-[5.5rem]">
      <button type="button" className="beat-licence-backdrop absolute inset-0" onClick={(event) => close(event)} aria-label="Close licensing options" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Licence ${beat.title}`}
        tabIndex={-1}
        className="beat-licence-panel relative my-auto max-h-[calc(100dvh-8rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-[44rem] overflow-y-auto overscroll-contain rounded-[1.6rem] border p-3 outline-none sm:p-4"
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
            <LicenceWheel
              options={options.map(option => ({ key: option.purchasableKey, label: option.id === "mp3" ? "MP3" : option.id === "wav" ? "WAV" : option.id === "stems" ? "Stems" : "Exclusive", price: option.disabled ? "Unavailable" : `${formatMoney(option.price)}${beat.availableLicenses?.includes(option.purchasableKey)?"":" - Producer delivery"}`, disabled: option.disabled }))}
              highlighted={hoveredLicense ?? selectedOption.purchasableKey}
              onHighlight={key => setHoveredLicense(key as LicenseChoice | null)}
              onSelect={key => onSelect(key as LicenseChoice)}
              onConfirm={key => selectAndAdd(key as LicenseChoice)}
              onTouch={key => handleTouch(key as LicenseChoice)}
            />
            <p className="mt-1 text-center text-[10px] text-[var(--text-soft)]">Double click or double tap to add</p>
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--text-soft)]">Current choice</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-.05em] text-[var(--text)]">{selectedOption.title}</h3>
            <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{formatMoney(selectedOption.price)}</p>
            <p className="mt-3 text-sm leading-5 text-[var(--text-muted)]">{selectedOption.id === "mp3" ? "For writing, demos and an easy MP3 delivery." : selectedOption.id === "wav" ? "The clean release-ready file most artists need." : selectedOption.id === "stems" ? "Individual parts for a detailed custom mix." : "Exclusive use; copyright transfers only under an express assignment."}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
              <span className="rounded-full border border-[var(--border)] px-3 py-1.5">{selectedOption.delivery}</span>
              <span className="rounded-full border border-[var(--border)] px-3 py-1.5">{selectedOption.exclusive ? "Exclusive use; prior licences survive" : (beat.generalStreamingLimit == null ? "No numeric stream cap" : beat.generalStreamingLimit.toLocaleString("en-IN")+" audio streams")}</span>
            </div>
            <details className="mt-3 max-h-36 overflow-y-auto text-xs text-[var(--text-muted)]"><summary className="cursor-pointer py-2 font-semibold">Usage terms before purchase</summary>{selectedOption.exclusive?<p className="leading-5">Exclusive use subject to earlier licences. Copyright is retained unless expressly assigned. Content ID requires exclusive rights to all source material and platform eligibility.</p>:<dl className="grid grid-cols-2 gap-2">{beatUsageSummary(beat).map(row=><div key={row.label}><dt>{row.label}</dt><dd className="font-semibold text-[var(--text)]">{row.value}</dd></div>)}</dl>}<p className="mt-2 leading-5">No resale of standalone files. Sample clearances and separately agreed publishing splits still apply. Obtain written permission before exceeding the grant.</p></details>
            <ArtistBeatHelp beatId={beat.id}/>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <button type="button" disabled={selectedOption.disabled} onClick={addToCart} className="btn-outline pressable"><ShoppingBag className="mr-2 h-4 w-4" />Add selected</button>
              <button type="button" disabled={selectedOption.disabled} onClick={buyNow} className="btn-primary pressable">Buy now &middot; {formatMoney(selectedOption.price)}</button>
            </div>
          </div>
        </div>

      </div>
    </div></CustomerOverlay>
  );
}

function BottomPlayer({ value, licensingOpen }: { value: BeatPreviewContextValue; licensingOpen: boolean }) {
  const beat = value.activeBeat;
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); menuRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')?.focus(); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false); };
    window.addEventListener("keydown", key); window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pointerdown", outside); };
  }, [menuOpen]);
  useEffect(() => { if (!shareNotice || menuOpen) return; const timeout = setTimeout(() => setShareNotice(""), 4000); return () => clearTimeout(timeout); }, [shareNotice, menuOpen]);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    setCollapsed(licensingOpen);
    lastScrollYRef.current = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const current = window.scrollY;
        const delta = current - lastScrollYRef.current;
        if (licensingOpen) {
          if (delta > 8) setCollapsed(false);
          lastScrollYRef.current = current;
          return;
        }
        if (current < 80 || delta < -10) setCollapsed(false);
        else if (delta > 14 && current > 180) setCollapsed(true);
        lastScrollYRef.current = current;
      });
    };
    const onWheel = (event: WheelEvent) => {
      if (licensingOpen && event.deltaY > 8) setCollapsed(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
    };
  }, [licensingOpen]);
  useEffect(() => { setShareNotice(""); setMenuOpen(false); }, [value.activeBeatId]);
  useEffect(() => {
    if (value.playing) setCollapsed(false);
  }, [value.activeBeatId, value.playing]);
  if (!beat) return null;
  const fromPrice = licensePrice(beat, "mp3");
  const addToCart = () => writeCartItem(beat, "mp3");
  const buyNow = () => { writeCartItem(beat, "mp3"); window.location.href = "/checkout?product=beatstore"; };
  const shareUrl = typeof window === "undefined" ? "" : new URL(`${beat.producer.slug ? `/beat-store/producers/${encodeURIComponent(beat.producer.slug)}` : "/beat-store"}#beat-${beat.id}`, window.location.origin).href;
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: beat.title, text: `${beat.title} by ${beat.producer.name} on HYMN Music`, url: shareUrl }); return; }
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl); setShareNotice("Beat link copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareNotice("Copy the beat link from More actions."); setMenuOpen(true);
    }
  };
  return <aside aria-label="Now playing" className="beat-player-surface hymn-player" data-collapsed={collapsed && !menuOpen} onPointerEnter={() => setCollapsed(false)} onPointerLeave={() => { if (licensingOpen) setCollapsed(true); }} onFocus={() => setCollapsed(false)}>
    <div className="hymn-player-shell">
      <button type="button" className="hymn-player-cover" onClick={value.togglePlay} aria-label={value.playing ? `Pause ${beat.title}` : `Play ${beat.title}`}>
        <PlayerArtwork key={beat.id} beat={beat}/><span>{value.playing ? <Pause fill="currentColor"/> : <Play fill="currentColor"/>}</span>
      </button>
      <button type="button" className="hymn-player-info" onClick={() => value.openLicensing(beat)} aria-label={`Open licence options for ${beat.title}`}>
        <strong title={beat.title}>{beat.title}</strong><small>{beat.producer.name}<span className="hymn-player-bpm">{beat.bpm ? ` · ${beat.bpm} BPM` : ""}</span></small>
      </button>
      <div className="hymn-player-transport">
        <button type="button" className="hymn-player-icon" onClick={value.previous} aria-label="Previous beat"><SkipBack size={17}/></button>
        <button type="button" className="hymn-player-icon" onClick={value.next} aria-label="Next beat"><SkipForward size={17}/></button>
      </div>
      <div className="hymn-player-timeline"><PlaybackWaveform src={value.sourceUrl || safePreviewUrl(beat)} title={beat.title} currentTime={value.currentTime} duration={value.duration} seek={value.seek}/><div className="hymn-player-time"><span>{formatTime(value.currentTime)}</span><span>{formatTime(value.duration)}</span></div></div>
      <div className="hymn-player-actions">
        <div className="hymn-player-volume"><button type="button" className="hymn-player-icon" onClick={() => value.setMuted(!value.muted)} aria-label={value.muted ? "Unmute audio" : "Mute audio"}>{value.muted ? <VolumeX/> : <Volume2/>}</button><input className="hymn-player-volume-slider" style={{ background: `linear-gradient(to right, #fff ${value.volume * 100}%, #ffffff30 ${value.volume * 100}%)` }} type="range" min="0" max="1" step="0.01" value={value.volume} onChange={event => value.setVolume(Number(event.target.value))} aria-label="Preview volume"/></div>
        <button type="button" className="hymn-player-icon" onClick={() => void share()} aria-label={`Share ${beat.title}`}><Share2/></button>
        <div className="relative" ref={menuRef}><button type="button" className="hymn-player-icon" onClick={() => setMenuOpen(current => !current)} aria-label="More beat actions" aria-expanded={menuOpen} aria-controls={menuId} aria-haspopup="dialog"><ListMusic/></button>
              {menuOpen ? (
                <div id={menuId} role="dialog" aria-label={`Beat actions for ${beat.title}`} className="hymn-player-menu absolute bottom-12 right-0 w-[min(92vw,560px)] overflow-hidden rounded-[1.4rem] border border-white/10 bg-[var(--card)] shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
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
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2"><div className="flex gap-1"><button type="button" className="hymn-player-icon" onClick={value.previous} aria-label="Previous beat"><SkipBack size={17}/></button><button type="button" className="hymn-player-icon" onClick={value.next} aria-label="Next beat"><SkipForward size={17}/></button><button type="button" className="hymn-player-icon" onClick={() => value.setShuffle(!value.shuffle)} aria-label="Shuffle beats" aria-pressed={value.shuffle}><Shuffle size={17}/></button></div><BeatFreeDownload key={beat.id} id={beat.id} title={beat.title}/><label className="flex items-center gap-2 text-xs"><Volume2 size={15}/><input className="hymn-player-volume-slider" style={{ background: `linear-gradient(to right, #fff ${value.volume * 100}%, #ffffff30 ${value.volume * 100}%)` }} aria-label="Preview volume" type="range" min="0" max="1" step="0.01" value={value.volume} onChange={event => value.setVolume(Number(event.target.value))}/></label></div>
                  {shareNotice ? <div className="px-4 pb-3"><input className="hymn-player-share-link" aria-label="Share beat link" value={shareUrl} readOnly onFocus={event => event.target.select()}/></div> : null}
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-2 text-xs font-semibold text-[var(--text)] sm:grid-cols-4">
                    <Link href={`/beat-store/producers/${beat.producer.slug}`} className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 hover:bg-white/8">Producer <ExternalLink className="h-3.5 w-3.5" /></Link>
                    <button type="button" onClick={() => value.setLoop(!value.loop)} className={`rounded-xl px-3 py-2 transition hover:bg-white/8 ${value.loop ? "text-[var(--accent)]" : ""}`}>{value.loop ? "Loop On" : "Loop"}</button>
                    <button type="button" onClick={() => value.setMuted(!value.muted)} className="rounded-xl px-3 py-2 transition hover:bg-white/8">{value.muted ? "Unmute" : "Mute"}</button>
                    <button type="button" onClick={() => { value.openLicensing(beat); setMenuOpen(false); }} className="rounded-xl px-3 py-2 text-[var(--accent)] transition hover:bg-white/8">Terms</button>
                  </div>
                </div>
              ) : null}
        </div>
        <button type="button" className="hymn-player-price" onClick={() => value.openLicensing(beat, "wav")}>From {formatMoney(fromPrice)}</button>
      </div>
    </div>
    {value.error || shareNotice ? <p className="hymn-player-status" role={value.error ? "alert" : "status"}>{value.error ? customerMessage(value.error) : shareNotice}</p> : null}
  </aside>;
}

export function BeatPreviewPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<StorefrontBeat[]>([]);
  const activeBeatRef = useRef<StorefrontBeat | null>(null);
  const attemptRef = useRef(0);
  const [activeBeat, setActiveBeat] = useState<StorefrontBeat | null>(null);
  useArtistListening(audioRef, activeBeat?.id ?? null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sourceUrl, setSourceUrl] = useState("");
  const [loop, setLoopState] = useState(false);
  const [shuffle, setShuffleState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licensingOpen, setLicensingOpen] = useState(false);
  const [licensingBeat, setLicensingBeat] = useState<StorefrontBeat | null>(null);
  const [selectedLicense, setSelectedLicense] = useState<LicenseChoice>("mp3");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedVolume = window.localStorage.getItem("hymn-beat-preview-volume");
    const savedVolume = storedVolume === null ? 1 : Number(storedVolume);
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

  useEffect(() => () => {
    attemptRef.current++;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.src = "";
  }, []);

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
    if (queue?.length) queueRef.current = queue.filter(item => safePreviewUrl(item));
    const previous = ensureAudio();
    if (activeBeatRef.current?.id === beat.id && previous.src && !previous.error) {
      if (!previous.paused) { previous.pause(); return; }
      const attempt = attemptRef.current;
      void previous.play().catch(reason => {
        if (attempt !== attemptRef.current || reason?.name === "AbortError") return;
        setError(reason?.name === "NotAllowedError" ? "Tap play to start the preview." : "Unable to play. Tap play to retry.");
      });
      return;
    }
    const attempt = ++attemptRef.current;
    previous.pause();
    previous.removeAttribute("src");
    previous.load();
    activeBeatRef.current = beat;
    setActiveBeat(beat);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
    const sources = [...new Set([beat.previewUrl, beat.fileUrl].filter(Boolean))];
    let index = 0;
    function start() {
      if (attempt !== attemptRef.current) return;
      const url = sources[index++];
      if (!url) { setPlaying(false); setError("Preview unavailable for this beat. Tap play to retry."); return; }
      const audio = new Audio();
      audio.preload = "metadata";
      audio.volume = previous.volume;
      audio.muted = previous.muted;
      audio.loop = previous.loop;
      audioRef.current = audio;
      let failed = false;
      const current = () => attempt === attemptRef.current && audioRef.current === audio;
      const fail = () => {
        if (!current() || failed) return;
        failed = true;
        clearTimeout(timeout);
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        start();
      };
      audio.ontimeupdate = audio.onloadedmetadata = audio.ondurationchange = () => {
        if (!current()) return;
        setCurrentTime(audio.currentTime || 0);
        setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      };
      audio.onplaying = () => { clearTimeout(timeout); if (current()) { setPlaying(true); setError(null); } };
      audio.onpause = () => { clearTimeout(timeout); if (current()) setPlaying(false); };
      audio.onerror = fail;
      const timeout = setTimeout(fail, 12000);
      audio.src = url;
      setSourceUrl(url);
      // Start inside the original tap, without a fetch/await that loses iOS activation.
      void audio.play().catch(reason => {
        if (!current() || reason?.name === "AbortError") return;
        if (reason?.name === "NotAllowedError") {
          clearTimeout(timeout);
          setPlaying(false);
          setError("Tap play to start the preview.");
        } else fail();
      });
    }
    start();
  }, [ensureAudio]);

  const playQueueOffset = useCallback((offset: number) => {
    if (!activeBeat || !queueRef.current.length) return;
    const currentIndex = queueRef.current.findIndex((beat) => beat.id === activeBeat.id);
    if (currentIndex < 0) return;
    const randomIndex = queueRef.current.length > 1
      ? (currentIndex + 1 + Math.floor(Math.random() * (queueRef.current.length - 1))) % queueRef.current.length
      : currentIndex;
    const nextIndex = shuffle ? randomIndex : (currentIndex + offset + queueRef.current.length) % queueRef.current.length;
    const nextBeat = queueRef.current[nextIndex];
    if (nextBeat) playBeat(nextBeat, queueRef.current);
  }, [activeBeat, playBeat, shuffle]);

  const value = useMemo<BeatPreviewContextValue>(() => ({
    activeBeat,
    activeBeatId: activeBeat?.id ?? null,
    playing,
    currentTime,
    duration,
    sourceUrl,
    loop,
    shuffle,
    volume,
    muted,
    error,
    playBeat,
    togglePlay: () => {
      if (activeBeat) playBeat(activeBeat);
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
    setShuffle: setShuffleState,
    setVolume: (next) => setVolumeState(Math.max(0, Math.min(1, next))),
    setMuted: setMutedState,
    openLicensing: (beat, licenseType = "mp3") => {
      const chosen=beat ?? activeBeat;if(chosen)artistSignal({kind:"licence",beatId:chosen.id,license:licenseType});
      setLicensingBeat(chosen);
      setSelectedLicense(normalizeBeatLicenseType(licenseType));
      setLicensingOpen(true);
    },
    closeLicensing: () => setLicensingOpen(false)
  }), [activeBeat, currentTime, duration, sourceUrl, ensureAudio, error, loop, muted, playBeat, playQueueOffset, playing, shuffle, volume]);

  return (
    <BeatPreviewContext.Provider value={value}>
      <div className={activeBeat ? "pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-[7rem]" : undefined}>
        {children}
      </div>
      <BottomPlayer value={value} licensingOpen={licensingOpen} />
      <LicensingSurface beat={licensingBeat ?? activeBeat} open={licensingOpen} selected={selectedLicense} onSelect={setSelectedLicense} onClose={() => setLicensingOpen(false)} />
    </BeatPreviewContext.Provider>
  );
}

export function useBeatPreviewPlayer() {
  const context = useContext(BeatPreviewContext);
  if (!context) throw new Error("useBeatPreviewPlayer must be used inside BeatPreviewPlayerProvider.");
  return context;
}
