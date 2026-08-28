"use client";

import { Check, Disc3, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { Beat } from "@/lib/types";

export type ExtendedBeatCardData = Beat & { coverImage?: string; vibeTag?: string; exclusiveRemaining?: number; producer?: { slug: string; name: string } };

export function BeatCard({ beat, active = false, onPlay, onAdd, generalInCart = false, exclusiveInCart = false }: {
  beat: ExtendedBeatCardData; active?: boolean; onPlay?: () => void; onAdd?: (licenseType: "general" | "exclusive") => void; generalInCart?: boolean; exclusiveInCart?: boolean;
}) {
  const coverImage = beat.coverImage;
  const [coverFailed, setCoverFailed] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const vibeTag = beat.vibeTag || beat.genre || "Beats";
  const producerName = beat.producer?.name || "Producer";
  const exclusiveRemaining = beat.exclusiveRemaining;
  useEffect(() => setCoverFailed(false), [coverImage]);
  const money = (value: number) => `\u20B9${value.toLocaleString("en-IN")}`;

  return <article className="group relative w-full overflow-hidden rounded-[1.35rem] border border-[var(--border)] bg-[var(--card)] shadow-[0_14px_38px_rgba(0,0,0,0.1)] transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] hover:shadow-[0_24px_58px_rgba(0,0,0,0.18)]">
    <div className="relative p-2.5 sm:p-3">
      <div className="relative aspect-square overflow-hidden rounded-[1rem] border border-[var(--border)] bg-[var(--surface)]" onPointerEnter={() => setControlsVisible(true)} onPointerLeave={() => { if (!active) setControlsVisible(false); }} onClick={() => setControlsVisible(true)}>
        {coverImage && !coverFailed ? <img src={coverImage} alt={`${beat.title} cover artwork`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.025]" onError={() => setCoverFailed(true)} /> : <div className="flex h-full w-full flex-col items-center justify-center bg-[linear-gradient(145deg,#17191d,#30343b)] px-4 text-center"><Disc3 className="h-10 w-10 text-white/45" /><span className="mt-3 line-clamp-2 text-xs font-semibold text-white/70">{beat.title}</span></div>}
        {onPlay ? <button type="button" onClick={(event) => { event.stopPropagation(); onPlay(); setControlsVisible(true); }} className={`absolute left-1/2 top-1/2 z-10 inline-flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-[0_14px_34px_rgba(0,0,0,0.38)] transition duration-200 hover:scale-105 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/45 ${controlsVisible || active ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} aria-label={active ? `Pause ${beat.title}` : `Play ${beat.title}`}>{active ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-1 h-6 w-6" fill="currentColor" />}</button> : null}
      </div>
      <div className="space-y-2.5 px-1.5 pb-1 pt-3 sm:px-2">
        <div><h3 className="line-clamp-1 text-lg font-semibold leading-tight tracking-[-0.025em] text-[var(--text)] sm:text-xl">{beat.title}</h3><p className="mt-1 truncate text-xs font-medium text-[var(--text-soft)]">{producerName}</p></div>
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-medium text-[var(--text-soft)]"><span className="inline-flex min-w-0 items-center truncate rounded-full border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[var(--accent-soft)] px-2.5 py-1 text-[var(--text)]">{vibeTag}</span>{beat.keySignature ? <span className="whitespace-nowrap">Key {beat.keySignature}</span> : null}<span className="ml-auto whitespace-nowrap">{beat.bpm} BPM</span></div>
        <div className="border-t border-[var(--border)] pt-2.5">
          <div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-xs font-semibold text-[var(--text)]">Choose a licence</p><p className="text-[9px] text-[var(--text-soft)]">Tap to add</p></div>{generalInCart || exclusiveInCart ? <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Selected</span> : null}</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onAdd?.("general")} disabled={!onAdd} aria-pressed={generalInCart} className={`relative min-h-[4.35rem] rounded-xl border p-2.5 text-left transition disabled:cursor-default ${generalInCart ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--bg-soft)] hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border))]"}`}><span className={`absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border ${generalInCart ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]" : "border-[var(--text-soft)]"}`}>{generalInCart ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}</span><span className="block pr-5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">General</span><strong className="mt-1 block text-sm leading-none text-[var(--text)]">{money(beat.generalPrice ?? beat.price ?? 0)}</strong><span className="mt-1.5 block text-[8px] text-[var(--text-soft)]">Non-exclusive</span></button>
            <button type="button" onClick={() => onAdd?.("exclusive")} disabled={!onAdd || exclusiveRemaining === 0} aria-pressed={exclusiveInCart} className={`relative min-h-[4.35rem] rounded-xl border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${exclusiveInCart ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--bg-soft)] hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border))]"}`}><span className={`absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border ${exclusiveInCart ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]" : "border-[var(--text-soft)]"}`}>{exclusiveInCart ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}</span><span className="block pr-5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Exclusive</span><strong className="mt-1 block text-sm leading-none text-[var(--text)]">{money(beat.exclusivePrice ?? 0)}</strong><span className="mt-1.5 block text-[8px] text-[var(--text-soft)]">{exclusiveRemaining === 0 ? "Sold out" : "One buyer"}</span></button>
          </div>
        </div>
      </div>
    </div>
  </article>;
}
