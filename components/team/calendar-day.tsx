"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CalendarTask } from "./calendar-board";
import styles from "./calendar.module.css";
type DayEvent = { id: string; version: number; creatorId: string; assigneeId: string; title: string; kind: string; status: string; startsAt: string; endsAt: string | null; notes: string; outcome: string; client?: { name: string; phone: string; email: string } | null };
const format = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata", hour12: true }).format(new Date(value));
export function CalendarDay({ day, events, tasks, members, actorId, workspaceId, manage, assign, canSchedule, onClose, onCreate, onEdit, onDelete }: { day: string; events: DayEvent[]; tasks: CalendarTask[]; members: { id: string; user: { name: string } }[]; actorId: string; workspaceId: string; manage: boolean; assign: boolean; canSchedule: boolean; onClose(): void; onCreate(): void; onEdit(id: string): void; onDelete(event: DayEvent): Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  const start = Date.parse(`${day}T00:00:00+05:30`), end = start + 86400000;
  const items = events.filter(e => e.status !== "DELETED" && Date.parse(e.startsAt) < end && (e.endsAt ? Date.parse(e.endsAt) > start : Date.parse(e.startsAt) >= start)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const due = tasks.filter(t => Date.parse(t.dueAt) >= start && Date.parse(t.dueAt) < end);
  const name = (id: string) => members.find(m => m.id === id)?.user.name || "Teammate";
  return <dialog ref={dialog} className={`${styles.dialog} ${styles.dayDialog}`} aria-labelledby="calendar-day-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header><div><h3 id="calendar-day-title">{new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))}</h3><small>{items.length} events · {due.length} My Work tasks · IST</small></div><button aria-label="Close day schedule" disabled={busy} onClick={onClose}>×</button></header>
    {canSchedule && <button disabled={busy} onClick={onCreate}>+ Schedule on this day</button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.dayEventList}>{items.map(event => <article key={event.id} className={styles.dayEventCard}>
      <header><h4>{event.title}</h4><span>{event.kind.replaceAll("_", " ")} · {event.status.replaceAll("_", " ")}</span></header>
      <p><strong>{format(event.startsAt)} IST</strong>{event.endsAt && <> → {format(event.endsAt)} IST</>}</p>
      <p>Assigned to {name(event.assigneeId)}</p>
      {event.kind === "CALL" && <small>Representative reserved for 30 minutes from the start. The end time does not extend this availability hold.</small>}
      {event.client && <div><strong>{event.client.name}</strong>{event.client.phone && <p><a href={`tel:${event.client.phone}`}>{event.client.phone}</a></p>}{event.client.email && <p><a href={`mailto:${event.client.email}`}>{event.client.email}</a></p>}</div>}
      {event.notes && <div><small>Research / footnotes</small><p className={styles.dayNotes}>{event.notes}</p></div>}
      {event.outcome && <div><small>Outcome / next step</small><p className={styles.dayNotes}>{event.outcome}</p></div>}
      <div className={styles.dayActions}><button disabled={busy} onClick={() => onEdit(event.id)}>Open event</button>{manage && (assign || event.creatorId === actorId || event.assigneeId === actorId) && <button className={styles.deleteEvent} disabled={busy} onClick={() => { setConfirm(event.id); setError(""); }}>Delete event</button>}</div>
      {confirm === event.id && <section className={styles.deleteConfirm} aria-label={`Delete ${event.title}`}><p>Delete this event? It will disappear from the calendar and pending reminders will stop. Audit history is retained.</p><div className={styles.dayActions}><button className={styles.deleteEvent} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onDelete(event); setConfirm(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not delete event."); } finally { setBusy(false); } }}>{busy ? "Deleting…" : "Confirm delete"}</button><button disabled={busy} onClick={() => setConfirm(null)}>Keep event</button></div></section>}
    </article>)}</div>
    {due.length > 0 && <section className={styles.dayEventList}><h4>My Work tasks</h4>{due.map(task => <Link className={styles.agendaEntry} key={task.id} href={`/team?workspace=${encodeURIComponent(workspaceId)}&module=work&task=${encodeURIComponent(task.id)}`}><span><strong>{task.title}</strong><small>{format(task.dueAt)} IST · {name(task.ownerId)} · {task.priority}</small></span><span>Open My Work →</span></Link>)}</section>}
    {!items.length && !due.length && <p className={styles.calendarEmpty}>Nothing scheduled for this day yet.</p>}
  </dialog>;
}
