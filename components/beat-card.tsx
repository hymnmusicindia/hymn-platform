"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Pause, Play, Disc3 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Beat } from "@/lib/types";
import { beatStoreSlug } from "@/lib/beat-store";

export type ExtendedBeatCardData = Beat & {
  coverImage?: string;
  vibeTag?: string;
  activityLabel?: string;
  exclusiveRemaining?: number;
  producer?: { slug: string; name: string };
};

export function BeatCard({
  beat,
  touchMode = false,
  active = false,
  hovered = false,
  onHover,
  onLeave,
  onPlay,
  onAdd,
  generalInCart = false,
  exclusiveInCart = false
}: {
  beat: ExtendedBeatCardData;
  touchMode?: boolean;
  active?: boolean;
  hovered?: boolean;
  onHover?: () => void;
  onLeave?: () => void;
  onPlay?: () => void;
  onAdd?: (licenseType: "general" | "exclusive") => void;
  generalInCart?: boolean;
  exclusiveInCart?: boolean;
}) {
  const router = useRouter();
  const showOverlay = touchMode ? active : hovered;
  const beatHref = `/beat-store/beats/${beatStoreSlug(beat)}`;

  // Fallbacks for standard beats missing storefront metadata
  const coverImage = beat.coverImage;
  const vibeTag = beat.vibeTag || beat.genre || "Beats";
  const activityLabel = beat.activityLabel || (beat.enabled ? "Live" : "Disabled");
  const producerName = beat.producer?.name || "Producer";
  const producerSlug = beat.producer?.slug || "#";
  const exclusiveRemaining = beat.exclusiveRemaining;

  function formatMoney(value: number) {
    return `\u20B9${value.toLocaleString("en-IN")}`;
  }

  return (
    <article
      className="group relative w-full overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] shadow-[0_18px_48px_rgba(0,0,0,0.12)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] hover:shadow-[0_28px_70px_rgba(0,0,0,0.2)]"
      onMouseEnter={touchMode ? undefined : onHover}
      onMouseLeave={touchMode ? undefined : onLeave}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a,button")) return;
        router.push(beatHref);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) router.push(beatHref);
      }}
      role="link"
      tabIndex={0}
      aria-label={`View ${beat.title}`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 z-20 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-0 transition duration-300 group-hover:opacity-60" />
      <div className="relative p-2.5 sm:p-3">
        <div className="relative aspect-square overflow-hidden rounded-[1rem] border border-[var(--border)] bg-[var(--surface)]">
          {coverImage ? (
            <Image
              src={coverImage}
              alt={`${beat.title} cover artwork`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 260px, 300px"
              className="object-cover transition duration-700 ease-out group-hover:scale-[1.035] group-hover:saturate-[1.08]"
              priority={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800">
              <Disc3 className="h-10 w-10 text-zinc-500 opacity-50" />
            </div>
          )}

          <div
            className={`absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.08)_38%,rgba(0,0,0,0.78)_100%)] p-3 transition-opacity duration-300 ${showOverlay ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            <div className="flex items-start justify-between gap-1 flex-wrap">
              <span className="rounded-full border border-white/20 bg-black/30 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                {activityLabel}
              </span>
              {typeof exclusiveRemaining === "number" ? (
                <span className="rounded-full border border-white/20 bg-black/30 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                  {exclusiveRemaining > 0 ? `${exclusiveRemaining} exclusive licence${exclusiveRemaining === 1 ? "" : "s"} available` : "Exclusive sold"}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
              {onPlay && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlay();
                  }}
                  className="inline-flex h-9 sm:h-11 w-full sm:w-auto items-center justify-center rounded-full bg-white px-4 sm:px-5 text-xs sm:text-sm font-semibold text-black shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:bg-white/90"
                >
                  {active ? <Pause className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Play className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  Play
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 px-1.5 pb-1 pt-4 sm:px-2">
          <div>
            {producerSlug !== "#" ? (
              <Link href={`/beat-store/producers/${producerSlug}`} className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-soft)] transition hover:text-[var(--accent)]">
                {producerName}
              </Link>
            ) : (
              <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-soft)]">
                {producerName}
              </span>
            )}
            <h3 className="mt-2 line-clamp-1 text-lg font-semibold leading-tight tracking-[-0.025em] text-[var(--text)] sm:text-xl">
              <span className="transition group-hover:text-[var(--accent)]">{beat.title}</span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] sm:text-[10px] font-medium text-[var(--text)]">
              {vibeTag}
            </span>
            {beat.keySignature ? <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-soft)] px-2.5 py-1 text-[9px] sm:text-[10px] font-medium text-[var(--text-soft)]">Key {beat.keySignature}</span> : null}
          </div>

          <p className="text-[11px] font-medium text-[var(--text-soft)]">{beat.bpm} BPM{beat.keySignature ? ` · ${beat.keySignature}` : ""}</p>
          <div className="border-t border-[var(--border)] pt-3">
            <div className="mb-2.5 flex items-end justify-between gap-2">
              <div><p className="text-xs font-semibold text-[var(--text)]">Choose a licence</p><p className="mt-0.5 text-[9px] text-[var(--text-soft)]">Tap an option to add it</p></div>
              {(generalInCart || exclusiveInCart) ? <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Selected</span> : null}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={(event) => { event.stopPropagation(); onAdd?.("general"); }} disabled={!onAdd} aria-pressed={generalInCart} className={`relative min-h-[5.25rem] rounded-xl border p-3 text-left transition duration-200 disabled:cursor-default ${generalInCart ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border-[var(--border)] bg-[var(--bg-soft)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] hover:bg-[var(--card)]"}`}>
                <span className={`absolute right-2.5 top-2.5 inline-flex h-4 w-4 items-center justify-center rounded-full border ${generalInCart ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]" : "border-[var(--text-soft)]"}`}>{generalInCart ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}</span>
                <span className="block pr-5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">General</span>
                <strong className="mt-1 block text-base leading-none text-[var(--text)]">{formatMoney(beat.generalPrice ?? beat.price ?? 0)}</strong>
                <span className="mt-2 block text-[9px] leading-4 text-[var(--text-soft)]">Non-exclusive use</span>
              </button>
              <button type="button" onClick={(event) => { event.stopPropagation(); onAdd?.("exclusive"); }} disabled={!onAdd || exclusiveRemaining === 0} aria-pressed={exclusiveInCart} className={`relative min-h-[5.25rem] rounded-xl border p-3 text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${exclusiveInCart ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_8px_24px_color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border-[var(--border)] bg-[var(--bg-soft)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] hover:bg-[var(--card)]"}`}>
                <span className={`absolute right-2.5 top-2.5 inline-flex h-4 w-4 items-center justify-center rounded-full border ${exclusiveInCart ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]" : "border-[var(--text-soft)]"}`}>{exclusiveInCart ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}</span>
                <span className="block pr-5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Exclusive</span>
                <strong className="mt-1 block text-base leading-none text-[var(--text)]">{formatMoney(beat.exclusivePrice ?? 0)}</strong>
                <span className="mt-2 block text-[9px] leading-4 text-[var(--text-soft)]">{exclusiveRemaining === 0 ? "Sold out" : "One buyer only"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

// vercel trigger 3

// vercel trigger 11
