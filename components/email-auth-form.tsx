"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import styles from './email-auth-form.module.css';

export function EmailAuthForm({ signup = false, askForName = signup, showCallbackErrors = false, initialName = "", returnTo, onAuthenticated, dark = false }: { signup?: boolean; askForName?: boolean; showCallbackErrors?: boolean; initialName?: string; returnTo?: string; onAuthenticated?: () => Promise<void> | void; dark?: boolean }) {
  const id = useId(), locked = useRef(false), controller = useRef<AbortController | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState(''), [name, setName] = useState(initialName), [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [resendAt, setResendAt] = useState(0), [seconds, setSeconds] = useState(0);
  useEffect(() => { const tick = () => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))); tick(); const timer = window.setInterval(tick, 1000); return () => clearInterval(timer); }, [resendAt]);
  useEffect(() => { setHydrated(true); return () => controller.current?.abort(); }, []);
  useEffect(() => { if (challenge && !busy) codeInput.current?.focus(); }, [challenge, busy]);
  async function request(action: 'request' | 'verify') {
    if (locked.current) return; locked.current = true; setBusy(true); setError(''); setMessage('');
    const abort = new AbortController(); controller.current = abort;
    const timer = window.setTimeout(() => abort.abort(), 30000);
    try {
      const response = await fetch('/api/auth/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify(action === 'request' ? { action, email, name } : { action, email, challenge, code, ...(returnTo ? { returnTo } : {}) }) });
      const data = await response.json().catch(() => null);
      if (!data || typeof data !== 'object') throw Error('We could not confirm the response. Please try again.');
      if (!response.ok) { const wait = Number(response.headers.get('Retry-After')); if (wait > 0) setResendAt(Date.now() + wait * 1000); throw Error(data.error || 'Sign-in could not finish. Please try again.'); }
      if (action === 'request') {
        if (typeof data.challenge !== 'string' || !data.challenge) throw Error('We could not send your code. Please try again.');
        setChallenge(data.challenge); setCode(''); setResendAt(Date.now() + (Number.isFinite(data.resendAfter) ? Math.max(0, data.resendAfter) : 60) * 1000); setMessage(typeof data.message === 'string' ? data.message : 'Your code is on its way. Check your inbox and spam folder.');
      }
      else {
        if (data.signedIn !== true) throw Error('Sign-in was not confirmed. Please try again.');
        const destination = typeof data.redirectPath === 'string' && data.redirectPath.startsWith('/') && !data.redirectPath.startsWith('//') ? data.redirectPath : '/';
        if (onAuthenticated) {
          try { await onAuthenticated(); }
          catch (callbackError) {
            if (showCallbackErrors) throw callbackError;
            window.location.assign(destination);
          }
        }
        else window.location.assign(destination);
      }
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Please try again.'); else setError('The request timed out. Check your connection and try again.'); }
    finally { clearTimeout(timer); locked.current = false; setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void request(challenge ? 'verify' : 'request'); }
  return <form className={styles.form} data-tone={dark ? 'dark' : undefined} onSubmit={submit} aria-busy={busy || !hydrated}>
    <div className={styles.heading}><Mail size={17}/><span>{challenge ? 'Check your email' : 'Continue with email'}</span><small>No password needed</small></div>
    <fieldset className={styles.fields} disabled={busy || !hydrated}>
      {!challenge && signup && askForName && <label htmlFor={`${id}-name`}>Your name (optional) <input id={`${id}-name`} autoComplete="name" value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Artist or full name" /></label>}
      <label htmlFor={`${id}-email`}>Email address <input id={`${id}-email`} type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} disabled={!!challenge} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      {challenge && <label htmlFor={`${id}-code`}>Six-digit code <input ref={codeInput} id={`${id}-code`} className={styles.code} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" aria-describedby={`${id}-code-hint`} /></label>}
      {challenge && <p id={`${id}-code-hint`} className={styles.note}>Paste the code from your email. Check spam if it hasn&apos;t arrived.</p>}
      <button className={styles.primary} type="submit" disabled={busy || !challenge && seconds > 0}>{busy ? challenge ? 'Verifying your code...' : 'Sending your secure code...' : challenge ? 'Verify & continue' : seconds > 0 ? `Try again in ${seconds}s` : 'Send me a code'}</button>
      {challenge && <div className={styles.actions}><button type="button" onClick={() => { setChallenge(''); setCode(''); setError(''); setMessage(''); }}>Change email</button><button type="button" disabled={seconds > 0} onClick={() => void request('request')}><RefreshCw size={12}/>{seconds ? `Resend in ${seconds}s` : 'Resend code'}</button></div>}
    </fieldset>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.note} role="status">{message}</p>}
    {!challenge && !busy && <p className={styles.note}>One code to sign in or create your HYMN account.</p>}
  </form>;
}
