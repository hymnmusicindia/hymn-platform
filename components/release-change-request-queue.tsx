"use client";

import { useState } from "react";

type RequestRow = { id: number; requestType: string; status: string; reason: string; desiredEffectiveAt?: string | null; providerReference?: string | null; submittedAt: string; release: { title: string; artistName: string; status: string }; events: Array<{ id: number; newStatus: string; note: string; createdAt: string }> };
const decisions = ["approved", "information_required", "rejected", "processing_manually", "submitted_to_partner", "completed", "failed"];

export function ReleaseChangeRequestQueue({ initialRequests }: { initialRequests: RequestRow[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [drafts, setDrafts] = useState<Record<number, { decision: string; note: string; providerReference: string }>>({});
  const [message, setMessage] = useState<Record<number, string>>({});
  const draft = (id: number) => drafts[id] ?? { decision: "approved", note: "", providerReference: "" };
  const setDraft = (id: number, value: Partial<ReturnType<typeof draft>>) => setDrafts(current => ({ ...current, [id]: { ...draft(id), ...value } }));
  async function submit(id: number) {
    setMessage(current => ({ ...current, [id]: "Saving…" }));
    const value = draft(id);
    const response = await fetch(`/api/admin/release-change-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(current => ({ ...current, [id]: data.error || "Update failed." })); return; }
    setRequests(current => current.map(item => item.id === id ? { ...item, ...data.request, events: [...item.events, { id: Date.now(), newStatus: data.request.status, note: value.note, createdAt: new Date().toISOString() }] } : item));
    setMessage(current => ({ ...current, [id]: "Saved." }));
  }
  return <div className="mt-6 grid gap-4">{requests.map(item => <article key={item.id} className="surface-card"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-soft)" }}>Request #{item.id} · {item.requestType.replace(/_/g, " ")}</p><h2 className="mt-2 text-xl font-semibold">{item.release.title}</h2><p className="text-sm" style={{ color: "var(--text-muted)" }}>{item.release.artistName}</p></div><span className="status-pill capitalize">{item.status.replace(/_/g, " ")}</span></div><p className="mt-4 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{item.reason}</p><div className="mt-4 grid gap-3 md:grid-cols-3"><select className="input" value={draft(item.id).decision} onChange={event => setDraft(item.id, { decision: event.target.value })}>{decisions.map(value => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}</select><input className="input" value={draft(item.id).providerReference} onChange={event => setDraft(item.id, { providerReference: event.target.value })} placeholder="Partner reference when applicable" /><input className="input" value={draft(item.id).note} onChange={event => setDraft(item.id, { note: event.target.value })} placeholder="Required decision note" /></div><div className="mt-3 flex items-center gap-3"><button type="button" onClick={() => submit(item.id)} className="btn-primary pressable">Record decision</button><span className="text-sm" aria-live="polite" style={{ color: "var(--text-muted)" }}>{message[item.id]}</span></div><details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Event history ({item.events.length})</summary><div className="mt-3 grid gap-2">{item.events.map(event => <div key={event.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}><strong className="capitalize">{event.newStatus.replace(/_/g, " ")}</strong> — {event.note}<time className="ml-2 text-xs" style={{ color: "var(--text-soft)" }}>{new Date(event.createdAt).toLocaleString()}</time></div>)}</div></details></article>)}{!requests.length ? <p className="surface-card text-sm" style={{ color: "var(--text-muted)" }}>No release change requests.</p> : null}</div>;
}
// vercel trigger 9
