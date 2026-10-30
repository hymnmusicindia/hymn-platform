"use client";

import { useCallback, useEffect, useState } from "react";
import { CLIENT_INTERESTS } from "@/lib/team/client-interests";

type Member = { id: string; user: { name: string; email: string } };
type Card = {
  id: string; version: number; userId: number | null; name: string; phone: string; email: string; secondaryEmail: string;
  city: string; state: string; interests: string[]; notes: string; ownerId: string; status: string;
  user: { id: number; status: string; role: string; name: string; email: string; mobile: string | null } | null;
  owner: { id: string; user: { name: string; email: string } };
};
type Payload = { items: Card[]; members: Member[]; total: number };

const field = "w-full rounded-lg border border-white/10 bg-[#11151c] px-3 py-2 text-sm text-white outline-none focus:border-sky-300";
const label = "grid gap-1.5 text-xs font-medium text-slate-300";

export function AdminClientCards() {
  const [items, setItems] = useState<Card[]>([]), [members, setMembers] = useState<Member[]>([]), [total, setTotal] = useState(0);
  const [search, setSearch] = useState(""), [editing, setEditing] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [whatsappReminder, setWhatsappReminder] = useState<{ missingMobile: number; pending: number; invited: number; configured: boolean } | null>(null);
  const [sendingReminders, setSendingReminders] = useState(false);
  const refresh = useCallback(async (query: string, offset = 0, append = false) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/client-cards?q=${encodeURIComponent(query)}&offset=${offset}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load client cards.");
      setItems(current => append ? [...current, ...data.items] : data.items); setMembers(data.members); setTotal(data.total);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load client cards."); }
    finally { setLoading(false); }
  }, []);
  const refreshWhatsAppReminder = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/client-cards/whatsapp-reminder", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check WhatsApp reminder status.");
      setWhatsappReminder(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not check WhatsApp reminder status."); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(search, 0); }, 180); return () => window.clearTimeout(timer); }, [refresh, search]);
  useEffect(() => { void refreshWhatsAppReminder(); }, [refreshWhatsAppReminder]);
  async function sendWhatsAppReminders() {
    if (!whatsappReminder?.pending || sendingReminders) return;
    if (!window.confirm(`Send an email asking ${whatsappReminder.pending} active customers and producers to add a WhatsApp number?`)) return;
    setSendingReminders(true); setError(""); setNotice("");
    let cursor = 0, sent = 0, failed = 0, remaining = whatsappReminder.pending;
    try {
      while (remaining > 0) {
        const response = await fetch("/api/admin/client-cards/whatsapp-reminder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ afterId: cursor }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not send reminder emails.");
        sent += Number(data.sent || 0); failed += Number(data.failed || 0); remaining = Number(data.remaining || 0); cursor = Number(data.nextCursor || cursor);
        setNotice(`WhatsApp number reminder email: ${sent} sent, ${failed} need attention, ${remaining} remaining.`);
        if (!data.processed) break;
      }
      setNotice(`Reminder run finished: ${sent} sent, ${failed} need attention. Anyone still without a number can be reminded later.`);
      await refreshWhatsAppReminder();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send reminder emails."); await refreshWhatsAppReminder(); }
    finally { setSendingReminders(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = {
      id: editing.id, version: editing.version, name: String(form.get("name") || ""), phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""), secondaryEmail: String(form.get("secondaryEmail") || ""), city: String(form.get("city") || ""), state: String(form.get("state") || ""),
      interests: form.getAll("interests").map(String), notes: String(form.get("notes") || ""), ownerId: String(form.get("ownerId") || ""), status: String(form.get("status") || "ACTIVE")
    };
    try {
      const response = await fetch("/api/admin/client-cards", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save card.");
      setItems(current => current.map(card => card.id === data.item.id ? data.item : card)); setEditing(null); setNotice("Client card saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save card."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto w-full max-w-7xl px-5 py-8 text-slate-100 md:px-8">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-sky-200">Growth / Client relationship management</p><h1 className="text-3xl font-semibold tracking-tight">Client cards</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A shared directory of registered HYMN customers and producers. Account profiles fill available details; admins can add context and assign a team owner.</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!whatsappReminder?.configured || !whatsappReminder?.pending || sendingReminders} onClick={() => void sendWhatsAppReminders()} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{sendingReminders ? "Sending reminders…" : whatsappReminder ? `Email WhatsApp setup link · ${whatsappReminder.pending}` : "Checking missing numbers…"}</button><button onClick={() => { void refresh(search); void refreshWhatsAppReminder(); }} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">Refresh directory</button></div></div>
    {whatsappReminder && <p className="mb-4 text-xs text-slate-400">{whatsappReminder.missingMobile} active users have no mobile number · {whatsappReminder.invited} have already been invited. The email links to account settings; adding a number is optional.</p>}
    <div className="mb-5 flex flex-wrap items-center gap-3"><input className={`${field} max-w-xl`} type="search" placeholder="Search name, email, WhatsApp or location" value={search} onChange={event => setSearch(event.target.value)} /><span className="text-sm text-slate-400">{items.length} shown · {total} matches</span><button onClick={() => void refresh(search)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10">Refresh</button></div>
    {error && <p role="alert" className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}{notice && <p role="status" className="mb-4 rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-200">{notice}</p>}
    {loading && !items.length ? <p className="py-12 text-center text-sm text-slate-400">Loading client cards…</p> : items.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map(card => <article key={card.id} className="rounded-xl border border-white/10 bg-[#141820] p-4 shadow-[0_16px_50px_-35px_rgba(0,0,0,.8)]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-base font-semibold">{card.name}</h2><p className="mt-1 truncate text-xs text-slate-400">{card.user ? `${card.user.role.toLowerCase()} account · ${card.user.status.toLowerCase()}` : "Manual client card"}</p></div><span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-100">{card.status.replaceAll("_", " ")}</span></div><div className="mt-4 space-y-1.5 text-sm text-slate-300">{card.phone ? <a className="block hover:text-white" href={`https://wa.me/${card.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp · {card.phone}</a> : <p className="text-slate-500">WhatsApp · not provided</p>}<p className="break-all">{card.email || card.user?.email || "Email · not provided"}</p>{(card.city || card.state) && <p className="text-slate-400">{[card.city, card.state].filter(Boolean).join(", ")}</p>}</div>{card.interests.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{card.interests.map(value => <span key={value} className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-slate-300">{CLIENT_INTERESTS[value as keyof typeof CLIENT_INTERESTS] || value}</span>)}</div>}<div className="mt-4 border-t border-white/10 pt-3"><p className="text-xs text-slate-400">Assigned to <span className="font-medium text-slate-200">{card.owner.user.name}</span></p>{card.notes && <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-5 text-slate-400">{card.notes}</p>}<button onClick={() => { setError(""); setEditing(card); }} className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">Edit card</button></div></article>)}</div> : !loading ? <p className="rounded-xl border border-dashed border-white/15 p-10 text-center text-sm text-slate-400">{search ? "No cards match this search." : "There are no registered customer or producer accounts yet."}</p> : null}
    {items.length < total && <div className="mt-5 text-center"><button disabled={loading} onClick={() => void refresh(search, items.length, true)} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm disabled:opacity-50">{loading ? "Loading…" : "Load more client cards"}</button></div>}
    {editing && <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--overlay)] p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setEditing(null); }}><form onSubmit={save} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-[#171b23] p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">Edit client card</h2><p className="mt-1 text-xs text-slate-400">Linked account details · {editing.user?.email || "manual record"}</p></div><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm">Close</button></div><div className="grid gap-3 sm:grid-cols-2"><label className={label}>Name<input className={field} name="name" required maxLength={160} defaultValue={editing.name}/></label><label className={label}>WhatsApp number<input className={field} name="phone" maxLength={40} defaultValue={editing.phone}/></label><label className={label}>Email<input className={field} name="email" type="email" defaultValue={editing.email}/></label><label className={label}>Secondary email<input className={field} name="secondaryEmail" type="email" defaultValue={editing.secondaryEmail}/></label><label className={label}>City (optional)<input className={field} name="city" maxLength={100} defaultValue={editing.city}/></label><label className={label}>State / region (optional)<input className={field} name="state" maxLength={100} defaultValue={editing.state}/></label><label className={label}>Assigned team owner<select className={field} name="ownerId" defaultValue={editing.ownerId}>{members.map(member => <option key={member.id} value={member.id}>{member.user.name} · {member.user.email}</option>)}</select></label><label className={label}>Card status<select className={field} name="status" defaultValue={editing.status}><option value="ACTIVE">Active</option><option value="DO_NOT_CONTACT">Do not contact</option><option value="ARCHIVED">Archived</option></select></label></div><fieldset><legend className="mb-2 text-xs font-medium text-slate-300">Services of interest</legend><div className="grid gap-2 sm:grid-cols-2">{Object.entries(CLIENT_INTERESTS).map(([key, value]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[.02] p-2 text-xs text-slate-300"><input type="checkbox" name="interests" value={key} defaultChecked={editing.interests.includes(key)} />{value}</label>)}</div></fieldset><label className={label}>Client context / footnote<textarea className={`${field} min-h-28`} name="notes" maxLength={10000} defaultValue={editing.notes} placeholder="Goals, preferences, recent conversations, or follow-up context"/></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-sky-200 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? "Saving…" : "Save card"}</button></div></form></div>}
  </main>;
}
