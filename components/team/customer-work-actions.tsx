"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { CALL_PHASES } from "@/lib/team/call-journey";
import styles from "./customer-work.module.css";

type Api = <T>(resource: string, body?: unknown) => Promise<T>;
type Task = { id: string; title: string; version: number; ownerId?: string; dueAt?: string | null };
type Slot = { startsAt: string; memberId: string; name: string; reason: string };
const date = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " IST";
const localTime = (value: string) => new Date(`${value}+05:30`).toISOString();

export function CustomerWorkActions({ api, task, clientId, onSaved, canSchedule = true, canHandoff = true, confirmed = false }: { api: Api; task?: Task; clientId?: string; onSaved: () => void; canSchedule?: boolean; canHandoff?: boolean; confirmed?: boolean }) {
  const taskId = task?.id;
  const dialog = useRef<HTMLDialogElement>(null), generation = useRef(0), requestKey = useRef("");
  const [panel, setPanel] = useState<"schedule" | "handoff" | null>(null), [slots, setSlots] = useState<Slot[]>([]), [members, setMembers] = useState<{ id: string; department: string; user: { name: string } }[]>([]), [selected, setSelected] = useState(""), [keep, setKeep] = useState(true), [after, setAfter] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { if (panel) { requestKey.current = crypto.randomUUID(); dialog.current?.showModal(); } else dialog.current?.close(); }, [panel]);
  useEffect(() => {
    if (!panel) return;
    const current = ++generation.current; let active = true;
    setLoading(true); setError(""); setSlots([]); setSelected("");
    let params: URLSearchParams;
    try { params = new URLSearchParams({ keep: taskId && keep ? "1" : "0", ...(taskId ? { taskId } : {}), ...(after ? { after: localTime(after) } : {}) }); }
    catch { setError("Choose a valid date and time."); setLoading(false); return; }
    const request = panel === "handoff" ? api<{ items: typeof members }>("handoff-members").then(result => { if (active && generation.current === current) setMembers(result.items); }) : api<{ items: Slot[] }>(`call-slots?${params}`).then(result => { if (active && generation.current === current) { setSlots(result.items); setSelected(result.items[0]?.startsAt || ""); } });
    void request.catch(cause => { if (active && generation.current === current) setError(cause instanceof Error ? cause.message : "Options could not be loaded."); }).finally(() => { if (active && generation.current === current) setLoading(false); });
    return () => { active = false; };
  }, [panel, taskId, keep, after, api]); // Tasks are revalidated by version when saved.
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      if (panel === "handoff" && task) await api("handoff-request", { taskId: task.id, version: task.version, toId: form.get("toId"), team: form.get("team"), mode: form.get("mode"), summary: form.get("summary"), requestKey: requestKey.current });
      else await api(task ? "call-reschedule" : "customer-call-create", { ...(task ? { id: task.id, version: task.version } : { clientId, purpose: form.get("purpose"), phase: form.get("phase"), requestKey: requestKey.current }), startsAt: selected, keepAssignee: keep, confirmed: form.has("confirmed"), reason: form.get("reason") });
      setNotice(panel === "handoff" ? "Handoff requested. The current teammate remains responsible until acceptance." : "Schedule saved. Confirmed calls sync to Google Calendar when the hosting account is connected.");
      setPanel(null); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your change could not be saved."); }
    finally { setBusy(false); }
  }
  return <div className={styles.actions}>
    {canSchedule && (task || clientId) ? <button type="button" onClick={() => { setError(""); setPanel("schedule"); }}>{task ? "Reschedule" : "Schedule call"}</button> : null}
    {canHandoff && task ? <button type="button" onClick={() => { setError(""); setPanel("handoff"); }}>Hand off / request help</button> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <dialog ref={dialog} className={styles.dialog} onCancel={event => { if (busy) event.preventDefault(); else setPanel(null); }} onClose={() => setPanel(null)}>
      <header><h2>{panel === "handoff" ? "Hand off or request specialist help" : task ? "Reschedule call" : "Schedule customer call"}</h2><button type="button" aria-label="Close scheduling or handoff" disabled={busy} onClick={() => setPanel(null)}>Close</button></header>
      {task ? <p>{task.title}{task.dueAt ? ` · Currently ${date(task.dueAt)}` : " · Not scheduled"}</p> : null}
      <form onSubmit={save}>
        {panel === "handoff" ? <>
          <label>Action<select name="mode" aria-label="Handoff action"><option value="TRANSFER">Transfer responsibility after acceptance</option><option value="HELP">Request specialist help; keep responsibility</option></select></label>
          <label>Receiving teammate<select name="toId" required><option value="">Choose a teammate</option>{members.map(member => <option key={member.id} value={member.id}>{member.user.name}{member.department ? ` · ${member.department}` : ""}</option>)}</select></label>
          <label>Receiving team<input name="team" maxLength={100} placeholder="e.g. Distribution support"/></label>
          <label>Handoff summary<textarea name="summary" minLength={15} maxLength={2000} rows={5} placeholder="Customer need; work completed; commitments; next action and deadline." required/></label>
        </> : <>
          {!task ? <><label>Call purpose<input name="purpose" minLength={3} maxLength={180} required/></label><label>Conversation stage<select name="phase">{Object.entries(CALL_PHASES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></> : null}
          {task ? <label className={styles.check}><input type="checkbox" checked={keep} onChange={event => setKeep(event.target.checked)}/>Keep the current teammate</label> : null}
          <label>Find availability after (IST)<input type="datetime-local" value={after} onChange={event => setAfter(event.target.value)}/></label>
          <label>Available time<select value={selected} required disabled={loading} onChange={event => setSelected(event.target.value)}><option value="">{loading ? "Checking shared availability…" : "Choose a slot"}</option>{slots.map(slot => <option key={`${slot.startsAt}:${slot.memberId}`} value={slot.startsAt}>{date(slot.startsAt)} · {slot.name}</option>)}</select></label>
          {!loading && !slots.length ? <p>No free slot found. Try a later date or allow another teammate.</p> : null}
          {slots.find(slot => slot.startsAt === selected)?.reason ? <p>{slots.find(slot => slot.startsAt === selected)?.reason}</p> : null}
          <label className={styles.check}><input name="confirmed" type="checkbox" defaultChecked={confirmed}/>The customer agreed to this appointment time</label>
          <p>Agreed appointments create a Google Calendar invitation and Meet link. Other times remain internal plans.</p>
          <label>Reason / next step<textarea name="reason" minLength={5} maxLength={1000} rows={3} required/></label>
        </>}
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <button type="submit" disabled={busy || loading || panel === "schedule" && !selected}>{busy ? "Saving…" : panel === "handoff" ? "Request handoff" : "Save schedule"}</button>
      </form>
    </dialog>
  </div>;
}
