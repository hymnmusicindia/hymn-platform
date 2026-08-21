"use client";
import { useEffect, useState } from "react";

type Diagnostics = { endpointConfigured: boolean; pinConfigured: boolean; clientIdConfigured: boolean; configReady: boolean; lastTest?: { success: boolean; httpStatus: number | null; response: unknown; createdAt: string } | null };

export function DireNoteDiagnostics() {
  const [data, setData] = useState<Diagnostics | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = () => fetch("/api/admin/direnote/diagnostics").then((r) => r.json()).then(setData).catch(() => setError("Could not load distribution diagnostics."));
  useEffect(() => { void load(); }, []);
  async function test() { setBusy(true); setError(""); try { const response = await fetch("/api/admin/direnote/diagnostics", { method: "POST" }); const body = await response.json(); setData(body); if (!response.ok) setError(body.result?.error || JSON.stringify(body.result?.response) || "The distribution service rejected the test payload."); } catch { setError("Distribution test request failed."); } finally { setBusy(false); } }
  return <section className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
    <h3 className="font-semibold">Distribution diagnostics</h3><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Credentials remain server-side and are never displayed.</p>
    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">{[["Endpoint", data?.endpointConfigured], ["PIN", data?.pinConfigured], ["Client ID", data?.clientIdConfigured]].map(([label, ready]) => <div key={String(label)}>{label} configured: <strong>{ready ? "Yes" : "No"}</strong></div>)}</div>
    <div className="mt-4 text-sm"><strong>Last test status:</strong> {data?.lastTest ? `${data.lastTest.success ? "Success" : "Failed"}${data.lastTest.httpStatus ? ` (HTTP ${data.lastTest.httpStatus})` : ""}` : "Not tested"}</div>
    {data?.lastTest?.response != null ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border p-3 text-xs" style={{ borderColor: "var(--border)" }}>{JSON.stringify(data.lastTest.response, null, 2)}</pre> : null}
    {error ? <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}<button type="button" onClick={test} disabled={busy || !data?.configReady} className="btn-primary pressable mt-4">{busy ? "Sending…" : "Send distribution test payload"}</button>
  </section>;
}
// vercel trigger 8
