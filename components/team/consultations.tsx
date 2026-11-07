"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, CalendarClock, ChevronLeft, ChevronRight, Clipboard, LoaderCircle, Mail, MessageCircle, Phone, RefreshCw, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { CONSULTATION_INTERESTS, CONSULTATION_STATUSES } from "@/lib/consultation-domain";
import styles from "./consultations.module.css";

type Activity = { id: string; kind: string; message: string; createdAt: string; actorMember?: { user: { name: string } } | null };
type Consultation = {
  id: string; clientId: string; client: { id: string; name: string; email: string; phone: string }; fullName: string; email: string; phoneE164: string; dialCode: string; interests: string[];
  otherRequirement: string; source: string; campaign: string | null; preferredCallback: string | null;
  status: string; createdAt: string; assignedMemberId: string | null;
  assignedMember?: { id: string; user: { name: string } } | null;
  calendarEvent?: { id: string; startsAt: string; status: string } | null;
  activities: Activity[];
};
type Payload = { items: Consultation[]; total: number; offset: number; statuses: Record<string, number>; members: { id: string; user: { name: string } }[] };
type Actor = { id: string; workspaceId: string; owner: boolean; permissions: string[] };

const statusLabel = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase());
const dateLabel = (value?: string | null) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) + " IST" : "Not scheduled";
const interestLabel = (value: string) => CONSULTATION_INTERESTS.find(item => item.id === value)?.title || value;

export function TeamConsultations({ actor, initialId = "", initialQuery = "" }: { actor: Actor; initialId?: string; initialQuery?: string }) {
  const canAssign = actor.owner || actor.permissions.includes("crm.prospects.assign");
  const canManage = actor.owner || actor.permissions.includes("crm.outreach.manage");
  const [data, setData] = useState<Payload>({ items: [], total: 0, offset: 0, statuses: {}, members: [] });
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState("");
  const [interestFilter, setInterestFilter] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [assignedId, setAssignedId] = useState("");
  const [status, setStatus] = useState("");
  const [callbackValue, setCallbackValue] = useState("");
  const [note, setNote] = useState("");
  const [contactAttempt, setContactAttempt] = useState("");
  const [reassignmentReason, setReassignmentReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (resource: string, body?: unknown) => {
    const url = `/api/team/${resource}${resource.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(actor.workspaceId)}`;
    const response = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The consultation request could not be completed.");
    return result;
  }, [actor.workspaceId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ offset: String(offset) });
      if (query.trim()) params.set("q", query.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (interestFilter) params.set("interest", interestFilter);
      if (memberFilter) params.set("member", memberFilter);
      if (fromFilter) params.set("from", fromFilter);
      if (toFilter) params.set("to", toFilter);
      params.set("sort", sort);
      const result = await request(`consultations?${params}`) as Payload;
      setData(result);
      setSelectedId(current => result.items.some(item => item.id === current) ? current : result.items.some(item => item.id === initialId) ? initialId : "");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Consultations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [fromFilter, initialId, interestFilter, memberFilter, offset, query, request, sort, statusFilter, toFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [refresh, query]);
  useEffect(() => { setQuery(initialQuery); setOffset(0); }, [initialQuery]);

  const selected = useMemo(() => data.items.find(item => item.id === selectedId), [data.items, selectedId]);
  useEffect(() => {
    setAssignedId(selected?.assignedMemberId || "");
    setStatus(selected?.status || "");
    setCallbackValue(selected?.preferredCallback ? new Date(new Date(selected.preferredCallback).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
    setNote("");
    setContactAttempt("");
    setReassignmentReason("");
  }, [selected]);

  async function mutate(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("consultations", body);
      setNotice(message);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function requestReassignment() {
    if (!selected || reassignmentReason.trim().length < 5) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("consultations", { action: "request_reassignment", id: selected.id, message: reassignmentReason.trim() }) as { duplicate?: boolean };
      setNotice(result.duplicate ? "A reassignment request is already waiting for the workspace managers." : "Reassignment request sent to the workspace managers.");
      setReassignmentReason("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your reassignment request could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function copyContact() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(`${selected.fullName}\n${selected.email}\n${selected.phoneE164}`);
      setNotice("Contact details copied.");
    } catch (cause) {
      setError(cause instanceof Error ? "Clipboard access was denied. Select and copy the contact details manually." : "Contact details could not be copied.");
    }
  }

  const total = Object.values(data.statuses).reduce((sum, count) => sum + count, 0);
  const conversionRate = total ? Math.round((data.statuses.CONVERTED || 0) / total * 100) : 0;
  const pageSize = 100;
  const phoneDigits = selected?.phoneE164.replace(/\D/g, "") || "";

  return <section className={styles.root} aria-labelledby="consultations-title">
    <header className={styles.heading}>
      <div>
        <span className={styles.eyebrow}><ShieldCheck size={14}/> ACQUISITION · CONSULTATIONS</span>
        <h2 id="consultations-title">Artist consultations</h2>
        <p>Manage inbound requests, callbacks and follow-ups from artists interested in working with HYMN.</p>
      </div>
      <button type="button" className={styles.refreshButton} onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? styles.spin : ""}/> Refresh</button>
    </header>

    {error ? <div className={styles.error} role="alert">{error}<button type="button" onClick={() => void refresh()}>Retry</button></div> : null}
    {notice ? <div className={styles.notice} role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={15}/></button></div> : null}

    <div className={styles.metrics}>
      {[
        ["Total leads", total],
        ["New leads", data.statuses.NEW_LEAD || 0],
        ["Unassigned", data.statuses.UNASSIGNED || 0],
        ["Assigned", data.statuses.ASSIGNED || 0],
        ["Callbacks", data.statuses.CALLBACK_SCHEDULED || 0],
        ["Consultations done", data.statuses.CONSULTATION_COMPLETED || 0],
        ["Converted", data.statuses.CONVERTED || 0],
        ["Conversion rate", `${conversionRate}%`]
      ].map(([label, count]) => <article key={String(label)}><span>{label}</span><strong>{count}</strong></article>)}
    </div>

    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={16}/><input aria-label="Search consultations" placeholder="Search name, email or phone" value={query} onChange={event => { setOffset(0); setQuery(event.target.value); }}/></label>
      <select aria-label="Filter by status" value={statusFilter} onChange={event => { setOffset(0); setStatusFilter(event.target.value); }}><option value="">All statuses</option>{CONSULTATION_STATUSES.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select>
      <select aria-label="Filter by service" value={interestFilter} onChange={event => { setOffset(0); setInterestFilter(event.target.value); }}><option value="">All services</option>{CONSULTATION_INTERESTS.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
      {canAssign ? <select aria-label="Filter by assigned member" value={memberFilter} onChange={event => { setOffset(0); setMemberFilter(event.target.value); }}><option value="">All team members</option><option value="unassigned">Unassigned</option>{data.members.map(member => <option key={member.id} value={member.id}>{member.user.name}</option>)}</select> : null}
      <button type="button" className={styles.sortButton} onClick={() => { setOffset(0); setSort(value => value === "newest" ? "oldest" : "newest"); }}><ArrowDownUp size={13}/> {sort === "newest" ? "Newest first" : "Oldest first"}</button>
      <label className={styles.dateFilter}>From<input aria-label="From date" type="date" value={fromFilter} onChange={event => { setOffset(0); setFromFilter(event.target.value); }}/></label>
      <label className={styles.dateFilter}>To<input aria-label="To date" type="date" value={toFilter} onChange={event => { setOffset(0); setToFilter(event.target.value); }}/></label>
    </div>

    <div className={styles.body}>
      <div className={styles.listPane} aria-busy={loading}>
        {loading && !data.items.length ? <div className={styles.empty}><LoaderCircle size={20} className={styles.spin}/> Loading consultation requests…</div> : null}
        {!loading && !data.items.length ? <div className={styles.empty}><UserRound size={23}/><strong>No consultation requests found</strong><span>Try changing the filters or check back when a new lead arrives.</span></div> : null}
        {data.items.map(item => <button type="button" key={item.id} className={`${styles.leadCard} ${item.id === selectedId ? styles.leadSelected : ""}`} onClick={() => setSelectedId(item.id)}>
          <div className={styles.leadTop}><strong>{item.fullName}</strong><span className={`${styles.status} ${styles[`status_${item.status}`] || ""}`}>{statusLabel(item.status)}</span></div>
          <span className={styles.leadEmail}>{item.email}</span>
          <span className={styles.leadMeta}>{item.assignedMember?.user.name || "Unassigned"}<i/> {dateLabel(item.preferredCallback)}<i/> {dateLabel(item.createdAt)}</span>
          <span className={styles.chips}>{item.interests.map(interest => <small key={interest}>{interestLabel(interest)}</small>)}</span>
        </button>)}
        <div className={styles.pagination}><span>{data.total ? `${offset + 1}–${Math.min(offset + pageSize, data.total)} of ${data.total}` : "0 results"}</span><div><button type="button" aria-label="Previous page" disabled={!offset || loading} onClick={() => setOffset(value => Math.max(0, value - pageSize))}><ChevronLeft size={16}/></button><button type="button" aria-label="Next page" disabled={offset + pageSize >= data.total || loading} onClick={() => setOffset(value => value + pageSize)}><ChevronRight size={16}/></button></div></div>
      </div>

      <div className={styles.detailPane}>
        {!selected ? <div className={styles.emptyDetail}><ArrowDownUp size={22}/><strong>Select a consultation</strong><span>Contact details, callback scheduling and activity history will appear here.</span></div> : <>
          <div className={styles.contactHeader}><div><span className={styles.eyebrow}>CONSULTATION · CONTACT RECORD</span><h3>{selected.fullName}</h3><span>{selected.email}</span><Link className={styles.contactLink} href={`/team?${new URLSearchParams({workspace:actor.workspaceId,module:"contacts",client:selected.clientId,returnModule:"consultations",returnId:selected.id,returnParam:"consultation",returnQuery:query})}`}>Open shared contact record</Link></div><span className={`${styles.status} ${styles[`status_${selected.status}`] || ""}`}>{statusLabel(selected.status)}</span></div>
          <div className={styles.contactActions}>
            <a href={`tel:${selected.phoneE164}`}><Phone size={15}/> Call</a>
            <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer"><MessageCircle size={15}/> WhatsApp</a>
            <a href={`mailto:${encodeURIComponent(selected.email)}`}><Mail size={15}/> Email</a>
            <button type="button" onClick={() => void copyContact()}><Clipboard size={15}/> Copy</button>
          </div>

          <div className={styles.detailsGrid}>
            <div><span>Phone</span><strong>{selected.phoneE164}</strong></div>
            <div><span>Source</span><strong>{selected.source}{selected.campaign ? ` · ${selected.campaign}` : ""}</strong></div>
            <div><span>Callback</span><strong>{dateLabel(selected.preferredCallback)}</strong></div>
            <div><span>Assigned to</span><strong>{selected.assignedMember?.user.name || "Unassigned"}</strong></div>
            <div className={styles.wide}><span>Interested in</span><strong>{selected.interests.map(interestLabel).join(", ")}</strong></div>
            {selected.otherRequirement ? <div className={styles.wide}><span>Additional requirement</span><strong>{selected.otherRequirement}</strong></div> : null}
          </div>

          <div className={styles.managePanel}>
            <h4>Manage consultation</h4>
            <label>Status<select disabled={!canManage} value={status} onChange={event => setStatus(event.target.value)}>{CONSULTATION_STATUSES.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
            {canManage ? <button type="button" disabled={busy || status === selected.status} onClick={() => void mutate({ action: "status", id: selected.id, status }, "Consultation status updated.")}>{busy ? "Saving…" : "Update status"}</button> : null}
            {canAssign ? <><label>Assign to<select value={assignedId} onChange={event => setAssignedId(event.target.value)}><option value="">Unassigned</option>{data.members.map(member => <option key={member.id} value={member.id}>{member.user.name}</option>)}</select></label><button type="button" disabled={busy || !assignedId || assignedId === selected.assignedMemberId} onClick={() => void mutate({ action: "assign", id: selected.id, memberId: assignedId }, "Consultation assigned.")}>Assign lead</button></> : null}
            {canManage ? <><label>Callback time <span className={styles.timeHint}>Your local time · saved and shown in IST</span><input type="datetime-local" value={callbackValue} onChange={event => setCallbackValue(event.target.value)}/></label>
            <div className={styles.inlineActions}><button type="button" disabled={busy || !callbackValue} onClick={() => void mutate({ action: "callback", id: selected.id, callbackAt: callbackValue ? new Date(callbackValue).toISOString() : null }, "Callback schedule updated.")}><CalendarClock size={14}/> Set or reschedule</button>{selected.preferredCallback ? <button type="button" className={styles.quietButton} disabled={busy} onClick={() => void mutate({ action: "callback", id: selected.id, callbackAt: null }, "Callback cancelled.")}>Cancel callback</button> : null}</div>
            </> : null}
            {selected.assignedMemberId === actor.id ? <div className={styles.reassignment}><label>Request reassignment<textarea maxLength={1000} rows={2} placeholder="Tell the workspace owner why this lead should be reassigned." value={reassignmentReason} onChange={event => setReassignmentReason(event.target.value)}/></label><button type="button" disabled={busy || reassignmentReason.trim().length < 5} onClick={() => void requestReassignment()}>Request reassignment</button></div> : null}
          </div>

          {canManage ? <div className={styles.notePanel}>
            <label>Internal note<textarea maxLength={2000} rows={2} placeholder="Add context for the HYMN team…" value={note} onChange={event => setNote(event.target.value)}/></label>
            <button type="button" disabled={busy || !note.trim()} onClick={async () => { await mutate({ action: "note", id: selected.id, message: note.trim() }, "Internal note added."); setNote(""); }}>Add note</button>
            <label>Contact attempt<textarea maxLength={2000} rows={2} placeholder="Record the call or message outcome…" value={contactAttempt} onChange={event => setContactAttempt(event.target.value)}/></label>
            <button type="button" disabled={busy || !contactAttempt.trim()} onClick={async () => { await mutate({ action: "contact_attempt", id: selected.id, message: contactAttempt.trim() }, "Contact attempt recorded."); setContactAttempt(""); }}>Log contact attempt</button>
          </div> : null}

          <div className={styles.history}>
            <h4>Consultation history</h4>
            {selected.activities.length ? selected.activities.map(activity => <article key={activity.id}><span className={styles.activityDot}/><div><strong>{activity.kind.replaceAll("_", " ").toLowerCase()}</strong>{activity.actorMember ? <span> · {activity.actorMember.user.name}</span> : null}<p>{activity.message}</p><time>{dateLabel(activity.createdAt)}</time></div></article>) : <p>No activity recorded yet.</p>}
          </div>
        </>}
      </div>
    </div>
  </section>;
}
