"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Play, X } from 'lucide-react';
import styles from './artist-video-review.module.css';

export const virajReview = {
  name: 'Viraj',
  src: '/testimonials/viraj-review.mp4',
  poster: '/testimonials/viraj-review-poster.webp',
  duration: '0:29'
} as const;

export function ArtistVideoReview({ compact = false, onPlaybackChange }: { compact?: boolean; onPlaybackChange?: (playing: boolean) => void }) {
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const playbackCallback = useRef(onPlaybackChange);
  useEffect(() => { playbackCallback.current = onPlaybackChange; }, [onPlaybackChange]);
  useEffect(() => () => playbackCallback.current?.(false), []);
  function stop() { video.current?.pause(); setPlaying(false); playbackCallback.current?.(false); restoreFocus.current = true; setStarted(false); }
  useEffect(() => { if (!started && restoreFocus.current) { restoreFocus.current = false; preview.current?.focus(); } }, [started]);
  useEffect(() => {
    if (!started) return;
    const pause = () => { if (document.hidden) video.current?.pause(); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, [started]);
  return <div className={`${styles.card} ${compact ? styles.compact : ''}`} data-playing={playing} data-video-review onKeyDown={event => { if (event.key === 'Escape' && started && !document.fullscreenElement) { event.stopPropagation(); stop(); } }}>
    {!started ? <button type="button" ref={preview} className={styles.preview} aria-label="Watch Viraj's video review of HYMN" onClick={() => { setFailed(false); setStarted(true); }}>
      <img src={virajReview.poster} alt="Viraj sharing his experience with HYMN" width={640} height={720} loading={compact ? 'lazy' : 'eager'} decoding="async"/>
      <span className={styles.topline}><span>ARTIST REVIEW</span><span>{virajReview.duration}</span></span>
      <span className={styles.play}><Play size={25} fill="currentColor"/><span className={styles.srOnly}>Play video</span></span>
      <span className={styles.caption}><span><strong>Hear it from Viraj.</strong><small>His experience. In his own words.</small></span><Play size={22}/></span>
    </button> : <div className={styles.inlinePlayer}>
      {failed ? <div className={styles.error} role="alert"><p>The video could not be played here.</p><a href={virajReview.src} target="_blank" rel="noreferrer">Open the original video<ArrowUpRight size={16}/></a></div> : <video ref={video} src={virajReview.src} poster={virajReview.poster} controls autoPlay playsInline preload="metadata" width={1920} height={1080} aria-label="Viraj's video review of HYMN" onPlay={event => { document.querySelectorAll<HTMLVideoElement>('[data-video-review] video').forEach(other => { if (other !== event.currentTarget) other.pause(); }); setPlaying(true); playbackCallback.current?.(true); }} onPause={() => { setPlaying(false); playbackCallback.current?.(false); }} onEnded={() => { setPlaying(false); playbackCallback.current?.(false); }} onError={() => { setPlaying(false); playbackCallback.current?.(false); setFailed(true); }}>Your browser does not support this video. <a href={virajReview.src}>Open Viraj&apos;s review</a>.</video>}
      <button type="button" className={styles.closeInline} aria-label="Back to video preview" onClick={event => { event.stopPropagation(); stop(); }}><X size={16}/></button>
    </div>}
  </div>;
}
