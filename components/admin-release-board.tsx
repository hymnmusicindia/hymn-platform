"use client";

import { useEffect, useState, useTransition } from "react";
import { Release, ReleaseStatus } from "@/lib/types";

const statuses: ReleaseStatus[] = ["submitted", "under_review", "changes_requested", "approved", "queued_for_distribution", "sent_to_distributor", "processing", "delivered", "rejected", "live"];

type Readiness = {
  payload?: Record<string, unknown>;
  validation?: {
    ok: boolean;
    issues: Array<{ field: string; message: string }>;
    warnings: Array<{ field: string; message: string }>;
  };
  ready?: boolean;
};

export function AdminReleaseBoard({ initialReleases }: { initialReleases: Release[] }) {
  const [releases, setReleases] = useState(initialReleases);
  const [readinessByRelease, setReadinessByRelease] = useState<Record<number, Readiness>>({});
  const [expandedPayloadId, setExpandedPayloadId] = useState<number | null>(null);
  const [errorByRelease, setErrorByRelease] = useState<Record<number, string>>({});
  const [cooldowns, setCooldowns] = useState<Record<number, number>>({});
  const [cooldownClock, setCooldownClock] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => setCooldownClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const cooldownSeconds = (id: number) => Math.max(0, Math.ceil(((cooldowns[id] ?? 0) - cooldownClock) / 1000));
  const cooldownLabel = (id: number) => `${Math.floor(cooldownSeconds(id) / 60)}:${String(cooldownSeconds(id) % 60).padStart(2, "0")}`;

  function updateStatus(id: number, status: ReleaseStatus) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/update-status/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: `Status set to ${status}` })
      });
      if (!response.ok) return;
      setReleases((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    });
  }

  function validateForDireNote(id: number, expandPayload = false) {
    startTransition(async () => {
      setErrorByRelease((items) => ({ ...items, [id]: "" }));
      const response = await fetch(`/api/admin/releases/${id}/direnote`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorByRelease((items) => ({ ...items, [id]: data.error ?? "Could not validate DireNote payload." }));
        return;
      }
      setReadinessByRelease((items) => ({ ...items, [id]: data }));
      if (expandPayload) setExpandedPayloadId((current) => current === id ? null : id);
    });
  }

  function sendToDireNote(id: number, action: "submit" | "retry" = "submit") {
    setCooldowns((current) => ({ ...current, [id]: Date.now() + 5 * 60 * 1000 }));
    startTransition(async () => {
      setErrorByRelease((items) => ({ ...items, [id]: "" }));
      const response = await fetch(`/api/admin/releases/${id}/direnote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReadinessByRelease((items) => ({ ...items, [id]: data }));
        setErrorByRelease((items) => ({ ...items, [id]: data.error ?? data.validation?.issues?.[0]?.message ?? "DireNote submission failed." }));
        return;
      }
      if (data.release) setReleases((items) => items.map((item) => (item.id === id ? data.release : item)));
      setReadinessByRelease((items) => ({ ...items, [id]: data }));
    });
  }

  function markChangesRequested(id: number) {
    updateStatus(id, "changes_requested");
  }

  return (
    <div className="grid gap-4">
      {releases.map((release) => (
        <div key={release.id} className="rounded-[2rem] border border-border bg-white/5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-lg font-semibold text-white">{release.trackName}</p>
              <p className="text-sm text-white/55">{release.artistName} / {release.releaseType.toUpperCase()} / {release.releaseDate}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={isPending}
                  onClick={() => updateStatus(release.id, status)}
                  className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
                    release.status === status ? "bg-cyan text-ink" : "border border-border bg-black/20 text-white/65"
                  }`}
                >
                  {status.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">DireNote Readiness</p>
                <p className="text-xs text-white/55">
                  {readinessByRelease[release.id]?.validation
                    ? readinessByRelease[release.id].ready ? "Payload ready" : "Payload needs fixes"
                    : "Not checked yet"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={isPending} onClick={() => validateForDireNote(release.id, true)} className="rounded-full border border-border px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70">
                  Preview DireNote Payload
                </button>
                <button type="button" disabled={isPending} onClick={() => validateForDireNote(release.id)} className="rounded-full border border-border px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70">
                  Validate for DireNote
                </button>
                <button type="button" disabled={isPending || cooldownSeconds(release.id) > 0 || readinessByRelease[release.id]?.ready === false} onClick={() => sendToDireNote(release.id)} className="rounded-full bg-cyan px-4 py-2 text-xs uppercase tracking-[0.2em] text-ink disabled:cursor-not-allowed disabled:opacity-50">
                  {cooldownSeconds(release.id) > 0 ? `Try again in ${cooldownLabel(release.id)}` : "Approve & Send to DireNote"}
                </button>
                <button type="button" disabled={isPending || cooldownSeconds(release.id) > 0} onClick={() => sendToDireNote(release.id, "retry")} className="rounded-full border border-border px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70">
                  Retry DireNote Submission
                </button>
                <button type="button" disabled={isPending} onClick={() => markChangesRequested(release.id)} className="rounded-full border border-amber-300/50 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-200">
                  Mark Changes Requested
                </button>
              </div>
            </div>
            {errorByRelease[release.id] ? <p className="mt-3 text-sm text-rose-200">{errorByRelease[release.id]}</p> : null}
            {readinessByRelease[release.id]?.validation ? (
              <div className="mt-4 grid gap-3 text-sm lg:grid-cols-2">
                <div>
                  <p className="font-medium text-white">Blocking issues</p>
                  {readinessByRelease[release.id].validation?.issues.length ? (
                    <ul className="mt-2 space-y-1 text-rose-200">
                      {readinessByRelease[release.id].validation?.issues.map((issue, index) => <li key={`${issue.field}-${index}`}><strong>{issue.field}:</strong> {issue.field === "metadata.mood" ? "Mood is missing. Select a mood before sending to DireNote." : issue.message}</li>)}
                    </ul>
                  ) : <p className="mt-2 text-white/55">No blocking issues found.</p>}
                </div>
                <div>
                  <p className="font-medium text-white">Warnings</p>
                  {readinessByRelease[release.id].validation?.warnings.length ? (
                    <ul className="mt-2 space-y-1 text-amber-200">
                      {readinessByRelease[release.id].validation?.warnings.map((warning, index) => <li key={`${warning.field}-${index}`}><strong>{warning.field}:</strong> {warning.message}</li>)}
                    </ul>
                  ) : <p className="mt-2 text-white/55">No warnings.</p>}
                </div>
              </div>
            ) : null}
            {expandedPayloadId === release.id && readinessByRelease[release.id]?.payload ? (
              <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-black/30 p-4 text-xs text-white/75">
                {JSON.stringify(readinessByRelease[release.id].payload, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}


// vercel trigger

// vercel trigger
// vercel trigger 4

// vercel trigger 12
