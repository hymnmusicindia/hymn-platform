"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { personalTeamMessage } from '@/lib/team/outreach-content';
import styles from './calendar.module.css';
type Api = <T>(resource: string, body?: unknown) => Promise<T>;
type Options = { clients: { id: string; name: string; email: string }[]; templates: { id: string; name: string; subject: string; body: string }[]; sender: { name: string; role: string }; configured: boolean; canReview: boolean };
type Email = { id: string; recipient: string; subject: string; status: string; error: string | null; senderName: string; senderRole: string; createdAt: string };
export function TeamEmailWorkspace({ api, initialClient = '' }: { api: Api; initialClient?: string }) {
  const [options, setOptions] = useState<Options | null>(null), [history, setHistory] = useState<Email[]>([]), [query, setQuery] = useState('');
  const [clientId, setClientId] = useState(initialClient), [templateId, setTemplateId] = useState(''), [subject, setSubject] = useState(''), [body, setBody] = useState('');
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const request = useRef<{ fingerprint: string; key: string } | null>(null), sending = useRef(false);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => { void api<Options>(`team-email-options?${query ? `q=${encodeURIComponent(query)}` : initialClient ? `clientId=${encodeURIComponent(initialClient)}` : ''}`).then(value => { if (live) { setOptions(value); setError(''); } }).catch(error => { if (live) setError(error.message); }); }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [api, query, initialClient]);
  useEffect(() => { let live = true; const load = () => void api<{ items: Email[] }>('team-email-history').then(value => { if (live) setHistory(value.items); }).catch(error => { if (live) setError(error.message); }); load(); const timer = setInterval(() => { if (!document.hidden) load(); }, 10000); return () => { live = false; clearInterval(timer); }; }, [api]);
  const client = options?.clients.find(client => client.id === clientId);
  async function send(event: FormEvent) {
    event.preventDefault(); if (sending.current || !reviewed || !client) return;
    const fingerprint = JSON.stringify({ clientId, templateId, subject, body });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    sending.current = true; setBusy(true); setError(''); setMessage('');
    try { const email = await api<Email>('team-email-send', { clientId, template: templateId, subject, body, requestKey: request.current!.key, reviewed: true }); setHistory(old => [email, ...old.filter(row => row.id !== email.id)]); setMessage(`Message saved as ${email.status.toLowerCase()} for ${email.recipient}. Check history for the final sending status.`); setReviewed(false); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not save your email. Your draft is still here.'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <section className={styles.root}><header className={styles.header}><div><h2>Team email</h2><p>Send a reviewed, individual email from your HYMN identity. Available to every active team role.</p></div></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status">{message}</p>}
    {options ? <><p><strong>{options.sender.name}</strong> &middot; {options.sender.role} &middot; HYMN Music</p>{!options.configured && <p role="status">Sending is not configured yet. Queued messages will wait for the verified HYMN sender.</p>}
    <form onSubmit={send}><fieldset disabled={busy} style={{ display: "grid", gap: 16, minWidth: 0 }}><legend className="sr-only">Compose a team email</legend><label>Find a shared contact<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or email"/></label><label>Recipient<select aria-label="Recipient" value={clientId} required onChange={event => { setClientId(event.target.value); setReviewed(false); }}><option value="">Choose a contact</option>{options.clients.map(client => <option key={client.id} value={client.id}>{client.name} - {client.email}</option>)}</select></label>
    <label>Template<select aria-label="Template" value={templateId} required onChange={event => { const template = options.templates.find(template => template.id === event.target.value); setTemplateId(event.target.value); setSubject(template?.subject || ''); setBody(template?.body || ''); setReviewed(false); }}><option value="">Choose a template</option>{options.templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
    <label>Subject<input value={subject} onChange={event => { setSubject(event.target.value); setReviewed(false); }} maxLength={200} required/></label><label>Message<textarea value={body} onChange={event => { setBody(event.target.value); setReviewed(false); }} minLength={10} maxLength={8000} rows={8} required/></label>
    {client && <article className={styles.contactCard}><h3>Customer preview</h3><p>From {options.sender.name} | HYMN</p><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{personalTeamMessage({ recipientName: client.name, senderName: options.sender.name, senderRole: options.sender.role, body })}</div><small>Your verified sender identity, role and email opt-out link are added by HYMN.</small></article>}
    <label><input type="checkbox" style={{ width: 16, height: 16 }} checked={reviewed} onChange={event => setReviewed(event.target.checked)} required/>I checked the recipient and message, and this outreach is relevant to them.</label><button disabled={busy || !client || !reviewed}>{busy ? 'Saving...' : 'Send individual email'}</button></fieldset></form>
    <h3>Sending history</h3>{history.map(email => <article key={email.id} className={styles.contactCard}><strong>{email.status} - {email.recipient}</strong><p>{email.subject}</p><small>{email.senderName} &middot; {email.senderRole} &middot; {new Date(email.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</small>{email.error && <p role="status">{email.error}</p>}{options.canReview && email.status === 'REVIEW' && <form onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { const updated = await api<Email>('team-email-retry', { id: email.id, reason: form.get('reason'), confirmedNotSent: form.has('confirmed') }); setHistory(rows => rows.map(row => row.id === updated.id ? updated : row)); setMessage('Reviewed retry queued.'); } catch (error) { setError(error instanceof Error ? error.message : 'Retry unavailable.'); } }}><label>Delivery review note<input name="reason" minLength={10} maxLength={1000} required placeholder="Provider evidence that this message was not sent"/></label><label><input type="checkbox" name="confirmed" style={{ width: 16 }} required/>I checked delivery logs and confirmed the customer did not receive this email.</label><button>Queue reviewed retry</button></form>}</article>)}{!history.length && <p>No team outreach emails yet.</p>}</> : <p role="status">Loading templates and contacts...</p>}
  </section>;
}
