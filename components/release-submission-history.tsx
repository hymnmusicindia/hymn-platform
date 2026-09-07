"use client";

import { useEffect, useState } from "react";

export function ReleaseSubmissionHistory({ releaseId, admin = false }: { releaseId: number; admin?: boolean }) {
  const [attempts, setAttempts] = useState<Array<{ id: number; upc: string | null; isCurrent: boolean; status: string | null; submittedAt: string; payload?: unknown; payloadDiff?: unknown; tracks: Array<{ id: number; title: string; isrc: string | null }> }>>([]);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<unknown>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  async function loadPreview() {
    setLoadingPreview(true);
    try {
      const response = await fetch(`/api/admin/releases/${releaseId}/direnote/payload-preview`);
      if (!response.ok) throw new Error();
      setPreview(await response.json());
    } catch { setError(true); }
    finally { setLoadingPreview(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/releases/${releaseId}/submission-history${admin ? "?admin=1" : ""}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => setAttempts(data.attempts ?? []))
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [releaseId, admin]);
  return <section className="py-5"><h2 className="text-xl font-semibold">Submission history</h2>
    {admin ? <button type="button" className="btn-outline mt-3" disabled={loadingPreview} onClick={loadPreview}>View Sanitized DireNote Payload</button> : null}
    {admin && preview ? <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(preview, null, 2)}</pre> : null}
    {error ? <p className="mt-3 text-sm">Submission history is unavailable.</p> : null}
    {attempts.map((attempt, index) => <details key={attempt.id} className="border-b py-4" open={attempt.isCurrent}>
      <summary className="cursor-pointer text-sm font-semibold">Attempt {index + 1} · {attempt.isCurrent ? "Current" : "Historical"} · {attempt.status?.replace(/_/g, " ")}</summary>
      <p className="mt-3 text-sm">UPC: {attempt.upc || "Awaiting assignment"}</p>
      <time className="text-xs">{new Date(attempt.submittedAt).toLocaleString()}</time>
      {(attempt.tracks ?? []).map(track => <p key={track.id} className="mt-2 text-sm">{track.title}: {track.isrc || "Awaiting ISRC"}</p>)}
      {admin ? <details className="mt-3"><summary className="cursor-pointer text-sm">Actual submitted payload</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ payload: attempt.payload ?? "Historical snapshot unavailable", changes: attempt.payloadDiff ?? [] }, null, 2)}</pre></details> : null}
    </details>)}
  </section>;
}
