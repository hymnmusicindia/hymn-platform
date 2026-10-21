"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { calendarDay, timedLayout, weekDays } from '@/lib/team/calendar-layout';
import styles from './calendar.module.css';
type Entry = { id: string; title: string; start: string; end: string | null; task: boolean; kind: string; ownerId: string };
export function CalendarTimeline({ selected, single, entries, workspaceId, canSchedule, onCreate, onEdit }: { selected: string; single: boolean; entries: Entry[]; workspaceId: string; canSchedule: boolean; onCreate(day: string, hour: number): void; onEdit(id: string): void }) {
  const dates = weekDays(selected, single);
  const viewport = useRef<HTMLElement>(null);
  useEffect(() => { if (viewport.current) viewport.current.scrollTop = 8 * 56; }, [selected, single]);
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => { const update = () => setClock(new Date()); update(); const timer = setInterval(update, 60000); return () => clearInterval(timer); }, []);
  const dateLabel = (day: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  const time = (value: string) => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return <section ref={viewport} className={styles.timeline} aria-label={single ? 'Day schedule' : 'Week schedule'}><div className={styles.timelineInner} style={{ minWidth: single ? 260 : 680 }}><header className={styles.timelineHeader} style={{ gridTemplateColumns: `54px repeat(${dates.length}, minmax(0, 1fr))` }}><span>IST</span>{dates.map(day => <strong key={day} data-today={clock ? calendarDay(clock) === day : false}>{dateLabel(day)}</strong>)}</header><div className={styles.timelineBody} style={{ gridTemplateColumns: `54px repeat(${dates.length}, minmax(0, 1fr))` }}><div className={styles.timeGutter}>{Array.from({ length: 24 }, (_, hour) => <span key={hour} style={{ top: hour * 56 }}>{hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}</span>)}</div>{dates.map(day => <div className={styles.timeColumn} key={day}>{Array.from({ length: 24 }, (_, hour) => <button key={hour} type="button" className={styles.timeSlot} disabled={!canSchedule} style={{ top: hour * 56 }} aria-label={`Schedule ${day} at ${hour}:00 IST`} onClick={() => onCreate(day, hour)}/>)}{timedLayout(entries, day).map(({ entry, top, height, column, columns }) => {
    const style = { top, height: Math.max(26, height - 2), left: `calc(${column / columns * 100}% + 2px)`, width: `calc(${100 / columns}% - 4px)` };
    const content = <><strong>{entry.title}</strong><small>{time(entry.start)}{entry.end ? ` – ${time(entry.end)}` : ''}</small></>;
    return entry.task ? <Link key={`task:${entry.id}`} className={styles.timedEntry} data-kind="TASK" style={style} href={`/team?workspace=${encodeURIComponent(workspaceId)}&module=work&task=${encodeURIComponent(entry.id)}`} title={`${entry.title}, ${time(entry.start)}`}>{content}</Link> : <button type="button" key={`event:${entry.id}`} className={styles.timedEntry} data-kind={entry.kind} style={style} onClick={() => onEdit(entry.id)} title={`${entry.title}, ${time(entry.start)}`}>{content}</button>;
  })}{clock && calendarDay(clock) === day ? <div className={styles.nowLine} aria-label="Current time" style={{ top: ((clock.getUTCHours() * 60 + clock.getUTCMinutes() + 330) % 1440) / 60 * 56 }}/>:null}</div>)}</div></div></section>;
}
