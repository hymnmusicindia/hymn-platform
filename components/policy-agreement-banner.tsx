'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Info, LoaderCircle } from 'lucide-react';
import type { PolicyAgreementStatus } from '@/lib/policy-agreement';
import styles from './policy-agreement-banner.module.css';

export function PolicyAgreementBanner({ initialStatus }: { initialStatus: PolicyAgreementStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const banner = useRef<HTMLElement | null>(null);
  const generation = useRef(0);
  const accepting = useRef(false);
  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);
  useEffect(() => {
    async function refresh() {
      if (accepting.current || document.visibilityState === 'hidden') return;
      const request = ++generation.current;
      try {
        const response = await fetch('/api/account/policies', { cache:'no-store' });
        if (!response.ok) return;
        const next = await response.json();
        if (request === generation.current && typeof next.revision === 'string') setStatus(next);
      } catch { /* An unavailable refresh never records or fabricates acceptance. */ }
    }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    const element = banner.current;
    const root = element?.closest<HTMLElement>('.hymn-portal-root');
    if (!element || !root) return;
    const measure = () => root.style.setProperty('--policy-banner-height', `${element.getBoundingClientRect().height}px`);
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => { observer.disconnect(); root.style.removeProperty('--policy-banner-height'); };
  }, [status.accepted]);
  async function agree() {
    if (accepting.current) return;
    accepting.current = true; ++generation.current; setBusy(true); setError('');
    try {
      const response = await fetch('/api/account/policies', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({accepted:true,revision:status.revision}), signal:AbortSignal.timeout(30000) });
      const next = await response.json().catch(() => ({}));
      if (response.status === 409) { setStatus(next); setError('The policies changed while you were reviewing them. Please review the updated documents and agree again.'); return; }
      if (!response.ok || next.accepted !== true) throw Error(next.error || 'Your agreement could not be saved. Please try again.');
      setStatus(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your agreement could not be saved. Please try again.'); }
    finally { accepting.current = false; setBusy(false); }
  }
  if (status.accepted) return null;
  return <section ref={banner} className={styles.banner} data-policy-banner aria-labelledby="account-policy-heading">
    <Info className={styles.icon} size={21} aria-hidden="true" />
    <div className={styles.content}>
      <p id="account-policy-heading" className={styles.heading}>Please review our current terms and policies</p>
      <p>By selecting I agree, you accept the <Link href="/terms-of-service" target="_blank" rel="noopener noreferrer">Terms of Service</Link>, <Link href="/policies/distribution-terms" target="_blank" rel="noopener noreferrer">Distribution Terms</Link> and <Link href="/policies" target="_blank" rel="noopener noreferrer">applicable policies</Link>, and acknowledge the <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.</p>
      <p className={styles.version}>Updated {status.updatedLabel}. Your agreement is saved to your account; updates will ask you to agree again.</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
    <button type="button" className={styles.agree} onClick={agree} disabled={busy} aria-busy={busy}>{busy ? <><LoaderCircle size={16} className={styles.spinner} aria-hidden="true" /> Saving...</> : 'I agree'}</button>
  </section>;
}
