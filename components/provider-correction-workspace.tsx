"use client";

import { customerMessage } from "@/lib/customer-message";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import type { Release } from "@/lib/types";

export function ProviderCorrectionWorkspace({ release, onFix }: { release: Release; onFix: (field?: string) => void }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/releases/${release.id}/submission-history`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => setSaved(data.attempts?.some((attempt: { isCurrent: boolean; correctionStatus: string }) => attempt.isCurrent && attempt.correctionStatus === "customer_resolved") ?? false))
      .catch(() => { if (!controller.signal.aborted) setMessage("Unable to load correction status."); });
    return () => controller.abort();
  }, [release.id, release.lastEditedAt]);
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/releases/${release.id}/resubmit`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Corrections could not be submitted.");
      setMessage("Corrections submitted. Awaiting DireNote review.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Submission failed."); }
    finally { setBusy(false); }
  }
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
    {open ? <button type="button" className="btn-primary mt-4 inline-flex items-center gap-2 disabled:opacity-50" disabled={!saved || busy} onClick={submit}><Send size={16} />{busy ? "Submitting..." : "Submit Corrections"}</button> : null}
    {message ? <p role="status" className="mt-3 text-sm">{customerMessage(message)}</p> : null}
  </section>;
}
