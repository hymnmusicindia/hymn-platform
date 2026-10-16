"use client";

import { useState } from "react";
import { direNoteV24Actions, isDireNoteMutation, isDireNoteReference, type DireNoteV24Action } from "@/lib/direnote/v24-contract";

const label = (value: string) => value.replace(/_/g, " ").replace(/^./, char => char.toUpperCase());
const editable: Record<string, string[]> = {
  update_artist: ["name", "spotify_url", "apple_url", "youtube_url", "instagram_url"],
  update_songwriter: ["name", "ipi", "iprs_member", "instagram_url", "x_url"],
};

function ResultValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-sm text-gray-400">Not provided</span>;
  if (Array.isArray(value)) return <div className="grid gap-3 sm:grid-cols-2">{value.length ? value.map((row, index) => <div key={index} className="min-w-0 rounded-xl border border-white/10 bg-black/10 p-3"><ResultValue value={row} /></div>) : <p>No records found.</p>}</div>;
  if (typeof value === "object") return <dl className="grid gap-2">{Object.entries(value).map(([key, item]) => <div key={key} className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label(key)}</dt><dd className="mt-1 break-words text-sm">{typeof item === "object" && item !== null ? <details><summary className="cursor-pointer py-2">{Array.isArray(item) ? `${item.length} records` : "View details"}</summary><ResultValue value={item} /></details> : <ResultValue value={item} />}</dd></div>)}</dl>;
  if (typeof value === "string") {
    let smartlink: string | null = null;
    try { const url = new URL(value); if (url.protocol === "https:" && url.hostname === "dnm.link" && !url.username && !url.password) smartlink = url.toString(); } catch { /* Render provider text safely, never as HTML. */ }
    if (smartlink) return <a className="text-sky-200 underline underline-offset-4" href={smartlink} target="_blank" rel="noopener noreferrer">Open release smartlink ↗</a>;
  }
  return <span className="break-words">{typeof value === "boolean" ? value ? "Yes" : "No" : String(value)}</span>;
}

export function DireNoteCataloguePanel() {
  const [action, setAction] = useState<DireNoteV24Action>("list_releases");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [operationId, setOperationId] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<any[] | null>(null);
  const mutation = isDireNoteMutation(action);
  const reference = isDireNoteReference(action);
  const paginated = action.startsWith("list_") && !reference;
  const idField = action === "update_artist" ? "artist_id" : action === "update_songwriter" ? "songwriter_id" : !action.startsWith("list_") ? "upc" : null;
  const confirmText = action === "withdraw_release" ? `WITHDRAW ${(fields.upc || "").replace(/[\s-]/g, "")}` : "CONFIRM UPDATE";
  const field = (key: string, type = "text") => <label key={key} className="grid min-w-0 gap-1 text-sm"><span className="text-gray-300">{label(key)}</span>{key === "iprs_member" ? <select className="min-h-11 rounded-lg border border-white/15 bg-[#141922] px-3" value={fields[key] || ""} onChange={event => setFields({ ...fields, [key]: event.target.value })}><option value="">Choose</option><option>Yes</option><option>No</option></select> : <input className="min-h-11 w-full rounded-lg border border-white/15 bg-[#141922] px-3 text-base" type={type} value={fields[key] || ""} onChange={event => setFields({ ...fields, [key]: event.target.value })} />}</label>;
  async function run(nextPage = page) {
    if (busy) return;
    setBusy(true); setError(""); setResult(null);
    const payload: Record<string, unknown> = {};
    if (paginated) Object.assign(payload, { page: nextPage, per_page: 25 });
    if (fields.search && !mutation && action.startsWith("list_") && action !== "list_payouts") payload.search = fields.search;
    if (idField) payload[idField] = idField === "upc" ? fields[idField] || "" : Number(fields[idField]);
    if (action === "list_payouts") for (const key of ["status", "payment_type", "from_date", "to_date", "payout_id"]) if (fields[key]) payload[key] = key === "payout_id" ? Number(fields[key]) : fields[key];
    if (action === "list_releases") for (const key of ["status", "type_of_release"]) if (fields[key]) payload[key] = fields[key];
    for (const key of enabled) payload[key] = fields[key] || "";
    const token = mutation ? operationId || crypto.randomUUID() : undefined;
    if (token) setOperationId(token);
    try {
      const response = await fetch("/api/admin/direnote/catalogue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload, ...(mutation ? { operationId: token, confirmation } : {}) }) });
      const data = await response.json(); setResult(data); setPage(nextPage);
      if (!response.ok) setError(`${data.error || "Provider request failed."}${data.auditId ? ` Audit #${data.auditId}.` : ""}${data.unconfirmed ? " Do not repeat this change; reconcile the outcome with DireNote first." : ""}`);
    } catch { setError("Connection interrupted. If this was a change, its outcome may be unconfirmed. Check the provider and audit log before trying again."); }
    finally { setBusy(false); }
  }
  const pagination = result?.data?.pagination;
  async function reconcile(auditId = result?.auditId) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/direnote/catalogue/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId }) });
      const data = await response.json();
      setError(data.error || data.message || "Provider check completed.");
      if (data.confirmed) { setResult({ auditId, unconfirmed: false, data: { state: "confirmed", provider: data.data } }); setUnfinished(rows => rows?.filter(row => row.id !== auditId) ?? null); }
    } catch { setError("Could not check the provider. The change has not been resent."); }
    finally { setBusy(false); }
  }
  async function findUnfinished() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/admin/direnote/catalogue", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load unfinished changes."); setUnfinished(data.pending); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load unfinished changes."); }
    finally { setBusy(false); }
  }
  return <section className="surface-card mt-6 p-5 sm:p-7"><h2 className="text-2xl font-semibold">DireNote catalogue &amp; tools</h2><p className="mt-2 text-sm text-gray-400">On-demand provider data. Browsing does not import releases or change HYMN balances. Reference lists are cached for 24 hours.</p>
    <button className="btn-outline mt-3 min-h-11" disabled={busy} onClick={() => void findUnfinished()}>Find unfinished provider changes</button>
    {unfinished ? <div className="mt-3 grid gap-2">{unfinished.length ? unfinished.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/30 p-3"><p className="text-sm">Audit #{row.id} · {label(row.action.replace(/^v24_/, ""))} · {row.requestPayloadRedacted?.resource} · {new Date(row.createdAt).toLocaleString("en-IN")}</p><button className="btn-outline min-h-11" disabled={busy} onClick={() => void reconcile(row.id)}>Check outcome — read only</button></div>) : <p className="text-sm text-gray-400">No unfinished provider changes.</p>}</div> : null}
    <form className="mt-5 grid gap-4" onSubmit={event => { event.preventDefault(); void run(1); }}>
      <label className="grid gap-1 text-sm">Operation<select className="min-h-11 rounded-lg border border-white/15 bg-[#141922] px-3 text-base" value={action} disabled={busy} onChange={event => { setAction(event.target.value as DireNoteV24Action); setFields({}); setEnabled([]); setResult(null); setError(""); setPage(1); setConfirmation(""); setOperationId(null); }}>{direNoteV24Actions.map(key => <option key={key} value={key}>{label(key)}{isDireNoteMutation(key) ? " — changes provider data" : ""}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2">{idField ? field(idField, idField === "upc" ? "text" : "number") : action !== "list_payouts" ? field("search", "search") : null}
        {action === "list_releases" ? <>{field("status")}<label className="grid gap-1 text-sm">Release type<select className="min-h-11 rounded-lg border border-white/15 bg-[#141922] px-3" value={fields.type_of_release || ""} onChange={event => setFields({ ...fields, type_of_release: event.target.value })}><option value="">All</option><option>Single</option><option>EP</option><option>Album</option></select></label></> : null}
        {action === "list_payouts" ? <>{field("payout_id", "number")}{field("status")}{field("payment_type")}{field("from_date", "date")}{field("to_date", "date")}</> : null}
      </div>
      {editable[action] ? <fieldset className="grid gap-3 rounded-xl border border-white/10 p-4"><legend className="px-2 text-sm">Select only fields you intend to change</legend><p className="text-sm text-gray-400">Unchecked fields are preserved. A selected blank URL or IPI clears it where the provider permits. Names and artist Instagram cannot be cleared. Provider edits do not silently overwrite verified HYMN identities.</p>{editable[action].map(key => <div key={key} className="grid gap-2 sm:grid-cols-[160px_1fr]"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={enabled.includes(key)} onChange={event => setEnabled(event.target.checked ? [...enabled, key] : enabled.filter(item => item !== key))} />Change {label(key)}</label>{enabled.includes(key) ? field(key) : null}</div>)}</fieldset> : null}
      {action === "list_payouts" ? <p className="rounded-xl border border-amber-300/30 p-3 text-sm text-amber-100">Partner settlement history in USD, not customer withdrawals or additional royalty earnings. These records never credit a wallet.</p> : null}
      {action === "check_qc_report" ? <p className="text-sm text-gray-400">“Scanned” means analysis is available, not that delivery has been approved.</p> : null}
      {mutation ? <div className="rounded-xl border border-amber-300/30 p-4"><p className="text-sm text-amber-100">{action === "withdraw_release" ? "Irreversible: only pending releases can be withdrawn. This is not a store takedown. Confirm the UPC and ownership before proceeding." : "This edits the shared provider identity. Verify the provider ID before proceeding; conflicts are not automatically merged."}</p><label className="mt-3 grid gap-1 text-sm">Type {confirmText}<input className="min-h-11 rounded-lg border border-white/20 bg-[#141922] px-3" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label></div> : null}
      <button className="btn-primary min-h-11 justify-self-start" disabled={busy || (mutation && confirmation !== confirmText)}>{busy ? "Contacting DireNote…" : mutation ? "Confirm provider change" : "Load provider data"}</button>
    </form>
    {error ? <p role="alert" className="mt-4 rounded-lg border border-red-300/30 p-3 text-sm text-red-200">{error}</p> : null}
    {result?.auditId && (result.unconfirmed || result.data?.state === "unconfirmed") ? <button className="btn-outline mt-3 min-h-11" disabled={busy} onClick={() => void reconcile()}>Check recorded change — read only</button> : null}
    {mutation && result && ["confirmed", "rejected", "not_sent"].includes(result.data?.state) ? <button className="btn-outline mt-3 min-h-11" disabled={busy} onClick={() => { setOperationId(null); setResult(null); setConfirmation(""); setError(""); }}>Prepare a separate change</button> : null}
    {result ? <div className="mt-5"><p className="mb-3 text-xs text-gray-400">{result.cachedAt ? `Cached ${new Date(result.cachedAt).toLocaleString("en-IN")}` : result.auditId ? `Audit #${result.auditId}` : "Provider response"}{result.replayed ? " · Previously recorded operation; not sent again" : ""}</p><ResultValue value={result.data} />{pagination ? <div className="mt-4 flex items-center gap-3"><button className="btn-outline" disabled={busy || page <= 1} onClick={() => void run(page - 1)}>Previous</button><span className="text-sm">Page {pagination.page} of {pagination.total_pages} · {pagination.total} records</span><button className="btn-outline" disabled={busy || !pagination.has_more} onClick={() => void run(page + 1)}>Next</button></div> : null}</div> : null}
  </section>;
}
