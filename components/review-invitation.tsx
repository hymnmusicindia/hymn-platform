"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, LoaderCircle, PenLine } from 'lucide-react';
import styles from './home-reviews-carousel.module.css';

export function ReviewInvitation({ signedIn }: { signedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const show = (event: Event) => setMessage(String((event as CustomEvent<string>).detail || ''));
    window.addEventListener('hymn:purchase-review-notice', show);
    return () => window.removeEventListener('hymn:purchase-review-notice', show);
  }, []);
  async function review() {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/reviews/eligible', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load your purchases. Please try again.');
      const data = await response.json();
      if (!data.eligible) { setMessage('Reviews open after a completed purchase. Already shared yours? Thank you.'); return; }
      window.dispatchEvent(new CustomEvent('hymn:purchase-review-open', { detail: data.eligible }));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className={styles.invitation}><span>Used HYMN? Your experience belongs here.</span>{signedIn ? <button type="button" onClick={() => void review()} disabled={busy}>{busy ? <LoaderCircle size={15}/> : <PenLine size={15}/>}Share your experience<ArrowUpRight size={15}/></button> : <Link href={`/login?next=${encodeURIComponent('/?review=1#artist-reviews')}`}><PenLine size={15}/>Share your experience<ArrowUpRight size={15}/></Link>}{message ? <p role="status">{message}</p> : null}</div>;
}
