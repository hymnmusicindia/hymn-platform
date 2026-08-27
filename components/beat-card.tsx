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
              <span className="transition group-hover:text-[var(--accent)]">{beat.title}</span>
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

          <p className="text-xs text-[var(--text-soft)]">{beat.bpm} BPM · {beat.keySignature || "Key not supplied"}</p>
          <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 text-xs">
            <button type="button" onClick={(event) => { event.stopPropagation(); onAdd?.("general"); }} disabled={!onAdd} aria-pressed={generalInCart} className={`rounded-xl p-2 text-left transition disabled:cursor-default ${generalInCart ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]" : "hover:bg-[var(--bg-soft)]"}`}>
              <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-[var(--text-soft)]">General Licence {generalInCart ? <Check className="h-3 w-3 text-[var(--accent)]" /> : null}</p><p className="mt-1 font-semibold">{formatMoney(beat.generalPrice ?? beat.price ?? 0)}</p>
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onAdd?.("exclusive"); }} disabled={!onAdd || exclusiveRemaining === 0} aria-pressed={exclusiveInCart} className={`rounded-xl p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${exclusiveInCart ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]" : "hover:bg-[var(--bg-soft)]"}`}>
              <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-[var(--text-soft)]">Exclusive Licence {exclusiveInCart ? <Check className="h-3 w-3 text-[var(--accent)]" /> : null}</p><p className="mt-1 font-semibold">{formatMoney(beat.exclusivePrice ?? 0)}</p>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// vercel trigger 3

// vercel trigger 11
