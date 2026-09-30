"use client";

import { Check, Disc3, Pause, Play, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import type { Beat } from "@/lib/types";
import { beatLicensePrice, type BeatStoreLicenseType } from "@/lib/beat-store";

export type ExtendedBeatCardData = Beat & { coverImage?: string; vibeTag?: string; exclusiveRemaining?: number; producer?: { slug: string; name: string } };

export function BeatCard({ beat, active = false, playing = false, onPlay, onAdd, onLicense, selectedLicenses = [] }: {
  beat: ExtendedBeatCardData; active?: boolean; playing?: boolean; onPlay?: () => void; onAdd?: (licenseType: BeatStoreLicenseType) => void; onLicense?: (licenseType: BeatStoreLicenseType) => void; selectedLicenses?: BeatStoreLicenseType[];
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => setCoverFailed(false), [beat.coverImage]);
  const startingPrice = Math.min(beatLicensePrice(beat, "mp3"), beatLicensePrice(beat, "wav"));
  const artwork = beat.coverImage && !coverFailed ? beat.coverImage : "";

  return <article className={`group relative grid min-h-[98px] grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-2xl border bg-[#101216] p-3 text-white transition duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:shadow-[0_16px_38px_rgba(0,0,0,.22)] sm:grid-cols-[78px_minmax(190px,1.4fr)_minmax(190px,.8fr)_auto] sm:gap-4 ${active ? "border-white/35 ring-1 ring-white/10" : "border-white/10"}`} id={`beat-${beat.id}`}>
    {artwork ? <img src={artwork} alt="" loading="lazy" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-[2px] transition duration-500 group-hover:scale-[1.14] group-hover:opacity-30" onError={() => setCoverFailed(true)} /> : null}
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,8,10,.68),rgba(10,11,14,.90)_42%,rgba(10,11,14,.97))]" />

    <div className={`relative h-[74px] w-[74px] rounded-full bg-[repeating-radial-gradient(circle_at_center,#2b2e34_0_2px,#111318_3px_5px)] shadow-[0_10px_25px_rgba(0,0,0,.48)] ring-1 ring-white/15 transition-transform duration-700 group-hover:rotate-[16deg] ${playing ? "animate-[spin_5s_linear_infinite]" : ""}`}>
      <div className="absolute inset-[20px] overflow-hidden rounded-full border border-black/80 bg-black">
        {artwork ? <img src={artwork} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setCoverFailed(true)} /> : <Disc3 className="h-full w-full p-1.5 text-white/55" />}
      </div>
      <button type="button" onClick={onPlay} className="absolute inset-0 grid place-items-center rounded-full" aria-label={playing ? `Pause ${beat.title}` : `Play ${beat.title}`}>
        <span className={`grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>{playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}</span>
      </button>
    </div>

    <div className="relative min-w-0">
      <div className="flex items-center gap-2"><h3 className="truncate text-base font-semibold text-white">{beat.title}</h3>{active ? <span className="hidden h-1.5 w-1.5 animate-pulse rounded-full bg-white sm:block" /> : null}</div>
      <p className="mt-1 truncate text-xs text-white/50">{beat.producer?.name || "Producer"}</p>
      <div className="mt-2 flex gap-2 text-[10px] font-medium text-white/45 sm:hidden"><span>{beat.bpm} BPM</span><span>·</span><span>{beat.keySignature || "Key —"}</span></div>
    </div>
    <div className="relative hidden min-w-0 items-center gap-2 text-xs text-white/50 sm:flex">
      <span className="max-w-28 truncate rounded-full bg-black/25 px-2.5 py-1 backdrop-blur-sm">{beat.vibeTag || beat.genre || "Beats"}</span>
      <span>{beat.bpm} BPM</span><span>·</span><span>{beat.keySignature || "Key —"}</span>
    </div>
    <div className="relative flex items-center gap-2">
      <button type="button" onClick={() => onAdd?.("wav")} className={`grid h-11 w-11 place-items-center rounded-xl border transition hover:-translate-y-0.5 ${selectedLicenses.length ? "border-white/50 bg-white/15 text-white" : "border-white/20 bg-black/20 text-white hover:border-white/45"}`} aria-label={selectedLicenses.length ? `Remove ${beat.title} from cart` : `Add ${beat.title} WAV licence to cart`}>
        {selectedLicenses.length ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
      </button>
      <button type="button" onClick={() => onLicense?.("wav")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-3.5 text-xs font-semibold text-black transition hover:scale-[1.02] sm:px-4">
        <span className="hidden md:inline">Choose licence</span><span>₹{startingPrice.toLocaleString("en-IN")}</span>
      </button>
    </div>
  </article>;
}
