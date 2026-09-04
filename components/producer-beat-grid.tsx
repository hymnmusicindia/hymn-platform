"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BeatCard } from "@/components/beat-card";
import { useBeatPreviewPlayer } from "@/components/beat-preview-player";
import type { StorefrontBeat } from "@/lib/beat-store";

function formatCurrency(amount: number) {
  return `\u20B9${amount.toLocaleString("en-IN")}`;
}

export function ProducerBeatGrid({ beats }: { beats: StorefrontBeat[] }) {
  const beatPlayer = useBeatPreviewPlayer();
  const queue = useMemo(() => beats.filter((beat) => beat.fileUrl || beat.previewUrl), [beats]);

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {beats.map((beat) => (
        <BeatCard
          key={beat.id}
          beat={beat}
          active={beatPlayer.activeBeatId === beat.id}
          playing={beatPlayer.activeBeatId === beat.id && beatPlayer.playing}
          onPlay={() => beatPlayer.playBeat(beat, queue)}
          onLicense={(licenseType) => beatPlayer.openLicensing(beat, licenseType)}
        />
      ))}
      {!beats.length ? (
        <div className="surface-card p-6 text-sm text-soft">
          This producer has no available beats right now. <Link href="/beat-store" className="font-semibold underline">Browse all beats</Link>.
        </div>
      ) : null}
      {beats.length ? (
        <div className="surface-card flex flex-col justify-between p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-soft">Producer catalog</p>
            <h3 className="mt-2 text-2xl font-semibold">Compare licences while the preview keeps playing.</h3>
            <p className="mt-3 text-sm leading-7 text-soft">Start any preview, then use the bottom player to move through this producer&apos;s queue or open licence terms.</p>
          </div>
          <p className="mt-5 text-sm text-soft">Starting from <span className="font-semibold text-[var(--text)]">{formatCurrency(Math.min(...beats.map((beat) => beat.startingPrice)))}</span></p>
        </div>
      ) : null}
    </div>
  );
}
