"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Filter, Pause, Play, ShoppingBag, ShoppingCart, X } from "lucide-react";
import { beatLicenseOptions, buildBeatStorefront, type StorefrontBeat } from "@/lib/beat-store";
import type { Beat, ProducerProfile } from "@/lib/types";

type LicenseChoice = "basic" | "exclusive";

type CartItem = {
  beatId: number;
  licenseType: LicenseChoice;
  price: number;
};

type SectionKey = "genre" | "mood" | "bpm" | "key";

const initialVisibleCount = 12;
const genreOptions = ["Hip Hop", "Trap", "Drill", "R&B", "Alt R&B", "Afrobeat", "Pop", "Soul Rap", "Lo-Fi", "Rage Trap", "Jersey Club", "Dancehall", "Boom Bap"];
const moodOptions = ["Dark", "Emotional", "Energetic", "Warm", "Melancholy", "Confident", "Late Night", "Chill", "Aggressive", "Romantic", "Cinematic", "Smooth"];
const keyOptions = ["Fm", "Am", "Em", "Gm", "Cm", "Dm", "C#m", "F#m", "A#m", "G", "A", "C"];
const vibePresets = [
  { label: "Late night", mood: "Dark", bpm: [80, 150] },
  { label: "Hook mode", mood: "Emotional", bpm: [70, 115] },
  { label: "High energy", mood: "Energetic", bpm: [125, 180] }
] as const;

function formatMoney(value: number) {
  return `\u20B9${value.toLocaleString("en-IN")}`;
}

function licensePrice(licenseType: LicenseChoice) {
  return beatLicenseOptions.find((option) => option.key === licenseType)?.price ?? beatLicenseOptions[0].price;
}

function toggleSelection(values: string[], value: string) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-[var(--border-strong)] hover:bg-[var(--card-strong)]"
    >
      <span>{label}</span>
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

function FilterSection({
  title,
  open,
  onToggle,
  children
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[18px] border border-[var(--border)] bg-[var(--card)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <span className="text-sm font-semibold text-[var(--text)]">{title}</span>
        <ChevronDown className={`h-4 w-4 text-[var(--text-soft)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t border-[var(--border)] px-4 py-4">{children}</div> : null}
    </section>
  );
}

function BeatCard({
  beat,
  touchMode,
  active,
  hovered,
  onHover,
  onLeave,
  onReveal,
  onPlay,
  onAdd,
  inCart
}: {
  beat: StorefrontBeat;
  touchMode: boolean;
  active: boolean;
  hovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onReveal: () => void;
  onPlay: () => void;
  onAdd: () => void;
  inCart: boolean;
}) {
  const showOverlay = touchMode ? active : hovered;

  return (
    <article
      className="group relative w-full max-w-[380px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-2 shadow-[0_18px_54px_rgba(0,0,0,0.16)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[0_28px_80px_rgba(0,0,0,0.24)]"
      onMouseEnter={touchMode ? undefined : onHover}
      onMouseLeave={touchMode ? undefined : onLeave}
      onClick={touchMode ? onReveal : undefined}
    >
      <div className="relative overflow-hidden rounded-[14px]">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] bg-[var(--surface)] sm:aspect-[5/4]">
          <Image
            src={beat.coverImage}
            alt={`${beat.title} cover artwork`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 340px, 380px"
            className={`object-cover transition duration-700 ${showOverlay ? "scale-[1.03]" : "group-hover:scale-[1.03]"}`}
            priority={false}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/64 via-black/10 to-transparent" />

          <div
            className={`absolute inset-0 flex items-center justify-center bg-black/18 transition-opacity duration-300 ${showOverlay || active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPlay();
              }}
              className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-[0_18px_50px_rgba(0,0,0,0.32)] transition hover:scale-105"
              aria-label={active ? `Pause ${beat.title}` : `Play ${beat.title}`}
            >
              {active ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
          </div>

          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 text-white">
            <span className="min-w-0 truncate rounded-full bg-black/32 px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">{beat.genre}</span>
            <span className="shrink-0 rounded-full bg-black/32 px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">{beat.bpm} BPM</span>
          </div>
        </div>

        <div className="space-y-4 px-2 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Link href={`/beat-store/producers/${beat.producer.slug}`} className="text-xs font-medium text-[var(--text-soft)] transition hover:text-[var(--text)]">
                {beat.producer.name}
              </Link>
              <h3 className="mt-1 truncate text-xl font-semibold leading-tight text-[var(--text)]">{beat.title}</h3>
            </div>
            <p className="shrink-0 text-right text-base font-semibold text-[var(--text)]">{formatMoney(beat.startingPrice)}</p>
          </div>

          <p className="line-clamp-2 min-h-10 text-sm leading-5 text-[var(--text-soft)]">{beat.shortHook}</p>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
            <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-soft)]">
              <span>{beat.keySignature}</span>
              <span className="h-1 w-1 rounded-full bg-[var(--text-soft)]/50" />
              <span className="truncate">{beat.mood}</span>
              <span className="h-1 w-1 rounded-full bg-[var(--text-soft)]/50" />
              <span className="truncate">{beat.subgenre}</span>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAdd();
              }}
              className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border px-4 text-sm font-semibold transition hover:-translate-y-0.5 ${inCart ? "border-emerald-300/70 bg-emerald-400 text-black" : "border-[var(--border)] bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-strong)]"}`}
              aria-pressed={inCart}
            >
              {inCart ? <Check className="mr-2 h-4 w-4" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
              {inCart ? "Added" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
function CartDrawer({
  open,
  cartDetails,
  total,
  onClose,
  onRemove
}: {
  open: boolean;
  cartDetails: Array<{ item: CartItem; beat: StorefrontBeat }>;
  total: number;
  onClose: () => void;
  onRemove: (beatId: number, licenseType: LicenseChoice) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  return (
    <div className={`fixed inset-0 z-50 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        aria-label="Close cart"
      />
      <aside
        className={`absolute right-0 top-0 z-10 h-full w-full max-w-[420px] border-l border-[var(--border)] bg-[var(--bg)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">Cart</p>
            <h3 className="mt-2 text-xl font-semibold text-[var(--text)]">Ready to license</h3>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            className="relative z-20 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[var(--text)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--card-strong)]"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
            aria-label="Close cart"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
          {cartDetails.length ? (
            cartDetails.map(({ item, beat }) => (
              <div key={`${item.beatId}-${item.licenseType}`} className="flex items-center gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="relative h-16 w-16 overflow-hidden rounded-[12px] border border-[var(--border)]">
                  <Image src={beat.coverImage} alt={beat.title} fill sizes="64px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">{beat.title}</p>
                  <p className="truncate text-xs text-[var(--text-soft)]">{beat.producer.name}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-soft)]">
                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5">{item.licenseType === "basic" ? "Non-exclusive" : "Exclusive"}</span>
                    <span>{formatMoney(item.price)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => onRemove(item.beatId, item.licenseType)} className="text-xs font-semibold text-[var(--text-soft)] transition hover:text-[var(--text)]">
                  Remove
                </button>
              </div>
            ))
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--text-soft)]">
              Your cart is empty. Add a beat to start the checkout flow.
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between text-sm text-[var(--text-soft)]">
            <span>Total</span>
            <span className="font-semibold text-[var(--text)]">{formatMoney(total)}</span>
          </div>
          {cartDetails.length ? (
            <Link href="/checkout?product=beatstore" className="btn-primary mt-4 w-full">
              <ShoppingBag className="mr-2 h-4 w-4" />
              Continue to checkout
            </Link>
          ) : (
            <button type="button" className="btn-primary mt-4 w-full" disabled>
              <ShoppingBag className="mr-2 h-4 w-4" />
              Continue to checkout
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function MobileFiltersModal({
  open,
  onClose,
  content
}: {
  open: boolean;
  onClose: () => void;
  content: ReactNode;
}) {
  return (
    <div className={`fixed inset-0 z-40 lg:hidden transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        aria-label="Close filters"
      />
      <div className={`absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[28px] border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[0_-24px_80px_rgba(0,0,0,0.3)] transition-transform duration-300 ${open ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-[var(--border)]" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-[var(--text)]">Refine the catalog</h3>
          </div>
          <button type="button" onClick={onClose} className="btn-outline inline-flex h-10 w-10 items-center justify-center rounded-full p-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}

export function BeatStoreExperience({ beats, producerProfiles = [] }: { beats: Beat[]; producerProfiles?: ProducerProfile[] }) {
  const { catalog } = useMemo(() => buildBeatStorefront(beats, producerProfiles), [beats, producerProfiles]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [touchMode, setTouchMode] = useState(false);
  const [hoveredBeatId, setHoveredBeatId] = useState<number | null>(null);
  const [revealedBeatId, setRevealedBeatId] = useState<number | null>(null);
  const [playingBeatId, setPlayingBeatId] = useState<number | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [selectedKey, setSelectedKey] = useState("All");
  const [bpmMin, setBpmMin] = useState(60);
  const [bpmMax, setBpmMax] = useState(180);
  const [sectionState, setSectionState] = useState<Record<SectionKey, boolean>>({ genre: true, mood: true, bpm: true, key: true });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartNotice, setCartNotice] = useState<{ beatTitle: string; action: "added" | "removed" } | null>(null);
  const [activeVibeLabel, setActiveVibeLabel] = useState<string | null>(null);

  const genres = useMemo(() => Array.from(new Set([...genreOptions, ...catalog.map((beat) => beat.genre)])).sort(), [catalog]);
  const moods = useMemo(() => Array.from(new Set([...moodOptions, ...catalog.map((beat) => beat.mood)])).sort(), [catalog]);
  const keys = useMemo(() => Array.from(new Set([...keyOptions, ...catalog.map((beat) => beat.keySignature)])).sort(), [catalog]);

  const filteredBeats = useMemo(() => {
    return catalog.filter((beat) => {
      const genreMatch = selectedGenres.length === 0 || selectedGenres.includes(beat.genre);
      const moodMatch = selectedMoods.length === 0 || selectedMoods.includes(beat.mood);
      const keyMatch = selectedKey === "All" || beat.keySignature === selectedKey;
      return genreMatch && moodMatch && keyMatch && beat.bpm >= bpmMin && beat.bpm <= bpmMax;
    });
  }, [bpmMax, bpmMin, catalog, selectedGenres, selectedKey, selectedMoods]);

  const visibleBeats = useMemo(() => filteredBeats.slice(0, visibleCount), [filteredBeats, visibleCount]);
  const cartDetails = useMemo(() => cart.map((item) => ({ item, beat: catalog.find((entry) => entry.id === item.beatId) })).filter((entry): entry is { item: CartItem; beat: StorefrontBeat } => Boolean(entry.beat)), [cart, catalog]);
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price, 0), [cart]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: none), (pointer: coarse)");
    const sync = () => setTouchMode(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("hymn-beat-cart");
    if (!raw) {
      setCartHydrated(true);
      return;
    }
    try {
      setCart(JSON.parse(raw));
    } catch {
      setCart([]);
    } finally {
      setCartHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!cartHydrated) return;
    window.localStorage.setItem("hymn-beat-cart", JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("hymn-cart-updated", { detail: { count: cart.length } }));
  }, [cart, cartHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const openCart = () => setCartOpen(true);
    window.addEventListener("hymn-open-cart", openCart);

    if (new URLSearchParams(window.location.search).get("cart") === "open") {
      setCartOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }

    return () => window.removeEventListener("hymn-open-cart", openCart);
  }, []);

  useEffect(() => {
    if (!cartNotice) return;
    const timer = window.setTimeout(() => setCartNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [cartNotice]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const body = document.body;
    if (cartOpen || mobileFiltersOpen) {
      body.style.overflow = "hidden";
    } else {
      body.style.overflow = "";
    }
    return () => {
      body.style.overflow = "";
    };
  }, [cartOpen, mobileFiltersOpen]);

  useEffect(() => {
    setVisibleCount(initialVisibleCount);
  }, [bpmMax, bpmMin, filteredBeats.length, selectedGenres, selectedKey, selectedMoods]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + initialVisibleCount, filteredBeats.length));
      },
      { rootMargin: "220px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredBeats.length]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    []
  );

  const stopPreview = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlayingBeatId(null);
  };

  const playPreview = (beat: StorefrontBeat) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    if (playingBeatId === beat.id && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingBeatId(null);
      return;
    }
    audio.pause();
    audio.src = beat.audioPreviewUrl;
    audio.currentTime = 0;
    audio.loop = false;
    audio.volume = 1;
    audio.onended = () => setPlayingBeatId((current) => (current === beat.id ? null : current));
    void audio.play().catch(() => undefined);
    setPlayingBeatId(beat.id);
  };

  const toggleCart = (beat: StorefrontBeat, licenseType: LicenseChoice = "basic") => {
    const price = licensePrice(licenseType);
    setCart((current) => {
      const exists = current.some((item) => item.beatId === beat.id && item.licenseType === licenseType);
      if (exists) {
        setCartNotice({ beatTitle: beat.title, action: "removed" });
        return current.filter((item) => !(item.beatId === beat.id && item.licenseType === licenseType));
      }
      setCartNotice({ beatTitle: beat.title, action: "added" });
      return [...current, { beatId: beat.id, licenseType, price }];
    });
  };

  const removeChip = (type: "genre" | "mood" | "key" | "bpm", value: string) => {
    if (type === "genre") setSelectedGenres((current) => current.filter((entry) => entry !== value));
    if (type === "mood") setSelectedMoods((current) => current.filter((entry) => entry !== value));
    if (type === "key") setSelectedKey("All");
    if (type === "bpm") {
      setBpmMin(60);
      setBpmMax(180);
    }
  };

  const clearFilters = () => {
    setSelectedGenres([]);
    setSelectedMoods([]);
    setSelectedKey("All");
    setBpmMin(60);
    setBpmMax(180);
    setActiveVibeLabel(null);
  };

  const applyVibePreset = (preset: (typeof vibePresets)[number]) => {
    const matchingMood = catalog.some((beat) => beat.mood === preset.mood) ? preset.mood : catalog[0]?.mood;
    setSelectedGenres([]);
    setSelectedMoods(matchingMood ? [matchingMood] : []);
    setSelectedKey("All");
    setBpmMin(preset.bpm[0]);
    setBpmMax(preset.bpm[1]);
    setActiveVibeLabel(preset.label);
  };

  const filterContent = (
    <div className="space-y-3">
      <FilterSection title="Genre" open={sectionState.genre} onToggle={() => setSectionState((current) => ({ ...current, genre: !current.genre }))}>
        <div className="grid grid-cols-2 gap-2">
          {genres.map((genre) => {
            const selected = selectedGenres.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenres((current) => toggleSelection(current, genre))}
                className={`rounded-full border px-3 py-2 text-left text-sm transition ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:border-[var(--border-strong)]"}`}
              >
                {genre}
              </button>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection title="Mood" open={sectionState.mood} onToggle={() => setSectionState((current) => ({ ...current, mood: !current.mood }))}>
        <div className="grid grid-cols-2 gap-2">
          {moods.map((mood) => {
            const selected = selectedMoods.includes(mood);
            return (
              <button
                key={mood}
                type="button"
                onClick={() => setSelectedMoods((current) => toggleSelection(current, mood))}
                className={`rounded-full border px-3 py-2 text-left text-sm transition ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:border-[var(--border-strong)]"}`}
              >
                {mood}
              </button>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection title="BPM" open={sectionState.bpm} onToggle={() => setSectionState((current) => ({ ...current, bpm: !current.bpm }))}>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-[var(--text-soft)]">
            <span>{bpmMin} BPM</span>
            <span>{bpmMax} BPM</span>
          </div>
          <div className="space-y-3">
            <input type="range" min={60} max={180} value={bpmMin} onChange={(event) => setBpmMin(Math.min(Number(event.target.value), bpmMax))} className="w-full accent-[var(--accent)]" />
            <input type="range" min={60} max={180} value={bpmMax} onChange={(event) => setBpmMax(Math.max(Number(event.target.value), bpmMin))} className="w-full accent-[var(--accent)]" />
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Key" open={sectionState.key} onToggle={() => setSectionState((current) => ({ ...current, key: !current.key }))}>
        <div className="grid grid-cols-3 gap-2">
          {["All", ...keys].map((key) => {
            const selected = selectedKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={`rounded-full border px-3 py-2 text-left text-sm transition ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] hover:border-[var(--border-strong)]"}`}
              >
                {key === "All" ? "All keys" : key}
              </button>
            );
          })}
        </div>
      </FilterSection>
    </div>
  );
  return (
    <>
      <CartDrawer
        open={cartOpen}
        cartDetails={cartDetails}
        total={cartTotal}
        onClose={() => setCartOpen(false)}
        onRemove={(beatId, licenseType) => setCart((current) => current.filter((item) => !(item.beatId === beatId && item.licenseType === licenseType)))}
      />

      <MobileFiltersModal open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} content={<div className="space-y-3">{filterContent}</div>} />

      <div
        role="status"
        aria-live="polite"
        className={`fixed right-4 top-24 z-[60] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-strong)] px-4 py-3 text-sm font-semibold text-[var(--text)] shadow-[0_18px_54px_rgba(0,0,0,0.2)] transition duration-200 ${cartNotice ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}
      >
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${cartNotice?.action === "removed" ? "bg-[var(--surface)] text-[var(--text)]" : "bg-emerald-400 text-black"}`}>
          {cartNotice?.action === "removed" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        </span>
        <span className="min-w-0 truncate">
          {cartNotice ? `${cartNotice.beatTitle} ${cartNotice.action === "added" ? "added to cart" : "removed from cart"}` : "Cart updated"}
        </span>
      </div>

      <section className="mx-auto max-w-[1700px] py-10 lg:py-14">
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="hidden self-start space-y-4 lg:block lg:sticky lg:top-24">
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5">
              <h2 className="text-2xl font-semibold text-[var(--text)]">Keep the catalogue focused.</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">
                Narrow the feed by genre, mood, BPM, and key without interrupting the buying flow.
              </p>
              <button type="button" onClick={clearFilters} className="btn-outline mt-4 w-full">
                Clear filters
              </button>
            </div>
            {filterContent}
          </aside>

          <div className="space-y-5">
            <div className="surface-card overflow-hidden p-4 sm:p-5">
              <div className="flex min-w-0 flex-col gap-5">
                <div>
                  <h2 className="text-2xl font-semibold uppercase leading-tight text-[var(--text)] sm:text-3xl">YOUR NEXT RECORD STARTS WITH THE RIGHT BEAT</h2>
                  <p className="mt-2 text-sm text-[var(--text-soft)]">
                    Showing {visibleBeats.length} of {filteredBeats.length} beats.
                    {activeVibeLabel ? ` ${activeVibeLabel} mode is active.` : ""}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {vibePresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyVibePreset(preset)}
                      className={`min-h-11 rounded-full border px-3.5 py-2 text-sm font-semibold transition hover:-translate-y-0.5 ${activeVibeLabel === preset.label ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)]"}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setMobileFiltersOpen(true)} className="btn-outline inline-flex lg:hidden">
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </button>
                <button type="button" onClick={() => setCartOpen(true)} className="btn-primary inline-flex">
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Cart ({cart.length})
                </button>
              </div>
            </div>

            {(selectedGenres.length || selectedMoods.length || selectedKey !== "All" || bpmMin !== 60 || bpmMax !== 180) ? (
              <div className="flex flex-wrap gap-2">
                {selectedGenres.map((genre) => (
                  <FilterChip key={genre} label={genre} onRemove={() => setSelectedGenres((current) => current.filter((entry) => entry !== genre))} />
                ))}
                {selectedMoods.map((mood) => (
                  <FilterChip key={mood} label={mood} onRemove={() => setSelectedMoods((current) => current.filter((entry) => entry !== mood))} />
                ))}
                {selectedKey !== "All" ? <FilterChip label={selectedKey} onRemove={() => setSelectedKey("All")} /> : null}
                {(bpmMin !== 60 || bpmMax !== 180) ? <FilterChip label={`${bpmMin}-${bpmMax} BPM`} onRemove={() => { setBpmMin(60); setBpmMax(180); }} /> : null}
              </div>
            ) : null}

            <div className="grid justify-items-center gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
              {visibleBeats.map((beat) => (
                <BeatCard
                  key={beat.id}
                  beat={beat}
                  touchMode={touchMode}
                  active={playingBeatId === beat.id}
                  hovered={hoveredBeatId === beat.id || revealedBeatId === beat.id}
                  onHover={() => {
                    setHoveredBeatId(beat.id);
                    setRevealedBeatId(null);
                    playPreview(beat);
                  }}
                  onLeave={() => {
                    setHoveredBeatId((current) => (current === beat.id ? null : current));
                    if (playingBeatId === beat.id) {
                      stopPreview();
                    }
                  }}
                  onReveal={() => {
                    if (revealedBeatId !== beat.id) {
                      setRevealedBeatId(beat.id);
                      return;
                    }
                    playPreview(beat);
                  }}
                  onPlay={() => playPreview(beat)}
                  onAdd={() => toggleCart(beat)}
                  inCart={cart.some((item) => item.beatId === beat.id && item.licenseType === "basic")}
                />
              ))}
            </div>

            <div ref={sentinelRef} className="h-6" />

            <div className="flex flex-wrap items-center justify-center gap-3">
              {visibleCount < filteredBeats.length ? (
                <button type="button" onClick={() => setVisibleCount((current) => Math.min(current + initialVisibleCount, filteredBeats.length))} className="btn-outline inline-flex">
                  Load more
                </button>
              ) : null}
              <span className="text-sm text-[var(--text-soft)]">
                {filteredBeats.length === 0 ? "No beats match these filters." : "Auto-load keeps the browse session moving."}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}



