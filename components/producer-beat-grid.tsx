"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BeatStoreCard as BeatCard } from "@/components/beat-store-card";
import { BeatEngagementProvider } from "@/components/beat-engagement-provider";
import cardStyles from "./beat-store-card.module.css";
import { useBeatPreviewPlayer } from "@/components/beat-preview-player";
import type { StorefrontBeat } from "@/lib/beat-store";

export function ProducerBeatGrid({ beats }: { beats: StorefrontBeat[] }) {
  const beatPlayer = useBeatPreviewPlayer();
  const queue = useMemo(() => beats.filter((beat) => beat.fileUrl || beat.previewUrl), [beats]);

  return (
    <BeatEngagementProvider ids={beats.map(beat=>beat.id)}><div className={cardStyles.grid}>
      {beats.map((beat) => (
        <BeatCard
          key={beat.id}
          beat={beat}
          active={beatPlayer.activeBeatId === beat.id}
          playing={beatPlayer.activeBeatId === beat.id && beatPlayer.playing}
          onPlay={() => beatPlayer.playBeat(beat, queue)}
          onAdd={(licenseType) => beatPlayer.openLicensing(beat, licenseType)}
          onLicense={(licenseType) => beatPlayer.openLicensing(beat, licenseType)}
        />
      ))}
      {!beats.length ? (
        <div className="surface-card p-6 text-sm text-soft">
          This producer has no available beats right now. <Link href="/beat-store" className="font-semibold underline">Browse all beats</Link>.
        </div>
      ) : null}

    </div></BeatEngagementProvider>
  );
}
