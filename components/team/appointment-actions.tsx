"use client";
import { useState } from "react";
import styles from "./calendar.module.css";
type Api = <T>(resource: string, body?: unknown) => Promise<T>;
export function InlineClient({ api, ownerId, onCreated }: { api: Api; ownerId: string; onCreated: (client: { id: string; name: string }) => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [phone, setPhone] = useState("");
  return <section className={styles.accountMatch}>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close new client card" : "+ Add client card here"}</button>
    {open && <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      <label>Client name<input aria-label="New client name" value={name} maxLength={160} onChange={e => setName(e.target.value)}/></label>
      <label>Primary email (optional)<input aria-label="New client email" value={email} type="email" maxLength={320} onChange={e => setEmail(e.target.value)}/></label>
      <label>Phone (optional)<input aria-label="New client phone" value={phone} type="tel" maxLength={40} onChange={e => setPhone(e.target.value)}/></label>
      <small>A primary email enables appointment emails. Add interests, a secondary email and location later from Edit card.</small>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <button type="button" disabled={busy || !name.trim()} onClick={async () => {
        setBusy(true); setError("");
        try { const client = await api<{ id: string; name: string }>("clients-save", { name, email, phone, ownerId }); onCreated(client); setOpen(false); setName(""); setEmail(""); setPhone(""); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not create client."); }
        finally { setBusy(false); }
      }}>{busy ? "Creating…" : "Create & select client"}</button>
    </div>}
  </section>;
}
export function CallHandoff({ api, event, members, onDone }: { api: Api; event: { id: string; version: number; assigneeId: string }; members: { id: string; status: string; availability?: string; role?: { owner: boolean }; user: { name: string } }[]; onDone: () => void }) {
  const [target, setTarget] = useState(""), [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <fieldset className={styles.timeField}><legend>Pass call to another representative</legend>
    <label>Representative<select aria-label="Handoff representative" value={target} onChange={e => setTarget(e.target.value)}><option value="">Automatically find the next available rep</option>{members.filter(m => m.id !== event.assigneeId && !m.role?.owner && m.status === "ACTIVE" && (!m.availability || m.availability === "AVAILABLE")).map(m => <option key={m.id} value={m.id}>{m.user.name}</option>)}</select></label>
    <label>Handoff reason<input aria-label="Handoff reason" value={reason} maxLength={1000} onChange={e => setReason(e.target.value)}/></label>
    <small>Declared hours and calendar conflicts are checked. The appointment time stays the same. Both reps are notified; customer emails are sent only for confirmed appointments. If nobody is free, a manager is notified.</small>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button type="button" disabled={busy || reason.trim().length < 3} onClick={async () => {
      setBusy(true); setError("");
      try { const result=await api<{coverageRequired?:boolean;message?:string}>("calendar-handoff", { id: event.id, version: event.version, ...(target?{assigneeId:target}:{}), reason }); if(result.coverageRequired)setError(result.message||'Coverage requested from a manager.');else onDone(); }
      catch (e) { setError(e instanceof Error ? e.message : "Could not hand off call."); }
      finally { setBusy(false); }
    }}>{busy ? "Transferring…" : target ? "Transfer call" : "Pass to next available rep"}</button>
  </fieldset>;
}
