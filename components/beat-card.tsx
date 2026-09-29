"use client";

import { Check, Disc3, Pause, Play, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import type { Beat } from "@/lib/types";
import { beatLicensePrice, type BeatStoreLicenseType } from "@/lib/beat-store";

export type ExtendedBeatCardData = Beat & { coverImage?: string; vibeTag?: string; exclusiveRemaining?: number; producer?: { slug: string; name: string } };

export function BeatCard({ beat, active = false, playing = false, onPlay, onLicense, selectedLicenses = [] }: {
  beat: ExtendedBeatCardData; active?: boolean; playing?: boolean; onPlay?: () => void; onAdd?: (licenseType: BeatStoreLicenseType) => void; onLicense?: (licenseType: BeatStoreLicenseType) => void; selectedLicenses?: BeatStoreLicenseType[];
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => setCoverFailed(false), [beat.coverImage]);
  const startingPrice = Math.min(beatLicensePrice(beat, "mp3"), beatLicensePrice(beat, "wav"));

  return <article className={`group grid min-h-[88px] grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-[var(--card)] p-2.5 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[0_12px_30px_rgba(0,0,0,.1)] sm:grid-cols-[72px_minmax(190px,1.4fr)_minmax(190px,.8fr)_auto] sm:gap-4 ${active ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_5%,var(--card))]" : "border-[var(--border)]"}`} id={`beat-${beat.id}`}>
    <div className="relative h-[72px] w-[72px] overflow-hidden rounded-xl bg-[var(--surface)]">
      {beat.coverImage && !coverFailed ? <img src={beat.coverImage} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setCoverFailed(true)} /> : <div className="grid h-full place-items-center bg-[linear-gradient(145deg,#17191d,#30343b)]"><Disc3 className="h-7 w-7 text-white/50" /></div>}
      <button type="button" onClick={onPlay} className="absolute inset-0 grid place-items-center bg-black/25 text-white transition hover:bg-black/45" aria-label={playing ? `Pause ${beat.title}` : `Play ${beat.title}`}>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-black shadow-lg">{playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}</span>
      </button>
    </div>
    <div className="min-w-0">
      <div className="flex items-center gap-2"><h3 className="truncate text-base font-semibold text-[var(--text)]">{beat.title}</h3>{active ? <span className="hidden h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] sm:block" /> : null}</div>
      <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{beat.producer?.name || "Producer"}</p>
      <div className="mt-2 flex gap-2 text-[10px] font-medium text-[var(--text-soft)] sm:hidden"><span>{beat.bpm} BPM</span><span>·</span><span>{beat.keySignature || "Key —"}</span></div>
    </div>
    <div className="hidden min-w-0 items-center gap-2 text-xs text-[var(--text-muted)] sm:flex">
      <span className="max-w-28 truncate rounded-full bg-[var(--bg-soft)] px-2.5 py-1">{beat.vibeTag || beat.genre || "Beats"}</span>
      <span>{beat.bpm} BPM</span><span>·</span><span>{beat.keySignature || "Key —"}</span>
    </div>
    <button type="button" onClick={() => onLicense?.("wav")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--text)] px-3.5 text-xs font-semibold text-[var(--bg)] transition hover:scale-[1.02] sm:px-4">
      {selectedLicenses.length ? <Check className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
      <span className="hidden md:inline">Choose licence</span><span>₹{startingPrice.toLocaleString("en-IN")}</span>
    </button>
  </article>;
}
