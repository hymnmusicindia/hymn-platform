"use client";
import {displayDateTime} from "@/lib/display-date-time";

import { useEffect, useState } from "react";

type Diagnostics = { endpointConfigured: boolean; pinConfigured: boolean; clientIdConfigured: boolean; configReady: boolean; syncHealth?: "healthy" | "degraded" | "unknown"; lastSync?: { startedAt: string; summary?: { checked?: number; changedCount?: number; errorCount?: number; pendingCount?: number; deferredCount?: number; rateLimited?: boolean; retryAfterSeconds?: number } | null } | null; lastTest?: { success: boolean; httpStatus: number | null; response: unknown; createdAt: string } | null };

export function DireNoteDiagnostics() {
  const [data, setData] = useState<Diagnostics | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = () => fetch("/api/admin/direnote/diagnostics").then((r) => r.json()).then(setData).catch(() => setError("Could not load distribution diagnostics."));
  useEffect(() => { void load(); }, []);
  async function test() { setBusy(true); setError(""); try { const response = await fetch("/api/admin/direnote/diagnostics", { method: "POST" }); const body = await response.json(); setData(body); if (!response.ok) setError(body.result?.error || JSON.stringify(body.result?.response) || "The distribution service rejected the test payload."); } catch { setError("Distribution test request failed."); } finally { setBusy(false); } }
  return <section className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
    <h3 className="font-semibold">Distribution diagnostics</h3><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Credentials remain server-side and are never displayed.</p>
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">{[["Endpoint", data?.endpointConfigured], ["PIN", data?.pinConfigured], ["Client ID", data?.clientIdConfigured]].map(([label, ready]) => <div key={String(label)}>{label} configured: <strong>{ready ? "Yes" : "No"}</strong></div>)}</div>
    <div className="mt-4 text-sm"><strong>Last test status:</strong> {data?.lastTest ? `${data.lastTest.success ? "Success" : "Failed"}${data.lastTest.httpStatus ? ` (HTTP ${data.lastTest.httpStatus})` : ""}` : "Not tested"}</div>
    <div className="mt-4 text-sm"><strong>DireNote sync:</strong> <span style={{ color: data?.syncHealth === "degraded" ? "var(--danger)" : undefined }}>{data?.syncHealth === "degraded" ? "Delayed or failing" : data?.syncHealth === "healthy" ? "Healthy" : "Not recorded"}</span></div>
    <div className="mt-2 text-sm"><strong>Last sync:</strong> {data?.lastSync ? `${displayDateTime(data.lastSync.startedAt)} - ${data.lastSync.summary?.checked ?? 0} checked - ${data.lastSync.summary?.changedCount ?? 0} updated - ${data.lastSync.summary?.pendingCount ?? 0} pending - ${data.lastSync.summary?.deferredCount ?? 0} deferred - ${data.lastSync.summary?.errorCount ?? 0} errors` : "Not recorded"}</div>
    {data?.lastSync?.summary?.rateLimited ? <p className="mt-2 text-sm">Provider capacity reached. Queued work will resume after the cooldown (approximately {Math.ceil((data.lastSync.summary.retryAfterSeconds ?? 60) / 60)} minutes).</p> : null}
    {data?.lastTest?.response != null ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border p-3 text-xs" style={{ borderColor: "var(--border)" }}>{JSON.stringify(data.lastTest.response, null, 2)}</pre> : null}
    {error ? <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}<button type="button" onClick={test} disabled={busy || !data?.configReady} className="btn-primary pressable mt-4">{busy ? "Sending…" : "Send distribution test payload"}</button>
  </section>;
}
// vercel trigger 8
