"use client";

import { customerMessage } from "@/lib/customer-message";

import type { Release } from "@/lib/types";

export function ProviderCorrectionWorkspace({ release, onFix }: { release: Release; onFix: (field?: string) => void }) {
  const saved = false;
  const open = release.status === "changes_requested";
  return <section className="py-5">
    <h2 className="text-xl font-semibold">{open ? "Action Required" : "Provider review"}</h2>
    <p className="mt-2 text-sm">{release.releaseTitle} · {saved ? "Corrections saved, awaiting submission" : open ? "Correction requested" : "Awaiting provider confirmation"}</p>
    <div className="mt-5 divide-y">{(release.reviewIssues?.fields ?? []).map(issue => {
      const trackIndex = issue.field.match(/^tracks\.(\d+)\./)?.[1];
      const track = trackIndex ? release.tracks?.[Number(trackIndex)] : undefined;
      return <article key={issue.field} className="py-5">
        <h3 className="text-base font-semibold">{customerMessage(issue.label)}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm">{customerMessage(issue.note)}</p>
        {track ? <p className="mt-2 text-sm">{track.trackTitle} · {track.primaryArtist}</p> : null}
        {issue.field.startsWith("direnote.remoteTrack") ? <p className="mt-2 text-sm">HYMN review needed to identify the affected track.</p> : null}
        {open ? <button type="button" className="btn-outline mt-3" onClick={() => onFix(issue.field)}>{trackIndex ? `Fix Track ${Number(trackIndex) + 1}` : "Fix release"}</button> : null}
      </article>;
    })}</div>
  </section>;
}
