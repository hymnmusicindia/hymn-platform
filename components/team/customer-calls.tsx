"use client";
import { useEffect, useRef, useState, useId, type FormEvent } from 'react';
import Link from 'next/link';
import { CallReport } from './call-report';
import { whatsappLink, whatsappNumber } from '@/lib/team/phone';
import { callbackSuggestions } from '@/lib/team/call-rules';
import { Phone, MessageCircle, Mail, CalendarClock, ChevronDown, StickyNote, ExternalLink, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import styles from './calendar.module.css';
import cards from './customer-calls.module.css';
type Row = { id: string; version: number; status: string; title: string; description: string; dueAt: string | null; priority: string; ownerId: string; followUpContext: { kind?: string; service?: string; tip?: string; outcome?: string; attempts?: number; occurredAt?: string; footnotes?: string[] } | null; client: { id: string; name: string; phone: string; email: string; status: string; registered?: boolean; coverUrl?: string | null; avatarUrl?: string | null } | null };
type Api = <T>(resource: string, body?: unknown) => Promise<T>;
function CallbackEditor({ task, api, saved }: { task: Row; api: Api; saved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, fields = new FormData(form), next = String(fields.get('nextAt') || '');
    setBusy(true); setError(''); setMessage('');
    try {
      await api('call-followup-update', { id: task.id, version: task.version, notes: fields.get('notes'), ...(next ? { nextAt: new Date(`${next}+05:30`).toISOString() } : {}) });
      form.reset(); setMessage(next ? 'Note and schedule saved.' : 'Note saved.'); saved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your input is still here.'); }
    finally { setBusy(false); }
  }
  return <details className={cards.drawer}><summary><StickyNote size={16}/>Add a footnote / reschedule<ChevronDown size={16}/></summary><form onSubmit={submit}><fieldset disabled={busy} className={styles.callbackFields}><legend>Notes & planning</legend><p>Save context here without logging a call attempt. Notes stay with this task and its history.</p><label>New footnote<textarea name="notes" rows={4} maxLength={2000} placeholder="Preferences, corrected details, or what the next rep should know"/></label>{task.status !== 'BLOCKED' && <label>Reschedule to (IST, optional)<input name="nextAt" type="datetime-local"/><small>Choose a future slot, 9:30 AMÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“6 PM IST. Leave blank to keep the current time.</small></label>}<button disabled={busy}>{busy ? 'SavingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦' : 'Save note / schedule'}</button></fieldset>{error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status">{message}</p>}</form></details>;
}
function ProfileImage({ src, className, alt }: { src: string; className: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  // Remote account imagery can have arbitrary hosts; retain native lazy loading and fallbacks.
  // eslint-disable-next-line @next/next/no-img-element
  return failed ? null : <img src={src} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>;
}
function CallbackCard({ task, api, workspaceId, saved, refresh }: { task: Row; api: Api; workspaceId: string; saved: (message: string) => void; refresh: () => void }) {
  const [collapsed, setCollapsed] = useState(false), bodyId = useId();
  const client = task.client, context = task.followUpContext;
  const active = task.status !== 'BLOCKED' && client?.status === 'ACTIVE';
  const phone = whatsappNumber(client?.phone), whatsapp = whatsappLink(client?.phone, true);
  const href = `/team?workspace=${encodeURIComponent(workspaceId)}`;
  const initials = (client?.name || '?').split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase();
  const cover = client?.coverUrl || client?.avatarUrl;
  const kind = context?.kind;
  const reason = kind === 'FRIENDLY_INTRO' ? 'Friendly introduction' : kind === 'SUPPORT_CALLBACK' ? 'Support callback' : kind === 'DRAFT_INACTIVE' ? 'Release draft assistance' : kind === 'ENQUIRY' ? 'Customer enquiry' : 'Service interest';
  return <article className={cards.card} data-collapsed={collapsed} aria-label={`Callback for ${client?.name || 'unavailable contact'}`}>
    <div className={cards.cover}>{cover && <ProfileImage key={cover} src={cover} alt="" className={cards.coverImage}/>}<div className={cards.coverShade}/><span className={cards.reason}>{reason}</span><span className={cards.priority} data-priority={task.priority}>{task.priority === 'HIGH' || task.priority === 'URGENT' ? 'Priority' : task.priority === 'LOW' ? 'Low priority' : 'Routine'}</span></div>
    <div className={cards.identity}><div className={cards.avatar}><span>{initials}</span>{client?.avatarUrl && <ProfileImage key={client.avatarUrl} src={client.avatarUrl} alt="" className={cards.avatarImage}/>}</div><div><h3>{client?.name || 'Contact unavailable'}</h3><small>{client?.registered ? <><ShieldCheck size={12}/>HYMN account</> : <><UserRound size={12}/>Saved contact</>}</small></div><button type="button" className={cards.collapseButton} aria-label={`${collapsed ? 'Expand' : 'Collapse'} card for ${client?.name || 'contact'}`} aria-expanded={!collapsed} aria-controls={bodyId} onClick={() => setCollapsed(value => !value)}><ChevronDown size={18}/></button></div>
    <div id={bodyId} className={cards.body} hidden={collapsed}>
      <div className={cards.schedule}><CalendarClock size={17}/><span>{task.dueAt ? new Date(task.dueAt).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', day:'numeric', month:'short', hour:'numeric', minute:'2-digit' }) + ' IST' : 'Time not scheduled'}</span><span>{context?.attempts || 0} calls</span></div>
      <div className={cards.contactLines}><span><Phone size={14}/>{client?.phone || 'No phone saved'}</span><span><Mail size={14}/>{client?.email || 'No email saved'}</span></div>
      {task.status === 'BLOCKED' && <p className={cards.review} role="status">Manager review needed before another call.</p>}
      <div className={cards.suggestions}><strong>Suggested approach</strong><ul>{callbackSuggestions(context, !client?.email, task.status === 'BLOCKED').map(bullet => <li key={bullet}>{bullet}</li>)}</ul></div>
      <div className={cards.actions}>{active && phone && <a href={`tel:+${phone}`} className={cards.callButton}><Phone size={16}/>Call now</a>}{active && whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cards.whatsappButton}><MessageCircle size={16}/>WhatsApp</a>}{client && <CallReport api={api} clientId={client.id} name={client.name} task={task.status !== 'BLOCKED' ? {id:task.id,version:task.version}:undefined} onSaved={()=>{saved('Call report saved to the contact history.');refresh();}}/>}</div>
      <details className={cards.expander}><summary>Call details & notes<ChevronDown size={17}/></summary><div className={cards.expanded}>
        {context?.service && <p className={cards.service}>Interest: {context.service}</p>}
        <details className={cards.drawer}><summary><StickyNote size={16}/>Customer context & footnotes<ChevronDown size={16}/></summary><ul className={cards.footnotes}>{context?.footnotes?.length ? context.footnotes.map((note,index) => <li key={index}>{note}</li>) : <li>No footnotes yet. Add useful context below.</li>}</ul></details>
        <CallbackEditor task={task} api={api} saved={refresh}/>

        <nav className={cards.secondaryActions} aria-label="Contact tools">{client && <Link href={`${href}&module=contacts&client=${encodeURIComponent(client.id)}`}><UserRound size={14}/>Edit contact</Link>}{client?.email && <Link href={`${href}&module=emails&client=${encodeURIComponent(client.id)}`}><Mail size={14}/>Email</Link>}<Link href={`${href}&module=calendar`}><CalendarClock size={14}/>Calendar</Link><Link href={`${href}&module=work&task=${encodeURIComponent(task.id)}`}><ExternalLink size={14}/>History</Link></nav>
      </div></details>
    </div>
  </article>;
}
export function CustomerCalls({ api, workspaceId }: { api: Api; workspaceId: string }) {
  const [query, setQuery] = useState(''), [notice, setNotice] = useState('');
  const [items, setItems] = useState<Row[]>([]), [total, setTotal] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => { let live = true; const load = () => void api<{ items: Row[]; total: number }>('call-followups').then(data => { if (live) { setItems(data.items); setTotal(data.total); setError(''); } }).catch(error => { if (live) setError(error.message || 'Call queue unavailable.'); }).finally(() => { if (live) setLoading(false); }); load(); const timer = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => { live = false; clearInterval(timer); }; }, [api, revision]);
  const visible = items.filter(task => `${task.client?.name || ''} ${task.client?.phone || ''} ${task.client?.email || ''} ${task.title}`.toLowerCase().includes(query.toLowerCase()));
  return <section className={`${styles.root} ${cards.root}`}>
    <header className={styles.header}><div><h2>Customer callbacks</h2><p>Your contacts, call briefs and next steps in one place.</p></div><button onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/>Refresh queue</button></header>
    {notice && <p role="status" className={cards.notice}>{notice}</p>}{loading && <p role="status">Loading callbacks...</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={cards.toolbar}><label>Find a callback<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, phone or email"/></label><span>{query ? `${visible.length} matching` : `${items.length} of ${total}`} callbacks<small>All times in IST / Internal call slots</small></span></div>
    <div className={cards.grid}>{visible.map(task => <CallbackCard key={task.id} task={task} api={api} workspaceId={workspaceId} refresh={() => setRevision(value => value + 1)} saved={message => { setNotice(message); setRevision(value => value + 1); }}/>)}</div>
    {!loading && !visible.length && <p className={cards.empty}>{query ? 'No matching callbacks. Try another name, phone or email.' : 'No open callbacks assigned to you.'}</p>}
    {items.length < total && <button onClick={async () => { try { const more = await api<{ items: Row[] }>(`call-followups?offset=${items.length}`); setItems(previous => [...previous, ...more.items]); } catch { setError('Could not load more callbacks.'); } }}>Load more callbacks</button>}
  </section>;
}
