'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Pause, Play } from 'lucide-react';
import styles from './home-beat-carousel.module.css';
type Preview = { id: number; title: string; genre: string; bpm: number; artwork: string; price: number; src: string };
export function HomeBeatCarousel({ beats }: { beats: Preview[] }) {
  const viewport = useRef<HTMLDivElement>(null), audio = useRef<HTMLAudioElement>(null), request = useRef(0);
  const [active, setActive] = useState<number | null>(null), [playing, setPlaying] = useState(false), [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false), [interacting, setInteracting] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (paused || interacting || playing || busy || media.matches || beats.length < 2) return;
    let frame = 0, previous = 0, offset = viewport.current?.scrollLeft || 0;
    function move(time: number) {
      const node = viewport.current;
      if (node && previous && !document.hidden) {
        offset += Math.min(time - previous, 50) * .018;
        const end = node.scrollWidth - node.clientWidth;
        if (end > 0) { if (offset >= end) offset = 0; node.scrollLeft = offset; }
      }
      previous = time; frame = requestAnimationFrame(move);
    }
    frame = requestAnimationFrame(move); return () => cancelAnimationFrame(frame);
  }, [paused, interacting, playing, busy, beats.length]);
  useEffect(() => () => { request.current++; audio.current?.pause(); }, []);
  async function toggle(beat: Preview) {
    const player = audio.current; if (!player) return;
    const ticket = ++request.current; setMessage('');
    if (active === beat.id && !player.paused) { player.pause(); setBusy(false); return; }
    player.pause(); if (active !== beat.id) { player.src = beat.src; setActive(beat.id); }
    setBusy(true);
    try { await player.play(); if (ticket === request.current) setBusy(false); }
    catch { if (ticket === request.current) { setBusy(false); setPlaying(false); setMessage('Preview unavailable. Open the Beat Store to try again.'); } }
  }
  if (!beats.length) return <p className={styles.empty}>New beats are on their way. <Link href="/beat-store">Explore the Beat Store <ArrowRight size={14}/></Link></p>;
  return <div className={styles.root}>
    <div className={styles.toolbar}><span>Listen here. Make it yours in the store.</span><button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={12}/> : <Pause size={12}/>} {paused ? 'Resume carousel' : 'Pause carousel'}</button></div>
    <div className={styles.viewport} ref={viewport} tabIndex={0} role="region" aria-label="Beat previews. Swipe to explore." onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocusCapture={() => setInteracting(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }} onPointerDown={() => setPaused(true)} onWheel={() => setPaused(true)}>
      {beats.map(beat => <article key={beat.id} className={styles.card}>
        <button type="button" className={styles.cover} onClick={() => void toggle(beat)} aria-label={`${active === beat.id && playing ? 'Pause' : 'Play'} ${beat.title}`} aria-busy={active === beat.id && busy}>
          <img src={beat.artwork} alt={`${beat.title} cover`} loading="lazy" width={200} height={200}/><span>{active === beat.id && playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</span>
        </button><div className={styles.copy}><small>{beat.genre} · {beat.bpm} BPM</small><h3 title={beat.title}>{beat.title}</h3><div><strong>₹{beat.price.toLocaleString('en-IN')}</strong><Link href="/beat-store#beat-catalog" aria-label={`View ${beat.title} in Beat Store`}>View beat <ArrowRight size={13}/></Link></div></div>
      </article>)}
    </div>
    <audio ref={audio} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setBusy(false); }} onError={() => { setPlaying(false); setBusy(false); setMessage('Preview unavailable. Open the Beat Store to try again.'); }}/>
    {message && <p role="status" className={styles.message}>{message}</p>}
  </div>;
}
