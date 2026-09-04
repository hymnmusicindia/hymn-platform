"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, Check, ChevronDown, Disc3, ExternalLink, Filter, Gauge, Globe2, Instagram, Music2, Search, ShoppingBag, Sparkles, Users2, X, Youtube } from "lucide-react";
import { beatLicenseLabel, beatLicensePrice, buildBeatStorefront, normalizeBeatLicenseType, type BeatStoreLicenseType, type StorefrontBeat } from "@/lib/beat-store";
import type { Beat, ProducerProfile } from "@/lib/types";
import { BeatCard } from "@/components/beat-card";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import { useBeatPreviewPlayer } from "@/components/beat-preview-player";

type LicenseChoice = BeatStoreLicenseType;

type CartItem = {
  beatId: number;
  licenseType: LicenseChoice;
  price: number;
};

type SectionKey = "genre" | "mood" | "bpm" | "key";

const initialVisibleCount = 12;

function formatMoney(value: number) {
  return `\u20B9${value.toLocaleString("en-IN")}`;
}

function licensePrice(beat: StorefrontBeat, licenseType: LicenseChoice) {
  return beatLicensePrice(beat, licenseType);
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
  const SectionIcon = title === "Genre" ? Disc3 : title === "Mood" ? Sparkles : title === "BPM" ? Gauge : Music2;
  return (
    <section className={`overflow-hidden rounded-[18px] border bg-[var(--card)] transition-[border-color,box-shadow] duration-300 ${open ? "border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] shadow-[0_12px_32px_rgba(0,0,0,0.08)]" : "border-[var(--border)]"}`}>
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--bg-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
      >
        <span className="flex items-center gap-3">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition ${open ? "border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] bg-[var(--bg-soft)] text-[var(--text-soft)] group-hover:text-[var(--text)]"}`}>
            <SectionIcon className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-[var(--text)]">{title}</span>
        </span>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-soft)]">
          <ChevronDown className={`h-3.5 w-3.5 text-[var(--text-soft)] transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? <div className="border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-soft)_45%,var(--card))] px-4 py-4">{children}</div> : null}
    </section>
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
  const dialogRef = useAccessibleDialog(open, onClose);
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
        ref={dialogRef as React.RefObject<HTMLElement | null>}
        className={`absolute right-0 top-0 z-10 h-full w-full max-w-[420px] border-l border-[var(--border)] bg-[var(--bg)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        tabIndex={-1}
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
                  <img src={beat.coverImage} alt={beat.title} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={(event) => replaceBrokenImage(event, getFallbackImage(beat.id))} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">{beat.title}</p>
                  <p className="truncate text-xs text-[var(--text-soft)]">{beat.producer.name}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-soft)]">
                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5">{beatLicenseLabel(item.licenseType)}</span>
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
  const dialogRef = useAccessibleDialog(open, onClose);
  return (
    <div className={`fixed inset-0 z-40 lg:hidden transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        aria-label="Close filters"
      />
      <div ref={dialogRef as React.RefObject<HTMLDivElement | null>} role="dialog" aria-modal="true" aria-labelledby="beat-filter-title" tabIndex={-1} className={`absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[28px] border border-[var(--border)] bg-[var(--bg)] p-4 shadow-[0_-24px_80px_rgba(0,0,0,0.3)] transition-transform duration-300 ${open ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-[var(--border)]" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-soft)]">Filters</p>
            <h3 id="beat-filter-title" className="mt-2 text-xl font-semibold text-[var(--text)]">Refine the catalog</h3>
          </div>
          <button type="button" onClick={onClose} className="btn-outline inline-flex h-11 w-11 items-center justify-center rounded-full p-0" aria-label="Close filters">
            <X className="h-4 w-4" />
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}


function getFallbackImage(id: number | string) {
  const index = (typeof id === 'number' ? id : id.charCodeAt(0)) % 5 + 1;
  return `/assets/producers/placeholder-${index}.jpg`;
}

function replaceBrokenImage(event: SyntheticEvent<HTMLImageElement>, fallback: string) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.srcset = "";
  image.src = fallback;
}

function SpotifyMark({ className = "h-4 w-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M12 1.8A10.2 10.2 0 1 0 12 22.2 10.2 10.2 0 0 0 12 1.8Zm4.68 14.7a.64.64 0 0 1-.88.21c-2.4-1.47-5.43-1.8-8.99-.99a.64.64 0 1 1-.28-1.25c3.9-.89 7.25-.51 9.94 1.13.3.18.4.58.21.9Zm1.25-2.77a.8.8 0 0 1-1.1.26c-2.75-1.69-6.95-2.18-10.2-1.19a.8.8 0 1 1-.47-1.53c3.72-1.13 8.35-.59 11.5 1.35.38.23.5.73.27 1.11Zm.11-2.89C14.74 8.88 9.3 8.7 6.15 9.66a.96.96 0 1 1-.56-1.84c3.62-1.1 9.63-.89 13.43 1.36a.96.96 0 0 1-.98 1.66Z" /></svg>;
}

export function BeatStoreExperience({ beats, producerProfiles = [] }: { beats: Beat[]; producerProfiles?: ProducerProfile[] }) {
  const searchParams = useSearchParams();
  const displayProducerProfiles = producerProfiles;
  const displayBeats = beats;
  const { catalog } = useMemo(() => buildBeatStorefront(displayBeats, displayProducerProfiles), [displayBeats, displayProducerProfiles]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const beatPlayer = useBeatPreviewPlayer();
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [onboardingBudgetMax, setOnboardingBudgetMax] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState("All");
  const [bpmMin, setBpmMin] = useState(60);
  const [bpmMax, setBpmMax] = useState(180);
  const [draftBpmMin, setDraftBpmMin] = useState(60);
  const [draftBpmMax, setDraftBpmMax] = useState(180);
  const [selectedProducerSlug, setSelectedProducerSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [previewProducerIndex, setPreviewProducerIndex] = useState(0);
  const [producerDetailsOpen, setProducerDetailsOpen] = useState(false);
  const [sectionState, setSectionState] = useState<Record<SectionKey, boolean>>({ genre: true, mood: true, bpm: true, key: true });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartNotice, setCartNotice] = useState<{ beatTitle: string; action: "added" | "removed" } | null>(null);

  const genres = useMemo(() => Array.from(new Set(catalog.map((beat) => beat.genre))).sort(), [catalog]);
  const moods = useMemo(() => Array.from(new Set(catalog.map((beat) => beat.mood))).sort(), [catalog]);
  const keys = useMemo(() => Array.from(new Set(catalog.map((beat) => beat.keySignature))).sort(), [catalog]);

  const filteredBeats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = catalog.filter((beat) => {
      const genreMatch = selectedGenres.length === 0 || selectedGenres.includes(beat.genre);
      const moodMatch = selectedMoods.length === 0 || selectedMoods.includes(beat.mood);
      const budgetMatch = onboardingBudgetMax === null || beat.startingPrice <= onboardingBudgetMax;
      const keyMatch = selectedKey === "All" || beat.keySignature === selectedKey;
      const producerMatch = !selectedProducerSlug || beat?.producer?.slug === selectedProducerSlug;
      const searchMatch = !query || [beat.title, beat.producer.name, beat.genre, beat.mood, beat.keySignature, beat.typeBeat, beat.vibeTag, String(beat.bpm)].some((value) => value.toLowerCase().includes(query));
      return genreMatch && moodMatch && budgetMatch && keyMatch && producerMatch && searchMatch && beat.bpm >= bpmMin && beat.bpm <= bpmMax;
    });
    return [...matches].sort((a, b) => sortBy === "price-asc" ? a.startingPrice - b.startingPrice : sortBy === "price-desc" ? b.startingPrice - a.startingPrice : sortBy === "bpm-asc" ? a.bpm - b.bpm : sortBy === "bpm-desc" ? b.bpm - a.bpm : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [bpmMax, bpmMin, catalog, onboardingBudgetMax, searchQuery, selectedGenres, selectedKey, selectedMoods, selectedProducerSlug, sortBy]);

  useEffect(() => {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const genre = searchParams.get("genre"); const mood = searchParams.get("mood"); const budgetMax = Number(searchParams.get("budgetMax"));
    if (genre) { const match = genres.find(value => normalize(value) === genre); if (match) setSelectedGenres([match]); }
    if (mood) { const match = moods.find(value => normalize(value) === mood || normalize(value).includes(mood.split("-")[0])); if (match) setSelectedMoods([match]); }
    if (Number.isFinite(budgetMax) && budgetMax > 0) setOnboardingBudgetMax(budgetMax);
  }, [genres, moods, searchParams]);

  const selectedProducer = useMemo(() => displayProducerProfiles.find((producer) => producer.slug === selectedProducerSlug) ?? null, [displayProducerProfiles, selectedProducerSlug]);
  const previewProducer = displayProducerProfiles[previewProducerIndex % Math.max(displayProducerProfiles.length, 1)] ?? null;
  const spotlightProducer = selectedProducer ?? previewProducer;
  const otherProducers = useMemo(() => displayProducerProfiles.filter((producer) => producer.slug !== spotlightProducer?.slug).slice(0, 5), [displayProducerProfiles, spotlightProducer?.slug]);
  const producerSocials = spotlightProducer ? [
    { label: "Instagram", href: spotlightProducer.instagramUrl, icon: <Instagram className="h-4 w-4" /> },
    { label: "YouTube", href: spotlightProducer.youtubeUrl, icon: <Youtube className="h-4 w-4" /> },
    { label: "Spotify", href: spotlightProducer.spotifyUrl, icon: <SpotifyMark /> },
    { label: "Website", href: spotlightProducer.websiteUrl, icon: <Globe2 className="h-4 w-4" /> }
  ].filter((item) => Boolean(item.href)) : [];
  useEffect(() => {
    if (selectedProducerSlug !== null || displayProducerProfiles.length < 2) return;
    const timer = window.setInterval(() => {
      setPreviewProducerIndex((current) => (current + 1) % displayProducerProfiles.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [displayProducerProfiles.length, selectedProducerSlug]);

  useEffect(() => {
    setDraftBpmMin(bpmMin);
    setDraftBpmMax(bpmMax);
  }, [bpmMax, bpmMin]);

  const commitBpmRange = (nextMin: number, nextMax: number) => {
    const scrollPosition = window.scrollY;
    setBpmMin(nextMin);
    setBpmMax(nextMax);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollPosition, behavior: "instant" }));
    });
  };

  const visibleBeats = useMemo(() => filteredBeats.slice(0, visibleCount), [filteredBeats, visibleCount]);
  const cartDetails = useMemo(() => cart.map((item) => ({ item, beat: catalog.find((entry) => entry.id === item.beatId) })).filter((entry): entry is { item: CartItem; beat: StorefrontBeat } => Boolean(entry.beat)), [cart, catalog]);
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price, 0), [cart]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("hymn-beat-cart");
    if (!raw) {
      setCartHydrated(true);
      return;
    }
    try {
      setCart((JSON.parse(raw) as Array<{ beatId: number; licenseType: string; price?: number }>).map((item) => ({ beatId: item.beatId, licenseType: normalizeBeatLicenseType(item.licenseType), price: Number(item.price ?? 0) })));
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
    const syncCart = (event?: Event) => {
      const detailItems = event instanceof CustomEvent && Array.isArray(event.detail?.items) ? event.detail.items : null;
      const rawItems = detailItems ?? JSON.parse(window.localStorage.getItem("hymn-beat-cart") || "[]");
      if (!Array.isArray(rawItems)) return;
      const normalized: CartItem[] = rawItems
        .map((item) => ({ beatId: Number(item.beatId), licenseType: normalizeBeatLicenseType(item.licenseType), price: Number(item.price ?? 0) }))
        .filter((item): item is CartItem => Number.isInteger(item.beatId) && item.beatId > 0);
      setCart(normalized);
    };
    window.addEventListener("hymn-cart-updated", syncCart);
    window.addEventListener("storage", syncCart);
    return () => {
      window.removeEventListener("hymn-cart-updated", syncCart);
      window.removeEventListener("storage", syncCart);
    };
  }, []);

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
  }, [bpmMax, bpmMin, filteredBeats.length, selectedGenres, selectedKey, selectedMoods, selectedProducerSlug]);

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

  const playPreview = (beat: StorefrontBeat) => {
    beatPlayer.playBeat(beat, filteredBeats);
  };

  const toggleCart = (beat: StorefrontBeat, licenseType: LicenseChoice = "mp3") => {
    const price = licensePrice(beat, licenseType);
    setCart((current) => {
      const exists = current.some((item) => item.beatId === beat.id && item.licenseType === licenseType);
      if (exists) {
        setCartNotice({ beatTitle: beat.title, action: "removed" });
        return current.filter((item) => !(item.beatId === beat.id && item.licenseType === licenseType));
      }
      setCartNotice({ beatTitle: beat.title, action: "added" });
      return [...current.filter((item) => item.beatId !== beat.id), { beatId: beat.id, licenseType, price }];
    });
  };

  const clearFilters = () => {
    setSelectedGenres([]);
    setSelectedMoods([]);
    setSelectedKey("All");
    setBpmMin(60);
    setBpmMax(180);
    setDraftBpmMin(60);
    setDraftBpmMax(180);
  };

  const filterContent = (
    <div className="space-y-2.5 rounded-[1.5rem] border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_72%,transparent)] p-2 shadow-[0_18px_48px_rgba(0,0,0,0.08)]">
      <FilterSection title="Genre" open={sectionState.genre} onToggle={() => setSectionState((current) => ({ ...current, genre: !current.genre }))}>
        <div className="grid grid-cols-2 gap-2">
          {genres.map((genre) => {
            const selected = selectedGenres.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                onClick={() => setSelectedGenres((current) => toggleSelection(current, genre))}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:text-[var(--text)]"}`}
              >
                <span className="truncate">{genre}</span>
                {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" /> : null}
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
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--text-soft)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:text-[var(--text)]"}`}
              >
                <span className="truncate">{mood}</span>
                {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" /> : null}
              </button>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection title="BPM" open={sectionState.bpm} onToggle={() => setSectionState((current) => ({ ...current, bpm: !current.bpm }))}>
        <div className="space-y-5 py-1">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[var(--text)]">{draftBpmMin} BPM</span>
            <span className="text-[0.62rem] uppercase tracking-[0.16em] text-[var(--text-soft)]">Selected range</span>
            <span className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-[var(--text)]">{draftBpmMax} BPM</span>
          </div>
          <div className="relative h-7">
            <div className="absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--border)]" />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--accent)]"
              style={{ left: `calc(0.5rem + ${(draftBpmMin - 60) / 1.2}%)`, right: `calc(0.5rem + ${(180 - draftBpmMax) / 1.2}%)` }}
            />
            <input
              type="range"
              min={60}
              max={180}
              value={draftBpmMin}
              onChange={(event) => setDraftBpmMin(Math.min(Number(event.target.value), draftBpmMax))}
              onPointerUp={(event) => commitBpmRange(Math.min(Number(event.currentTarget.value), draftBpmMax), draftBpmMax)}
              onKeyUp={() => commitBpmRange(draftBpmMin, draftBpmMax)}
              onBlur={() => commitBpmRange(draftBpmMin, draftBpmMax)}
              className="bpm-range absolute inset-0 z-20 w-full"
              aria-label="Minimum BPM"
            />
            <input
              type="range"
              min={60}
              max={180}
              value={draftBpmMax}
              onChange={(event) => setDraftBpmMax(Math.max(Number(event.target.value), draftBpmMin))}
              onPointerUp={(event) => commitBpmRange(draftBpmMin, Math.max(Number(event.currentTarget.value), draftBpmMin))}
              onKeyUp={() => commitBpmRange(draftBpmMin, draftBpmMax)}
              onBlur={() => commitBpmRange(draftBpmMin, draftBpmMax)}
              className="bpm-range absolute inset-0 z-10 w-full"
              aria-label="Maximum BPM"
            />
          </div>
          <div className="flex justify-between text-[0.62rem] font-medium uppercase tracking-[0.12em] text-[var(--text-soft)]">
            <span>60 BPM</span>
            <span>180 BPM</span>
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Key" open={sectionState.key} onToggle={() => setSectionState((current) => ({ ...current, key: !current.key }))}>
        <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} className="field w-full rounded-xl border-[var(--border)] bg-[var(--card)] font-medium">
          <option value="All">All keys</option>
          {keys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
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

      <section className="mx-auto max-w-[1700px] pb-10 pt-0 lg:pb-14">
        <div className="mb-10 sm:mb-14">
          <div key={selectedProducer?.slug ?? "all-producers"} className="fade-up mt-3 overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[var(--card)] shadow-[0_22px_65px_rgba(0,0,0,0.14)] sm:rounded-[2rem]">
            <div className="grid md:min-h-[420px] md:grid-cols-2">
              <div key={spotlightProducer?.slug ?? "producer-room"} className="producer-spotlight-enter relative z-10 flex flex-col justify-center bg-[var(--card)] p-6 sm:p-9 lg:p-12">
                {selectedProducer ? <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">Producer spotlight</p> : null}
                <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text)] sm:text-5xl">{spotlightProducer ? spotlightProducer.name || "Unnamed producer" : "Explore beats from every producer."}</h3>
                <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--text-muted)] sm:text-base sm:leading-7">
                  {spotlightProducer ? spotlightProducer.description || `${spotlightProducer.specialty || "Distinctive sounds"}, shaped for artists building their next release.` : "Move across distinct sounds, moods, and creative perspectives to find the right foundation for your next record."}
                </p>
                 <div className="mt-7">
                   {!producerDetailsOpen ? <button type="button" onClick={() => { if (spotlightProducer) setSelectedProducerSlug(spotlightProducer.slug); setProducerDetailsOpen(true); }} className="btn-primary inline-flex">{spotlightProducer ? `Explore ${spotlightProducer.name || "producer"} beats` : "Explore all beats"}<ArrowDown className="ml-2 h-4 w-4" /></button> : <div className="producer-connect-panel rounded-[1.35rem] border border-[var(--border)] bg-[var(--bg-soft)] p-4 sm:p-5">
                     <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-[var(--text-soft)]">Connect with {spotlightProducer?.name || "producer"}</p><a href="#beat-catalog" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text)] transition hover:text-[var(--accent)]">View beats <ArrowDown className="h-3.5 w-3.5" /></a></div>
                     {producerSocials.length ? <div className="mt-3 flex flex-wrap gap-2">{producerSocials.map((social) => <a key={social.label} href={social.href!} target="_blank" rel="noreferrer" className="group inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-xs font-semibold text-[var(--text)] shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-md" aria-label={`Open ${spotlightProducer?.name || "producer"} on ${social.label}`}>{social.icon}<span>{social.label}</span><ExternalLink className="h-3 w-3 text-[var(--text-soft)] transition group-hover:text-[var(--text)]" /></a>)}</div> : <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">This producer has not added public social links yet.</p>}
                     {otherProducers.length ? <div className="mt-4 border-t border-[var(--border)] pt-4"><p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">Discover another producer</p><div className="mt-2.5 flex flex-wrap gap-2">{otherProducers.map((producer) => <button key={producer.slug} type="button" onClick={() => { setSelectedProducerSlug(producer.slug); setPreviewProducerIndex(Math.max(0, displayProducerProfiles.findIndex((item) => item.slug === producer.slug))); }} className="group inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] py-1.5 pl-1.5 pr-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-md" aria-label={`Show ${producer.name || "producer"}`}><span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[var(--surface)] ring-1 ring-[var(--border)]"><img src={producer.avatarUrl || producer.imageUrl || getFallbackImage(producer.id)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={(event) => replaceBrokenImage(event, getFallbackImage(producer.id))} /></span><span className="max-w-28 truncate text-xs font-semibold text-[var(--text)]">{producer.name || "Producer"}</span></button>)}</div></div> : null}
                   </div>}
                 </div>
              </div>
              <div className="flex min-h-[390px] flex-col overflow-hidden border-t border-[var(--border)] bg-[var(--bg-soft)] md:min-h-0 md:border-l md:border-t-0">
                <div className="relative min-h-[320px] flex-1 overflow-hidden bg-[radial-gradient(circle_at_60%_32%,color-mix(in_srgb,var(--accent)_16%,var(--bg-soft)),var(--bg-soft)_65%)]">
                  {selectedProducer || previewProducer ? (
                    <img
                      key={(selectedProducer ?? previewProducer)?.slug}
                      src={(selectedProducer ?? previewProducer)?.imageUrl || getFallbackImage((selectedProducer ?? previewProducer)!.id)}
                      alt={`${(selectedProducer ?? previewProducer)?.name || "Unnamed producer"} producer portrait`}
                      loading="eager"
                      decoding="async"
                      className="producer-spotlight-enter absolute inset-0 h-full w-full object-cover object-[center_28%]"
                      onError={(event) => replaceBrokenImage(event, getFallbackImage((selectedProducer ?? previewProducer)!.id))}
                    />
                  ) : <Disc3 className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 text-[var(--accent)] opacity-15 sm:h-64 sm:w-64" />}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="beat-catalog" className="scroll-mt-24 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="hidden self-start space-y-4 lg:block lg:sticky lg:top-24">
            {filterContent}
          </aside>

          <div className="space-y-5">
            <div className="surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--text)]">{selectedProducer ? `Beats by ${selectedProducer.name || "Unnamed producer"}` : "All Beats"}</h2>
                <p className="mt-2 text-sm text-[var(--text-soft)]">
                  Showing {visibleBeats.length} of {filteredBeats.length} beats.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setMobileFiltersOpen(true)} className="btn-outline inline-flex lg:hidden">
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </button>
                <button type="button" onClick={clearFilters} className="btn-outline hidden lg:inline-flex">
                  Clear filters
                </button>
                <button type="button" onClick={() => setCartOpen(true)} className="btn-primary inline-flex">
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  Cart ({cart.length})
                </button>
              </div>
              </div>
              <div className="mt-5 grid gap-3 border-t border-[var(--border)] pt-4 md:grid-cols-[minmax(0,1fr)_210px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-soft)]" />
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="field w-full rounded-xl pl-11" placeholder="Search beats, producers, moods, BPM or key" aria-label="Search beat catalog" />
                </label>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="field w-full rounded-xl" aria-label="Sort beats">
                  <option value="newest">Newest</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="bpm-asc">BPM: low to high</option>
                  <option value="bpm-desc">BPM: high to low</option>
                </select>
              </div>
              {selectedProducer ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--text)]">Looking for a different sound?</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedProducerSlug(null)}
                    className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--accent)_34%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--card))] px-4 py-2 text-xs font-semibold text-[var(--accent)] transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--card))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <Users2 className="h-3.5 w-3.5" />
                    View Beats by All Producers
                  </button>
                </div>
              ) : null}
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
                {(bpmMin !== 60 || bpmMax !== 180) ? <FilterChip label={`${bpmMin}-${bpmMax} BPM`} onRemove={() => { setBpmMin(60); setBpmMax(180); setDraftBpmMin(60); setDraftBpmMax(180); }} /> : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {visibleBeats.map((beat) => (
                <BeatCard
                  key={beat.id}
                  beat={beat}
                  active={beatPlayer.activeBeatId === beat.id}
                  playing={beatPlayer.activeBeatId === beat.id && beatPlayer.playing}
                  onPlay={() => playPreview(beat)}
                  onLicense={(licenseType) => beatPlayer.openLicensing(beat, licenseType)}
                  onAdd={(licenseType) => toggleCart(beat, licenseType)}
                  selectedLicenses={cart.filter((item) => item.beatId === beat.id).map((item) => item.licenseType)}
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




// vercel trigger 2

// vercel trigger 3

// vercel trigger 11

// vercel trigger 12
