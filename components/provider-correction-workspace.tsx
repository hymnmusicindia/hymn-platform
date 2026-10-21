"use client";

import { customerMessage } from "@/lib/customer-message";
import Link from 'next/link';

import type { Release } from "@/lib/types";
import { CircleAlert, Clock3, ArrowUpRight, Music2 } from "lucide-react";
import "./provider-correction-workspace.css";

export function ProviderCorrectionWorkspace({ release, onFix }: { release: Release; onFix: (field?: string) => void }) {
  const open = release.status === "changes_requested";
  const awaitingReview = ["under_review", "resubmitted"].includes(release.status);
  return <section className="provider-correction-workspace">
    <header className="provider-correction-heading">
      <span className="provider-correction-symbol" data-open={open}>{open ? <CircleAlert size={22} /> : <Clock3 size={22} />}</span>
      <div><h2>{open ? "Corrections to complete" : "Provider review"}</h2>
      <p>{open ? "Review the note below, update the affected field, then submit your corrections." : awaitingReview ? "Your corrections are with HYMN for review. Previous provider notes remain here for reference." : "Previous provider notes are retained here for reference. Check the release status above for current progress."}</p></div>
      <span className="provider-correction-status" data-open={open}>{open ? "Action required" : awaitingReview ? "Awaiting review" : "Review notes"}</span>
    </header>
    <div className="my-4"><Link className="btn-outline" href={`/dashboard/releases/${release.id}/qc-report`}>View detailed QC report and timestamps</Link></div>
    <div className="provider-correction-list">{(release.reviewIssues?.fields ?? []).map(issue => {
      const trackIndex = issue.field.match(/^tracks\.(\d+)\./)?.[1];
      const track = trackIndex ? release.tracks?.[Number(trackIndex)] : undefined;
      return <article key={issue.field} className="provider-correction-card">
        <div className="provider-correction-card-body"><h3>{customerMessage(issue.label)}</h3>
        {track ? <p className="provider-correction-track"><Music2 size={14} aria-hidden="true" />{track.trackTitle} · {track.primaryArtist}</p> : null}
        <p className="provider-correction-note">{customerMessage(issue.note)}</p>
        {issue.field.startsWith("direnote.remoteTrack") ? <p className="mt-2 text-sm">HYMN review needed to identify the affected track.</p> : null}
        </div>
        {open ? <button type="button" className="provider-correction-action" onClick={() => onFix(issue.field)}>{trackIndex ? `Fix Track ${Number(trackIndex) + 1}` : "Fix release"}<ArrowUpRight size={16} aria-hidden="true" /></button> : null}
      </article>;
    })}{!release.reviewIssues?.fields?.length ? <p className="provider-correction-empty">No detailed correction notes are available.{release.correctionReason ? ` ${customerMessage(release.correctionReason)}` : ""}</p> : null}</div>
  </section>;
}
