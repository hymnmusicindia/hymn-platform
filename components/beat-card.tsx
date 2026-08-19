"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Pause, Play, ShoppingCart, Disc3 } from "lucide-react";
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
  onReveal,
  onPlay,
  onAdd,
  inCart = false
}: {
  beat: ExtendedBeatCardData;
  touchMode?: boolean;
  active?: boolean;
  hovered?: boolean;
  onHover?: () => void;
  onLeave?: () => void;
  onReveal?: () => void;
  onPlay?: () => void;
  onAdd?: () => void;
  inCart?: boolean;
}) {
  const showOverlay = touchMode ? active : hovered;

  // Fallbacks for standard beats missing storefront metadata
  const coverImage = beat.coverImage;
  const vibeTag = beat.vibeTag || beat.genre || "Beats";
  const activityLabel = beat.activityLabel || (beat.enabled ? "Live" : "Disabled");
  const producerName = beat.producer?.name || "Producer";
  const producerSlug = beat.producer?.slug || "#";
  const exclusiveRemaining = beat.exclusiveRemaining ?? 1;

  function formatMoney(value: number) {
    return `\u20B9${value.toLocaleString("en-IN")}`;
  }

  return (
    <article
      className="group relative w-full overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] shadow-[0_18px_48px_rgba(0,0,0,0.12)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] hover:shadow-[0_28px_70px_rgba(0,0,0,0.2)]"
      onMouseEnter={touchMode ? undefined : onHover}
      onMouseLeave={touchMode ? undefined : onLeave}
      onClick={touchMode ? onReveal : undefined}
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
              {exclusiveRemaining <= 1 ? (
                <span className="rounded-full border border-white/20 bg-black/30 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                  1 Exclusive Left
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
              {onAdd && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onAdd();
                  }}
                  className={`inline-flex h-9 sm:h-11 w-full sm:w-auto items-center justify-center rounded-full border px-4 sm:px-5 text-xs sm:text-sm font-semibold backdrop-blur-md transition hover:-translate-y-0.5 ${inCart ? "border-emerald-300/80 bg-emerald-400 text-black hover:bg-emerald-300" : "border-white/25 bg-black/25 text-white hover:border-white/45 hover:bg-black/40"}`}
                  aria-pressed={inCart}
                >
                  {inCart ? <Check className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <ShoppingCart className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  {inCart ? "Added" : "Add"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3.5 px-1.5 pb-1 pt-4 sm:px-2">
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
            <h3 className="mt-1.5 line-clamp-1 text-base font-semibold leading-tight tracking-[-0.025em] text-[var(--text)] sm:text-xl">
              <Link href={`/beat-store/beats/${beatStoreSlug(beat)}`} onClick={(event) => event.stopPropagation()} className="transition hover:text-[var(--accent)]">{beat.title}</Link>
            </h3>
          </div>

          <div className="flex flex-wrap gap-1 sm:gap-2">
            <span className="inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] px-2.5 py-1 text-[9px] sm:text-[10px] font-medium text-[var(--text)]">
              {vibeTag}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-soft)] px-2.5 py-1 text-[9px] sm:text-[10px] font-medium text-[var(--text-soft)]">
              {beat.keySignature || "Auto Key"}
            </span>
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-[var(--border)] pt-3">
            <div>
              <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] text-[var(--text-soft)]">Starting at</p>
              <p className="mt-1 text-xs font-semibold tracking-[-0.01em] text-[var(--text)] sm:text-sm">{formatMoney(beat.price || (beat as any).startingPrice || 0)}</p>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-[var(--bg-soft)] px-2.5 py-1.5 text-[9px] font-semibold text-[var(--text)] sm:text-[10px]">
              {beat.bpm} BPM
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

// vercel trigger 3
