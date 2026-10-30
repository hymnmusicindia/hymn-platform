"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import styles from './call-report.module.css';

type Api = <T>(resource: string, body?: unknown) => Promise<T>;
type Report = { id: string; createdAt: string; occurredAt: string; authorName: string; source: string; outcome: string; discussion: string; needs: string; commitments: string; nextAction: string; nextAt?: string; amendsReportId?: string };
type Result = { items: Report[]; total: number; canWrite: boolean; contact: { name: string; phone: string; email: string } };
const date = (value: string) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
const localNow = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16);
const outcomeLabels: Record<string, string> = { TALKED: 'Talked with customer', NO_ANSWER: 'No answer', CALLBACK: 'Customer requested a callback', INTERESTED: 'Interested', RESOLVED: 'Help completed', NOT_INTERESTED: 'Not interested', DO_NOT_CONTACT: 'Do not contact again' };

export function CallReport({ api, clientId, name, task, onSaved }: { api: Api; clientId: string; name: string; task?: { id: string; version: number }; onSaved?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), key = useRef(''), lastPayload = useRef('');
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false), [data, setData] = useState<Result | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [notice, setNotice] = useState(''), [amends, setAmends] = useState('');
  const [outcome, setOutcome] = useState('TALKED'), [recordTask, setRecordTask] = useState(Boolean(task));
  async function load(offset = 0) {
    setLoading(true); setError('');
    try { const result = await api<Result>(`call-reports?clientId=${encodeURIComponent(clientId)}&offset=${offset}`); setData(previous => offset && previous ? { ...result, items: [...previous.items, ...result.items] } : result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load reports.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (open) { dialog.current?.showModal(); void load(); } else dialog.current?.close(); }, [open]); // Opening always refreshes shared history.
  function close() { if (!busy && (!dirty || window.confirm('Discard this unsaved report?'))) { dialog.current?.querySelector('form')?.reset(); setDirty(false); setAmends(''); setOutcome('TALKED'); setOpen(false); if (notice) onSaved?.(); } }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, fields = new FormData(form);
    const text = (name: string) => String(fields.get(name) || '');
    setBusy(true); setError('');
    try {
      const payload = { clientId, occurredAt: new Date(`${text('occurredAt')}+05:30`).toISOString(), source: text('source'), outcome, discussion: text('discussion'), needs: text('needs'), commitments: text('commitments'), nextAction: text('nextAction'), ...(text('nextAt') ? { nextAt: new Date(`${text('nextAt')}+05:30`).toISOString() } : {}), ...(task && recordTask && !amends ? { taskId: task.id, taskVersion: task.version } : {}), ...(amends ? { amendsReportId: amends } : {}) };
      const serialized = JSON.stringify(payload);
      if (lastPayload.current && lastPayload.current !== serialized) key.current = crypto.randomUUID();
      lastPayload.current = serialized;
      await api('call-report-save', { ...payload, requestKey: key.current });
      key.current = crypto.randomUUID(); lastPayload.current = ''; setDirty(false); form.reset(); setAmends(''); setRecordTask(false); setOutcome('TALKED'); setNotice('Report saved to the contact history.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your report is still here.'); }
    finally { setBusy(false); }
  }
  return <><button type="button" data-team-guide="call-report-open" onClick={() => { key.current = crypto.randomUUID(); setNotice(''); setOpen(true); }}>Call report &amp; history</button>
    <dialog ref={dialog} className={styles.sheet} aria-label={`Call reports for ${name}`} onCancel={event => { event.preventDefault(); close(); }}>
      <header><div><small>CONTACT REPORT SHEET</small><h2>{name}</h2><p>{data?.contact.phone} {data?.contact.email}</p></div><button type="button" disabled={busy} onClick={close}>Close</button></header>
      <p>Start calls and client work in Work-station. Saved activity reports appear here for the whole team. Private contact notes stay private.</p>
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {error && <p role="alert" className={styles.error}>{error} <button type="button" disabled={loading || busy} onClick={() => void load()}>Refresh history</button></p>}
      {data?.canWrite && <p><a href={`/team?workspace=${new URLSearchParams(typeof window!=='undefined'?window.location.search:'').get('workspace')||''}&module=work-station&client=${encodeURIComponent(clientId)}`}>Start activity in Work-station ?</a></p>}
      {data?.canWrite && amends && <form onSubmit={save} onChange={() => setDirty(true)}><fieldset disabled={busy}><legend>{amends ? 'Add an update to the selected report' : 'Write a call report'}</legend>
        {amends && <p>The original report will remain unchanged. <button type="button" onClick={() => setAmends('')}>Cancel update</button></p>}
        <div className={styles.grid}><label data-team-guide="call-report-time">Actual call date &amp; time (IST)<input name="occurredAt" type="datetime-local" required defaultValue={localNow()}/></label><label>Called using<select name="source"><option value="PERSONAL_PHONE">Personal phone</option><option value="BUSINESS_PHONE">Work phone</option><option value="OTHER">Other</option></select></label><label>What happened?<select value={outcome} onChange={event => setOutcome(event.target.value)}>{['TALKED', 'NO_ANSWER', 'CALLBACK', 'INTERESTED', 'RESOLVED', 'NOT_INTERESTED', ...(task && recordTask && !amends ? ['DO_NOT_CONTACT'] : [])].map(value => <option key={value} value={value}>{outcomeLabels[value]}</option>)}</select></label><label>Next callback (IST, if agreed)<input name="nextAt" type="datetime-local" required={outcome === 'CALLBACK'}/></label></div>
        <label data-team-guide="call-report-discussion">Conversation report<textarea name="discussion" rows={5} minLength={10} maxLength={2000} required placeholder="What did you discuss? Include the customer's questions, your answers and the outcome."/></label>
        <div className={styles.grid}><label>Customer needs<textarea name="needs" rows={3} maxLength={2000} placeholder="Services, budget, preferences or concerns"/></label><label>Agreements &amp; promises<textarea name="commitments" rows={3} maxLength={2000} placeholder="What did each person agree to do?"/></label></div>
        <label>Next action &amp; responsible person<textarea name="nextAction" rows={2} maxLength={2000} placeholder="Who will do what next?"/></label>
        {task && !amends && !notice && <label className={styles.check}><input type="checkbox" checked={recordTask} onChange={event => { setRecordTask(event.target.checked); setOutcome('TALKED'); }}/>Also record this outcome on the assigned callback (updates its status and schedule).</label>}
        <p className={styles.help}>{!recordTask || amends ? 'This saves a contact report only; it does not schedule or complete a callback.' : 'Existing callback ownership, availability and do-not-contact safeguards apply.'} Saving this sheet does not send a customer follow-up email.</p>
        <button data-team-guide="call-report-save" type="submit" disabled={busy}>{busy ? 'Saving report...' : 'Save report to contact'}</button>
      </fieldset></form>}
      <section data-team-guide="call-report-history" className={styles.history}><header><div><h3>Contact report history</h3><small>Latest saved first · actual call time shown on every report</small></div><button type="button" disabled={loading || busy} onClick={() => void load()}>Refresh</button></header>
        {loading && <p role="status">Loading reports...</p>}{data && !data.total && <p>No reports yet. Save the first conversation above.</p>}
        {data?.items.map(report => <article key={report.id}><header><strong>{date(report.occurredAt)}</strong><span>{outcomeLabels[report.outcome] || report.outcome.replaceAll('_', ' ')}</span></header><small>{report.authorName} · {report.source.replaceAll('_', ' ').toLowerCase()} · saved {date(report.createdAt)}</small>{report.amendsReportId && <p>Update to an earlier report (original retained).</p>}<p className={styles.text}>{report.discussion}</p>{[['Customer needs', report.needs], ['Agreements', report.commitments], ['Next action', report.nextAction]].filter(([, value]) => value).map(([title, value]) => <p className={styles.text} key={title}><strong>{title}</strong><br/>{value}</p>)}{report.nextAt && <p>Requested follow-up: {date(report.nextAt)}</p>}{data.canWrite && report.source!=="WORK_STATION" && <button type="button" disabled={busy} onClick={() => { setAmends(report.id); setRecordTask(false); setTimeout(()=>dialog.current?.querySelector('form')?.scrollIntoView({ block: 'start', behavior: 'smooth' }),0); }}>Add update</button>}</article>)}
        {data && data.items.length < data.total && <button type="button" disabled={loading} onClick={() => void load(data.items.length)}>Load earlier reports</button>}
      </section>
    </dialog></>;
}
