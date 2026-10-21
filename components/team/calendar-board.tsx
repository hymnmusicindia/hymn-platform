"use client";
import { useMemo, useState } from "react";
import { CalendarTimeline } from "./calendar-timeline";
import type { CalendarView } from "@/lib/team/calendar-layout";
import Link from "next/link";
import styles from "./calendar.module.css";
export type CalendarTask = { id: string; title: string; dueAt: string; ownerId: string; priority: string; status: string };
type Event = { id: string; title: string; kind: string; assigneeId: string; startsAt: string; endsAt: string | null; status: string; client?: { name: string } | null };
type Member = { id: string; user: { name: string } };
const dayOf = (value: string) => new Date(Date.parse(value) + 330 * 60000).toISOString().slice(0, 10);
const time = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
const dayLabel = (day: string) => new Intl.DateTimeFormat("en-IN", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

export function TeamCalendarBoard({ dates, month, selected, events, tasks, members, actorId, workspaceId, canSchedule, onSelect, onCreate, onEdit, onOpenDay, onClientDrop, view, onViewChange, onCreateAt }: { view: CalendarView; onViewChange(view: CalendarView): void; onCreateAt(day: string, hour: number): void; dates: string[]; month: string; selected: string; events: Event[]; tasks: CalendarTask[]; members: Member[]; actorId: string; workspaceId: string; canSchedule: boolean; onSelect(day: string): void; onCreate(day: string): void; onEdit(eventId: string): void; onOpenDay(day: string): void; onClientDrop(day: string, clientId: string): void }) {
  const [kind, setKind] = useState("ALL"), [person, setPerson] = useState("ALL"), [query, setQuery] = useState(""), [closed, setClosed] = useState(false);
  const today = dayOf(new Date().toISOString());
  const entries = useMemo(() => [
    ...events.map(event => ({ id: event.id, title: event.title, kind: event.kind, ownerId: event.assigneeId, start: event.startsAt, end: event.endsAt, status: event.status, client: event.client?.name, task: false })),
    ...tasks.map(task => ({ id: task.id, title: task.title, kind: "TASK", ownerId: task.ownerId, start: task.dueAt, end: null, status: task.status, client: undefined, task: true })),
  ].filter(entry => (closed || !["COMPLETED", "CANCELLED"].includes(entry.status)) && (kind === "ALL" || entry.kind === kind) && (person === "ALL" || entry.ownerId === (person === "ME" ? actorId : person)) && `${entry.title} ${entry.client || ""}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)), [events, tasks, kind, person, query, closed, actorId]);
  const onDay = (entry: typeof entries[number], day: string) => {
    const start = Date.parse(`${day}T00:00:00+05:30`), end = start + 86400000;
    return Date.parse(entry.start) < end && (entry.end ? Date.parse(entry.end) > start : Date.parse(entry.start) >= start);
  };
  const taskHref = (id: string) => `/team?workspace=${encodeURIComponent(workspaceId)}&module=work&task=${encodeURIComponent(id)}`;
  const agendaDays = view === "agenda" ? Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${selected}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10)) : [selected];
  return <div className={styles.board}>
    <div className={styles.boardToolbar}>
      <div role="group" aria-label="Calendar view">{(["day", "week", "month", "agenda"] as CalendarView[]).map(mode => <button key={mode} aria-pressed={view === mode} onClick={() => onViewChange(mode)}>{mode === "agenda" ? "Schedule" : mode[0].toUpperCase() + mode.slice(1)}</button>)}</div>
      <label>Show<select aria-label="Filter calendar type" value={kind} onChange={e => setKind(e.target.value)}>{["ALL", "CALL", "TASK", "MEETING", "EMAIL", "FOLLOW_UP", "EVENT"].map(value => <option key={value} value={value}>{value === "ALL" ? "All activity" : value.replaceAll("_", " ")}</option>)}</select></label>
      <label>Teammate<select aria-label="Filter calendar teammate" value={person} onChange={e => setPerson(e.target.value)}><option value="ALL">All authorised activity</option><option value="ME">Assigned to me</option>{members.filter(member => member.id === actorId || entries.some(entry => entry.ownerId === member.id)).map(member => <option key={member.id} value={member.id}>{member.user.name}</option>)}</select></label>
      <input aria-label="Search schedule" type="search" placeholder="Search tasks, calls, clients…" value={query} onChange={e => setQuery(e.target.value)}/>
      <label className={styles.inlineCheck}><input type="checkbox" checked={closed} onChange={e => setClosed(e.target.checked)}/>Include closed events</label>
    </div>
    <div className={styles.calendarSummary} role="status"><span>{entries.filter(e => !e.task).length} events</span><span>{entries.filter(e => e.task).length} active tasks</span><span>IST · AM/PM</span></div>
    {view === "month" && <div className={styles.boardGrid}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <strong key={day}>{day}</strong>)}{dates.map(day => {
      const items = entries.filter(entry => onDay(entry, day));
      return <div key={day} className={styles.dayCell} data-muted={!day.startsWith(month)} data-selected={day === selected} data-today={day === today} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); onClientDrop(day, event.dataTransfer.getData("application/hymn-client")); }}>
        <button className={styles.daySurface} aria-label={`View schedule for ${day}`} aria-pressed={day === selected} onClick={() => { onSelect(day); onOpenDay(day); }}><span>{Number(day.slice(-2))}</span>{canSchedule && <span className={styles.dayAdd}>+</span>}</button>
        <div className={styles.dayEntries}>{items.slice(0, 3).map(entry => entry.task ? <Link key={`task:${entry.id}`} href={taskHref(entry.id)} className={styles.entryChip} data-kind="TASK" title={`${entry.title} · ${time(entry.start)} · Open My Work`}>{time(entry.start)} {entry.title}</Link> : <button key={`event:${entry.id}`} className={styles.entryChip} data-kind={entry.kind} title={`${entry.title} · ${time(entry.start)}`} onClick={() => { onSelect(day); onEdit(entry.id); }}>{time(entry.start)} {entry.title}</button>)}{items.length > 3 && <button className={styles.moreEntries} onClick={() => { onSelect(day); onOpenDay(day); }}>+{items.length - 3} more</button>}</div>
      </div>;
    })}</div>}
    {(view === "week" || view === "day") && <CalendarTimeline selected={selected} single={view === "day"} entries={entries} workspaceId={workspaceId} canSchedule={canSchedule} onCreate={onCreateAt} onEdit={onEdit}/>}
    {(view === "month" || view === "agenda") && <section className={styles.agenda}><header className={styles.boardAgendaHeader}><h3>{dayLabel(selected)}</h3><label>Go to day<input aria-label="Agenda date" type="date" value={selected} onChange={e => { if (e.target.value) onSelect(e.target.value); }}/></label>{canSchedule && <button onClick={() => onCreate(selected)}>+ Schedule</button>}</header>
      {agendaDays.map(day => <div className={styles.scheduleDay} key={day}><h4>{dayLabel(day)}</h4>{entries.filter(entry => onDay(entry, day)).map(entry => { const content = <><span><strong>{entry.title}</strong><small>{time(entry.start)}{entry.end ? ` – ${time(entry.end)}` : ""} · {entry.kind.replaceAll("_", " ")} · {entry.status.replaceAll("_", " ")}</small><small>{members.find(member => member.id === entry.ownerId)?.user.name || "Teammate"}{entry.client ? ` · ${entry.client}` : ""}</small></span><span>{entry.task ? "Open My Work →" : "View / edit →"}</span></>; return entry.task ? <Link className={styles.agendaEntry} key={`task:${entry.id}`} href={taskHref(entry.id)}>{content}</Link> : <button className={styles.agendaEntry} key={`event:${entry.id}`} onClick={() => onEdit(entry.id)}>{content}</button>; })}
      {!entries.some(entry => onDay(entry, day)) && <p className={styles.calendarEmpty}>No activity scheduled.</p>}</div>)}
    </section>}
  </div>;
}
