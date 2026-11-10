"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./meeting-scheduler.module.css";

type Api = <T>(resource: string, body?: unknown) => Promise<T>;
type Meeting = { id: string; title: string; startsAt: string; endsAt: string | null; status: string; version: number; meetingAttendees: string[]; googleSyncStatus: string; googleSyncError: string | null; googleMeetUrl: string | null; googleCalendarUrl: string | null };
const pending = new Set(["PENDING", "WAITING_CONNECTION", "RETRY"]);
const syncLabels: Record<string, string> = { WAITING_CONNECTION: "Saved · connect Google Calendar to send invitations", PENDING: "Saved · preparing invitations", RETRY: "Saved · Google synchronization will retry", ERROR: "Saved · synchronization needs attention", SYNCED: "Created in Google Calendar" };
const dateLabel = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const statusLabel = (meeting: Meeting) => meeting.status === "CANCELLED"
  ? meeting.googleSyncStatus === "CANCELLED" ? "Cancelled in Google Calendar" : "Cancelled in HYMN · Google cancellation pending"
  : (syncLabels[meeting.googleSyncStatus] || meeting.googleSyncStatus.replaceAll("_", " "));

export function MeetingScheduler({ api }: { api: Api }) {
  const [items, setItems] = useState<Meeting[]>([]), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("HYMN meeting"), [guests, setGuests] = useState(""), [date, setDate] = useState(() => new Date(Date.now() + (330 + 1440) * 60000).toISOString().slice(0, 10)), [time, setTime] = useState("16:00"), [duration, setDuration] = useState("30"), [description, setDescription] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const load = useCallback(async () => { const result = await api<{ items: Meeting[] }>("meeting-requests"); setItems(result.items); }, [api]);
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : "Meetings could not load.")); }, [load]);
  const hasPending = items.some(item => pending.has(item.googleSyncStatus));
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => { void load().catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [hasPending, load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const start = new Date(`${date}T${time}:00+05:30`);
      if (!Number.isFinite(start.getTime()) || start <= new Date()) throw new Error("Choose a future date and time in IST.");
      const attendees = [...new Set(guests.split(/[,;\s]+/).map(value => value.trim().toLowerCase()).filter(Boolean))].sort();
      const body = { title: title.trim(), attendees, startsAt: start.toISOString(), durationMinutes: Number(duration), description: description.trim() };
      const fingerprint = JSON.stringify(body);
      if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
      const saved = await api<Meeting>("meeting-create", { ...body, requestKey: request.current!.key });
      setNotice(statusLabel(saved));
      setItems(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The meeting could not be saved. Retry with the same details to avoid duplicates."); }
    finally { setBusy(false); }
  }
  async function change(item: Meeting, cancel: boolean) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(cancel ? "meeting-cancel" : "calendar-google-retry", { id: item.id, version: item.version });
      setNotice(cancel ? "Meeting cancelled in HYMN. Google Calendar will synchronize the cancellation." : "Synchronization queued.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Meeting update failed."); }
    finally { setBusy(false); }
  }
  return <section className={styles.root} aria-labelledby="meeting-scheduler-title">
    <header><div><h3 id="meeting-scheduler-title">Schedule a Google meeting</h3><p>Times are in IST. Connect the hosting Google account once above; HYMN then creates invitations and a Google Meet link automatically.</p></div><button type="button" disabled={busy} onClick={() => void load().catch(() => setError("Meetings could not refresh."))}>Refresh meetings</button></header>
    <form onSubmit={save}><fieldset disabled={busy}>
      <label>Meeting title<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)}/></label>
      <label>Guest emails<textarea required rows={2} value={guests} onChange={event => setGuests(event.target.value)} placeholder="person@example.com, teammate@example.com" maxLength={6500}/><small>Separate up to 20 email addresses with commas. Guests receive invitations and can accept or decline.</small></label>
      <div className={styles.times}><label>Date (IST)<input required type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label>Time (IST)<input required type="time" value={time} onChange={event => setTime(event.target.value)}/></label><label>Duration<select value={duration} onChange={event => setDuration(event.target.value)}>{[15,30,45,60,90,120,180,240].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label></div>
      <label>Invitation message (shared with guests)<textarea rows={3} maxLength={5000} value={description} onChange={event => setDescription(event.target.value)}/></label>
      <button type="submit">{busy ? "Saving…" : "Schedule meeting"}</button>
    </fieldset></form>
    {error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    <h4>Meeting requests</h4>{!items.length ? <p>No meeting requests yet. A saved request waits here until Google Calendar is connected.</p> : null}
    {items.map(item => <article key={item.id} className={styles.meeting}><div><strong>{item.title}</strong><p>{dateLabel(item.startsAt)} IST{item.endsAt ? ` · ${Math.round((Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000)} minutes` : ""}</p><p>{item.meetingAttendees.join(", ")}</p><p>{statusLabel(item)}</p>{item.googleSyncError ? <p role="alert">{item.googleSyncError}</p> : null}</div><div className={styles.actions}>
      {item.status === "SCHEDULED" && item.googleMeetUrl ? <a href={item.googleMeetUrl} target="_blank" rel="noopener noreferrer">Join Google Meet</a> : null}
      {item.googleCalendarUrl ? <a href={item.googleCalendarUrl} target="_blank" rel="noopener noreferrer">Open Google Calendar</a> : null}
      {["ERROR", "RETRY"].includes(item.googleSyncStatus) ? <button disabled={busy} onClick={() => void change(item, false)}>Retry meeting sync</button> : null}
      {item.status === "SCHEDULED" ? <button disabled={busy} onClick={() => void change(item, true)}>Cancel meeting</button> : null}
    </div></article>)}
  </section>;
}
