"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, Search, SlidersHorizontal } from "lucide-react";
import { artworkPreviewUrl } from "@/lib/artwork-preview";
import type { StorefrontBeat } from "@/lib/beat-store";
import { useBeatPreviewPlayer } from "./beat-preview-player";
import "@/app/styles/beat-store-hero.css";

export function BeatStoreHero({ beats, moods, search, onSearch, onMood, onFinder, onMatch }: {
  beats: StorefrontBeat[];
  moods: string[];
  search: string;
  onSearch: (query: string) => void;
  onMood: (mood: string) => void;
  onFinder: () => void;
  onMatch: (beat: StorefrontBeat) => void;
}) {
  const heroRef = useRef<HTMLElement>(null);
  const player = useBeatPreviewPlayer();
  const featured = useMemo(() => { const selected: StorefrontBeat[] = []; for (const beat of beats) { if (beat.previewUrl || beat.fileUrl) selected.push(beat); if (selected.length === 6) break; } return selected; }, [beats]);
  const [index, setIndex] = useState(0);
  const [previous, setPrevious] = useState<StorefrontBeat | null>(null);
  const [readyId, setReadyId] = useState<number | null>(null);
  const [rotation, setRotation] = useState(true);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const beat = featured[index % Math.max(featured.length, 1)];
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)");
    const update = () => setMotionAllowed(!media.matches);
    const visibility = () => setPageVisible(!document.hidden);
    update(); visibility();
    media.addEventListener("change", update); document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (heroRef.current) observer.observe(heroRef.current);
    return () => { media.removeEventListener("change", update); document.removeEventListener("visibilitychange", visibility); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!rotation || !motionAllowed || !visible || !pageVisible || hover || focused || player.playing || featured.length < 2) return;
    const timer = window.setTimeout(() => { setPrevious(beat); setIndex(current => (current + 1) % featured.length); }, 8000);
    return () => window.clearTimeout(timer);
  }, [rotation, motionAllowed, visible, pageVisible, hover, focused, player.playing, featured.length, index, beat]);
  function browse() {
    document.getElementById("beat-catalog")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  function select(next: number) { setRotation(false); setPrevious(beat || null); setIndex((next + featured.length) % featured.length); }
  const playing = Boolean(beat && player.activeBeatId === beat.id && player.playing);
  const image = (item: StorefrontBeat) => artworkPreviewUrl(item.coverImage, 960);
  return <section ref={heroRef} className="beat-store-hero" aria-label="HYMN Beatstore" aria-roledescription="carousel"
    onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="beat-hero-art" aria-hidden="true">
      {previous && previous.id !== beat?.id ? <img key={previous.id} className="beat-hero-background" src={image(previous)} alt="" data-visible={readyId !== beat?.id} /> : null}
      <img key={beat?.id || "empty"} className="beat-hero-background" src={beat ? image(beat) : "/assets/onboarding/engineer.jpg"} alt="" fetchPriority="high" data-visible={!beat || readyId === beat.id}
        onLoad={() => setReadyId(beat?.id || null)} onError={event => { const target = event.currentTarget; if (!target.dataset.fallback) { target.dataset.fallback = "true"; target.src = "/assets/onboarding/engineer.jpg"; } else { target.style.visibility = "hidden"; setReadyId(beat?.id || null); } }} />
    </div>
    <div className="beat-hero-shade" aria-hidden="true" />
    <div className="beat-hero-content">
      <h1>Your next sound.<br />Your next chapter.</h1>
      <p className="beat-hero-description">Independent sounds. Endless possibilities.</p>
      <form className="beat-hero-search" role="search" aria-label="Find beats" onSubmit={event => { event.preventDefault(); setRotation(false); browse(); }}>
        <Search size={19} aria-hidden="true" />
        <input type="search" aria-label="Search beats from hero" placeholder="Search a sound, mood or producer" value={search} onChange={event => { setRotation(false); onSearch(event.target.value); }} />
        <button type="submit">Search <ArrowRight size={15} aria-hidden="true" /></button>
      </form>
      {moods.length ? <div className="beat-hero-moods"><span>Set the mood</span>{moods.slice(0, 4).map(mood => <button type="button" key={mood} onClick={() => { setRotation(false); onMood(mood); }}>{mood}</button>)}</div> : null}
      <div className="beat-hero-actions">
        <button type="button" onClick={() => { setRotation(false); onFinder(); }}><SlidersHorizontal size={17} aria-hidden="true" /> Find my sound</button>
        <Link href="/producer-login">Sell your beats <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
    </div>
    {beat ? <div className="beat-hero-feature" aria-label="Featured beat">
      <div className="beat-hero-track">
        <img src={artworkPreviewUrl(beat.coverImage, 192)} alt="" width="64" height="64" onError={event => { event.currentTarget.style.visibility = "hidden"; }} />
        <div><h2>{beat.title}</h2><p>{beat.producer.name}</p><span>{beat.genre} / {beat.bpm} BPM / {beat.keySignature}</span></div>
        <button type="button" className="beat-hero-play" aria-label={`${playing ? "Pause" : "Play"} featured beat ${beat.title}`} onClick={() => { setRotation(false); player.playBeat(beat, featured); }}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
      </div>
      <button type="button" className="beat-hero-similar" onClick={() => { setRotation(false); onMatch(beat); browse(); }}>Explore similar <ArrowRight size={13} /></button>
    </div> : null}
    {featured.length > 1 ? <div className="beat-hero-navigation" aria-label="Featured beat controls">
      <button type="button" aria-label="Previous featured beat" onClick={() => select(index - 1)}><ArrowLeft size={16} /></button>
      <div className="beat-hero-dots">{featured.map((item, position) => <button type="button" key={item.id} aria-label={`Feature ${item.title}`} aria-pressed={position === index % featured.length} onClick={() => select(position)} />)}</div>
      <button type="button" aria-label="Next featured beat" onClick={() => select(index + 1)}><ArrowRight size={16} /></button>
      {motionAllowed ? <button type="button" aria-label={rotation ? "Pause featured rotation" : "Resume featured rotation"} onClick={() => setRotation(current => !current)}>{rotation ? <Pause size={13} /> : <Play size={13} />}</button> : null}
    </div> : null}
  </section>;
}
