"use client";

import { artworkPreviewUrl } from "@/lib/artwork-preview";
import styles from "./beat-card.module.css";
import Link from "next/link";
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

  const entryLicense = beatLicensePrice(beat, "mp3") <= beatLicensePrice(beat, "wav") ? "mp3" : "wav";
  return <article className={styles.card} id={`beat-${beat.id}`}>
    <button type="button" onClick={onPlay} className={styles.artwork} aria-label={playing ? `Pause ${beat.title}` : `Play ${beat.title}`}>
      <span className={`${styles.vinyl} ${playing ? styles.spinning : ""}`} aria-hidden="true"><span className={styles.discLabel}>{artwork ? <img src={artworkPreviewUrl(artwork, 160)} alt="" loading="lazy" onError={() => setCoverFailed(true)} /> : <Disc3 size={22} />}</span></span>
      <span className={styles.play}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</span>
    </button>

    <div className="relative min-w-0">
      <div className="flex items-center gap-2"><h3 className="truncate text-base font-semibold text-white">{beat.title}</h3>{active ? <span className="hidden h-1.5 w-1.5 animate-pulse rounded-full bg-white sm:block" /> : null}</div>
      <p className="mt-1 truncate text-xs text-[#c6cbd4]">{beat.producer?.slug ? <Link href={`/beat-store/producers/${encodeURIComponent(beat.producer.slug)}`} className={styles.producer} aria-label={`View ${beat.producer.name}'s storefront`}>{beat.producer.name}</Link> : beat.producer?.name || beat.producerName || "Producer"}</p>
      <div className={`${styles.metadata} mt-2 flex gap-2 text-[10px] font-medium text-[#c6cbd4] sm:hidden`}><span>{beat.bpm} BPM</span><span>·</span><span>{beat.keySignature || "Key —"}</span></div>
    </div>
    <div className={`${styles.metadata} relative hidden min-w-0 items-center gap-2 text-xs text-[#c6cbd4] sm:flex`}>
      <span className="max-w-28 truncate rounded-full bg-black/25 px-2.5 py-1 backdrop-blur-sm">{beat.vibeTag || beat.genre || "Beats"}</span>
      <span>{beat.bpm} BPM</span><span>·</span><span>{beat.keySignature || "Key —"}</span>
    </div>
    <div className="relative flex items-center gap-2">
      <button type="button" onClick={() => onAdd?.(selectedLicenses[0] ?? "wav")} className={`grid h-11 w-11 place-items-center rounded-xl border transition hover:-translate-y-0.5 ${selectedLicenses.length ? "border-white/50 bg-white/15 text-white" : "border-white/20 bg-black/20 text-white hover:border-white/45"}`} aria-label={selectedLicenses.length ? `Remove ${beat.title} from cart` : `Add ${beat.title} WAV licence to cart`}>
        {selectedLicenses.length ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
      </button>
      <button type="button" onClick={() => onLicense?.(entryLicense)} aria-label={`Choose licence for ${beat.title}`} title="Compare licences and usage rights" className={`${styles.licence} inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-3.5 text-xs font-semibold text-black transition hover:scale-[1.02] sm:px-4`}>
        <span>From</span><span>₹{startingPrice.toLocaleString("en-IN")}</span>
      </button>
    </div>
  </article>;
}
