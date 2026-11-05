"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Mail, RefreshCw } from 'lucide-react';
import styles from './email-auth-form.module.css';

export function EmailAuthForm({ signup = false, initialName = "", returnTo, onAuthenticated, dark = false }: { signup?: boolean; initialName?: string; returnTo?: string; onAuthenticated?: () => Promise<void> | void; dark?: boolean }) {
  const id = useId(), locked = useRef(false), controller = useRef<AbortController | null>(null);
  const [email, setEmail] = useState(''), [name, setName] = useState(initialName), [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [resendAt, setResendAt] = useState(0), [seconds, setSeconds] = useState(0);
  useEffect(() => { const tick = () => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))); tick(); const timer = window.setInterval(tick, 1000); return () => clearInterval(timer); }, [resendAt]);
  useEffect(() => () => controller.current?.abort(), []);
  async function request(action: 'request' | 'verify') {
    if (locked.current) return; locked.current = true; setBusy(true); setError(''); setMessage('');
    const abort = new AbortController(); controller.current = abort;
    const timer = window.setTimeout(() => abort.abort(), 30000);
    try {
      const response = await fetch('/api/auth/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify(action === 'request' ? { action, email, name } : { action, email, challenge, code, ...(returnTo ? { returnTo } : {}) }) });
      const data = await response.json();
      if (!response.ok) { const wait = Number(response.headers.get('Retry-After')); if (wait > 0) setResendAt(Date.now() + wait * 1000); throw Error(data.error || 'Sign-in could not finish. Please try again.'); }
      if (action === 'request') { setChallenge(data.challenge); setCode(''); setResendAt(Date.now() + data.resendAfter * 1000); setMessage(data.message); }
      else {
        const destination = typeof data.redirectPath === 'string' && data.redirectPath.startsWith('/') && !data.redirectPath.startsWith('//') ? data.redirectPath : '/';
        if (onAuthenticated) { try { await onAuthenticated(); } catch { window.location.assign(destination); } }
        else window.location.assign(destination);
      }
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Please try again.'); else setError('The request timed out. Check your connection and try again.'); }
    finally { clearTimeout(timer); locked.current = false; setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void request(challenge ? 'verify' : 'request'); }
  return <form className={styles.form} data-tone={dark ? 'dark' : undefined} onSubmit={submit} aria-busy={busy}>
    <div className={styles.heading}><Mail size={17}/><span>{challenge ? 'Check your email' : 'Continue with email'}</span><small>No password needed</small></div>
    {busy ? <div className={styles.loading} role="status"><span className={styles.ring}/><strong>H</strong><span>{challenge ? 'Verifying your code…' : 'Sending your secure code…'}</span></div> : <>
      {!challenge && signup && <label htmlFor={`${id}-name`}>Your name <input id={`${id}-name`} autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Artist or full name" /></label>}
      <label htmlFor={`${id}-email`}>Email address <input id={`${id}-email`} type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} disabled={!!challenge} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      {challenge && <label htmlFor={`${id}-code`}>Six-digit code <input id={`${id}-code`} className={styles.code} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} required autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>}
      <button className={styles.primary} type="submit">{challenge ? 'Verify & continue' : 'Send me a code'}<ArrowRight size={16}/></button>
      {challenge && <div className={styles.actions}><button type="button" onClick={() => { setChallenge(''); setCode(''); setError(''); setMessage(''); }}>Change email</button><button type="button" disabled={seconds > 0} onClick={() => void request('request')}><RefreshCw size={12}/>{seconds ? `Resend in ${seconds}s` : 'Resend code'}</button></div>}
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.note} role="status">{message}</p>}
    {!challenge && !busy && <p className={styles.note}>One code to sign in or create your HYMN account.</p>}
  </form>;
}
