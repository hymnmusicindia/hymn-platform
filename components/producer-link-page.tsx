"use client";

import Link from "next/link";
import { ArrowUpRight, Globe, Instagram, Music2, Pause, Play, Share2, Youtube } from "lucide-react";
import { useRef, useState } from "react";
import s from "./producer-link-page.module.css";

type FeaturedBeat = { id: number; title: string; bpm: number; genre: string; artwork: string; audio: string };
type Social = { id: "instagram" | "youtube" | "spotify" | "website"; label: string; url: string };
const socialIcons = { instagram: Instagram, youtube: Youtube, spotify: Music2, website: Globe };
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function ProducerLinkPage({ name, slug, bio, avatar, banner, beats, socials }: {
  name: string; slug: string; bio: string; avatar: string; banner: string; beats: FeaturedBeat[]; socials: Social[];
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const selection = useRef(0);
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const storeUrl = `/beat-store/producers/${encodeURIComponent(slug)}`;

  function toggle(beat: FeaturedBeat) {
    const player = audio.current;
    if (!player || !beat.audio) return;
    const request = ++selection.current;
    setError("");
    if (active === beat.id && !player.paused) { player.pause(); return; }
    if (active !== beat.id) {
      player.pause(); player.src = beat.audio;
      setActive(beat.id); setCurrent(0); setDuration(0);
    }
    void player.play().catch(() => { if (selection.current === request) { setPlaying(false); setError("Couldn’t play this beat. Try again or open the beat store."); } });
  }

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `${name} — Beats & links`, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); setShareStatus("Link copied"); }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setShareStatus("Share the URL from your browser");
    }
  }

  return <main className={s.page} data-smart-help-ignore>
    <img className={s.background} src={banner} alt=""/>
    <div className={s.shade}/>
    <div className={s.column}>
      <div className={s.top}><span>PRODUCER / HYMN</span><button className={s.share} onClick={share} aria-label={`Share ${name}'s profile`}><Share2 size={18}/></button></div>
      {shareStatus && <p className={s.shareStatus} role="status">{shareStatus}</p>}
      <header className={s.identity}>
        <img src={avatar} alt={`${name}'s profile photo`} className={s.avatar}/>
        <h1>{name}</h1><p className={s.handle}>@{slug}</p>
        {bio && <p className={s.bio}>{bio}</p>}
      </header>
      {beats.length > 0 && <section className={s.beats} aria-label={`Featured beats by ${name}`}>
        <div className={s.sectionTitle}><h2>In the rotation</h2><span>{beats.length} beats to discover</span></div>
        <div className={s.trackList}>{beats.map(beat => <div key={beat.id} className={`${s.track} ${active === beat.id ? s.active : ""}`}>
          <button type="button" className={s.trackButton} disabled={!beat.audio} onClick={() => toggle(beat)} aria-label={`${active === beat.id && playing ? "Pause" : "Play"} ${beat.title}`} aria-pressed={active === beat.id && playing}>
            <div className={s.artwork}><img src={beat.artwork} alt="" loading="lazy"/>{active === beat.id && playing && <span className={s.equalizer}><i/><i/><i/></span>}</div>
            <span className={s.trackInfo}><strong>{beat.title}</strong><small>{beat.genre} <span aria-hidden="true">·</span> {beat.bpm} BPM</small></span>
            <span className={s.play}>{active === beat.id && playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}</span>
          </button>
          {active === beat.id && duration > 0 && <div className={s.progress}><span>{time(current)}</span><input type="range" aria-label={`Seek ${beat.title}`} min={0} max={duration} step={0.1} value={Math.min(current, duration)} onChange={event => { if (audio.current) audio.current.currentTime = Number(event.target.value); setCurrent(Number(event.target.value)); }}/><span>{time(duration)}</span></div>}
        </div>)}</div>
        {error && <p className={s.error} role="alert">{error}</p>}
      </section>}
      <Link className={s.store} href={storeUrl} aria-label={`Open ${name}'s beat store`}><Music2 size={20}/><span>Explore my beat store</span><ArrowUpRight size={19}/></Link>
      {socials.length > 0 && <nav className={s.socials} aria-label={`Connect with ${name}`}>{socials.map(link => {
        const Icon = socialIcons[link.id];
        return <a className={s.social} key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"><Icon size={19}/><span>{link.label}</span><ArrowUpRight size={14}/></a>;
      })}</nav>}
      <footer className={s.footer}><Link href="/" aria-label="Powered by HYMN Music"><span>Powered by</span><img src="/assets/hymnlogowhite.png" alt="HYMN Music" width={82} height={30}/></Link></footer>
    </div>
    <audio ref={audio} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onLoadedMetadata={() => setDuration(Number.isFinite(audio.current?.duration) ? audio.current!.duration : 0)} onTimeUpdate={() => setCurrent(audio.current?.currentTime || 0)} onError={() => { setPlaying(false); setError("Audio is unavailable. Explore the beat store for more."); }}/>
  </main>;
}
