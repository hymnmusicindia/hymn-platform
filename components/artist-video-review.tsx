"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Play, X } from 'lucide-react';
import { useAccessibleDialog } from './ui/use-accessible-dialog';
import styles from './artist-video-review.module.css';

export const virajReview = {
  name: 'Viraj',
  src: '/testimonials/viraj-review.mp4',
  poster: '/testimonials/viraj-review-poster.webp',
  duration: '0:29'
} as const;

export function ArtistVideoReview({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const video = useRef<HTMLVideoElement>(null);
  function close() { video.current?.pause(); setOpen(false); }
  const dialog = useAccessibleDialog(open, close);
  useEffect(() => {
    if (!open) return;
    const pause = () => { if (document.hidden) video.current?.pause(); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, [open]);
  return <>
    <button type="button" className={`${styles.card} ${compact ? styles.compact : ''}`} aria-label="Watch Viraj's video review of HYMN" aria-haspopup="dialog" onClick={() => { setFailed(false); setOpen(true); }}>
      <img src={virajReview.poster} alt="Viraj sharing his experience with HYMN" width={640} height={720} loading={compact ? 'lazy' : 'eager'} decoding="async"/>
      <span className={styles.topline}><span>ARTIST REVIEW</span><span>{virajReview.duration}</span></span>
      <span className={styles.play}><Play size={25} fill="currentColor"/><span className={styles.srOnly}>Play video</span></span>
      <span className={styles.caption}><span><strong>Hear it from Viraj.</strong><small>His experience. In his own words.</small></span><ArrowUpRight size={23}/></span>
    </button>
    {open ? createPortal(<div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
        <header><div><span>ARTIST REVIEW</span><h2 id={`${id}-title`}>Viraj on HYMN</h2></div><button type="button" aria-label="Close video review" onClick={close}><X size={21}/></button></header>
        {failed ? <div className={styles.error} role="alert"><p>The video could not be played here.</p><a href={virajReview.src} target="_blank" rel="noreferrer">Open the original video<ArrowUpRight size={16}/></a></div> : <video ref={video} src={virajReview.src} poster={virajReview.poster} controls autoPlay playsInline preload="metadata" width={1920} height={1080} aria-label="Viraj's video review of HYMN" onError={() => setFailed(true)}>Your browser does not support this video. <a href={virajReview.src}>Open Viraj&apos;s review</a>.</video>}
        <footer><span>A review shared by Viraj.</span><a href={virajReview.src} target="_blank" rel="noreferrer">Open original<ArrowUpRight size={13}/></a></footer>
      </section>
    </div>, document.body) : null}
  </>;
}
