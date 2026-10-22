"use client";

import { useState } from "react";
import { WorkspaceRecords } from "@/components/workspace-records";

type RequestRow = { id: number; requestType: string; status: string; reason: string; desiredEffectiveAt?: string | null; providerReference?: string | null; submittedAt: string; release: { title: string; artistName: string; status: string }; events: Array<{ id: number; newStatus: string; note: string; createdAt: string }> };
const decisions = ["approved", "information_required", "rejected", "processing_manually", "submitted_to_partner", "completed", "failed"];

export function ReleaseChangeRequestQueue({ initialRequests }: { initialRequests: RequestRow[] }) {
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [pendingId,setPendingId]=useState<number|null>(null);
  const [requests, setRequests] = useState(initialRequests);
  const [drafts, setDrafts] = useState<Record<number, { decision: string; note: string; providerReference: string }>>({});
  const [message, setMessage] = useState<Record<number, string>>({});
  const draft = (id: number) => drafts[id] ?? { decision: "approved", note: "", providerReference: "" };
  const setDraft = (id: number, value: Partial<ReturnType<typeof draft>>) => setDrafts(current => ({ ...current, [id]: { ...draft(id), ...value } }));
  async function submit(id: number) {
    if(pendingId!==null)return;
    if(!draft(id).note.trim()){setMessage(current=>({...current,[id]:"Add a decision note."}));return;}
    setPendingId(id);
    try {
    setMessage(current => ({ ...current, [id]: "Saving…" }));
    const value = draft(id);
    const response = await fetch(`/api/admin/release-change-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(current => ({ ...current, [id]: data.error || "Update failed." })); return; }
    setRequests(current => current.map(item => item.id === id ? { ...item, ...data.request, events: [...item.events, { id: Date.now(), newStatus: data.request.status, note: value.note, createdAt: new Date().toISOString() }] } : item));
    setMessage(current => ({ ...current, [id]: "Saved." }));
    }catch{setMessage(current=>({...current,[id]:"Could not save. Retry your decision."}));}finally{setPendingId(null);}
  }
  const [preview, setPreview] = useState<Record<number, { revision?: string; issues?: unknown[] }>>({});
  async function amendment(id: number, action: 'preview' | 'submit') {
    if (pendingId !== null) return;
    setPendingId(id);
    try {
      const response = await fetch(`/api/admin/release-change-requests/${id}/amendment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(action === 'submit' ? { previewRevision: preview[id]?.revision } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || data.validation?.issues?.map((issue: { message: string }) => issue.message).join(' ') || 'Amendment was not confirmed.');
      if (action === 'preview') setPreview(current => ({ ...current, [id]: data }));
      if (data.request) setRequests(current => current.map(item => item.id === id ? { ...item, ...data.request } : item));
      setMessage(current => ({ ...current, [id]: action === 'preview' ? 'Check the locked identifiers and outgoing payload below.' : 'Amendment accepted. Monitoring the assigned identifiers and profile mapping.' }));
    } catch (error) { setMessage(current => ({ ...current, [id]: error instanceof Error ? error.message : 'Amendment failed.' })); }
    finally { setPendingId(null); }
  }
  return <div className="mt-6 grid gap-4"><WorkspaceRecords rows={requests} rowKey={item=>item.id} searchText={item=>`${item.id} ${item.release.title} ${item.release.artistName} ${item.requestType} ${item.status}`} noun="requests" columns={[
    {key:"release",label:"Release",primary:true,render:item=><><strong>{item.release.title}</strong><small>{item.release.artistName} / #{item.id}</small></>,value:item=>item.release.title},
    {key:"type",label:"Request",render:item=>item.requestType.replaceAll("_"," "),value:item=>item.requestType},
    {key:"status",label:"Status",render:item=><span className="status-pill">{item.status.replaceAll("_"," ")}</span>,value:item=>item.status},
    {key:"date",label:"Submitted",render:item=>new Date(item.submittedAt).toLocaleDateString("en-IN"),value:item=>Date.parse(item.submittedAt)},
    {key:"open",label:"Review",render:item=><button className="btn-outline" onClick={()=>setSelectedId(item.id)}>Inspect request</button>}
  ]}/>{selectedId?<button className="btn-outline w-fit" onClick={()=>setSelectedId(null)}>Close request details</button>:null}{requests.filter(item=>item.id===selectedId).map(item => <article key={item.id} className="surface-card min-w-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-soft)" }}>Request #{item.id} · {item.requestType.replace(/_/g, " ")}</p><h2 className="mt-2 text-xl font-semibold">{item.release.title}</h2><p className="text-sm" style={{ color: "var(--text-muted)" }}>{item.release.artistName}</p></div><span className="status-pill capitalize">{item.status.replace(/_/g, " ")}</span></div><p className="mt-4 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{item.reason}</p><div className="mt-4 grid gap-3 md:grid-cols-3"><select className="input" value={draft(item.id).decision} onChange={event => setDraft(item.id, { decision: event.target.value })}>{decisions.map(value => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}</select><input className="input" value={draft(item.id).providerReference} onChange={event => setDraft(item.id, { providerReference: event.target.value })} placeholder="Partner reference when applicable" /><input className="input" value={draft(item.id).note} onChange={event => setDraft(item.id, { note: event.target.value })} placeholder="Required decision note" /></div><div className="mt-3 flex items-center gap-3"><button type="button" disabled={pendingId!==null} onClick={() => submit(item.id)} className="btn-primary pressable">Record decision</button><span className="text-sm" aria-live="polite" style={{ color: "var(--text-muted)" }}>{message[item.id]}</span></div>{item.requestType === 'metadata_update' && item.status === 'approved' ? <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}><h3 className="font-semibold">Artist profile amendment</h3><p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>For an approved Spotify profile correction. Preview the existing identifiers and new delivery before sending. The original delivery stays in history.</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" className="btn-outline" disabled={pendingId !== null} onClick={() => void amendment(item.id, 'preview')}>Preview amendment</button>{preview[item.id] ? <button type="button" className="btn-primary" disabled={pendingId !== null || Boolean(preview[item.id]?.issues?.length)} onClick={() => void amendment(item.id, 'submit')}>Send approved amendment</button> : null}</div>{preview[item.id] ? <pre className="mt-3 max-h-96 max-w-full overflow-auto rounded-xl p-3 text-xs" style={{ background: 'var(--bg-soft)' }}>{JSON.stringify(preview[item.id], null, 2)}</pre> : null}</div> : null}<details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Event history ({item.events.length})</summary><div className="mt-3 grid gap-2">{item.events.map(event => <div key={event.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}><strong className="capitalize">{event.newStatus.replace(/_/g, " ")}</strong> — {event.note}<time className="ml-2 text-xs" style={{ color: "var(--text-soft)" }}>{new Date(event.createdAt).toLocaleString()}</time></div>)}</div></details></article>)}{!requests.length ? <p className="surface-card text-sm" style={{ color: "var(--text-muted)" }}>No release change requests.</p> : null}</div>;
}
// vercel trigger 9
