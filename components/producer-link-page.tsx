"use client";

import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, Globe, Instagram, Music2, Pause, Play, Share2, ShoppingBag, UserRound, Youtube } from "lucide-react";
import { useRef, useState } from "react";
import s from "./producer-link-page.module.css";

import { useProducerBioPurchase } from "./producer-bio-purchase";
import { beatLicensePrice } from "@/lib/beat-store";
import type { BioBeat, BioViewer } from "@/lib/producer-links";
type FeaturedBeat = BioBeat;
type Social = { id: "instagram" | "youtube" | "spotify" | "website"; label: string; url: string };
const socialIcons = { instagram: Instagram, youtube: Youtube, spotify: Music2, website: Globe };
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function ProducerLinkPage({ name, slug, bio, avatar, banner, beats: initialBeats, socials, totalBeats = initialBeats.length, initialViewer = null }: {
  name: string; slug: string; bio: string; avatar: string; banner: string; beats: FeaturedBeat[]; socials: Social[]; totalBeats?: number; initialViewer?: BioViewer | null;
}) {
  const [beats,setBeats] = useState(initialBeats);
  const [total,setTotal] = useState(totalBeats);
  const [offset,setOffset] = useState(initialBeats.length);
  const [moreLoading,setMoreLoading] = useState(false);
  const purchase = useProducerBioPurchase(initialViewer);
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

  async function loadMore() {
    if(moreLoading)return;setMoreLoading(true);setError("");
    try {
      const response=await fetch(`/api/producer-bio/${encodeURIComponent(slug)}/beats?offset=${offset}`,{cache:"no-store"});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load more beats.");
      setBeats(current=>[...current,...data.beats.filter((beat:BioBeat)=>!current.some(item=>item.id===beat.id))]);setOffset(offset+data.beats.length);setTotal(data.total);
    }catch(error){setError(error instanceof Error?error.message:"Could not load more beats.");}finally{setMoreLoading(false);}
  }

  return <main className={s.page} data-smart-help-ignore>
    <img className={s.background} src={banner} alt=""/>
    <div className={s.shade}/>
    <div className={s.column}>
      <div className={s.top}><span>PRODUCER / HYMN</span><div className={s.topActions}>
        <button className={s.share} onClick={share} aria-label={`Share ${name}'s profile`}><Share2 size={18}/></button>
        {purchase.cart.length>0&&<button className={s.share} onClick={purchase.openCart} aria-label={`Open cart, ${purchase.cart.length} beats`}><ShoppingBag size={18}/><small>{purchase.cart.length}</small></button>}
        {purchase.viewer?<Link className={s.viewer} href="/dashboard?module=purchases" aria-label={`${purchase.viewer.name}'s purchases`} title={purchase.viewer.email}>{purchase.viewer.avatarUrl?<img src={purchase.viewer.avatarUrl} alt={`${purchase.viewer.name}'s Google profile`}/>:<UserRound size={19}/>}</Link>:<button className={s.share} onClick={purchase.showLogin} aria-label="Sign in with Google"><UserRound size={19}/></button>}
      </div></div>
      {shareStatus&&<p className={s.shareStatus} role="status">{shareStatus}</p>}
      <header className={s.identity}>
        <img src={avatar} alt={`${name}'s profile photo`} className={s.avatar}/>
        <h1>{name}</h1><p className={s.handle}>@{slug}</p>
        {bio&&<p className={s.bio}>{bio}</p>}
        {socials.length>0&&<nav className={s.socials} aria-label={`Connect with ${name}`}>{socials.map(link=>{const Icon=socialIcons[link.id];return <a className={s.social} key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={link.label} title={link.label}><Icon size={20}/></a>;})}</nav>}
      </header>
      {beats.length>0&&<section className={s.beats} aria-label={`Featured beats by ${name}`}>
        <div className={s.sectionTitle}><h2>In the rotation</h2><span>{total} beats to discover</span></div>
        <div className={s.trackList}>{beats.map(beat=><div key={beat.id} className={`${s.track} ${active===beat.id?s.active:""}`}>
          <div className={s.trackMain}>
            <button type="button" className={s.disc} disabled={!beat.audio} onClick={()=>toggle(beat)} aria-label={`${active===beat.id&&playing?"Pause":"Play"} ${beat.title}`} aria-pressed={active===beat.id&&playing}>
              <img src={beat.artwork} alt="" loading="lazy"/>{active===beat.id&&playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}
            </button>
            <span className={s.trackInfo}><strong title={beat.title}>{beat.title}</strong><small>{name}</small><span className={s.trackMeta}>{beat.bpm} BPM &middot; {beat.keySignature||beat.genre}</span></span>
          </div>
          <div className={s.beatActions}>
            <button className={s.add} disabled={purchase.busy} onClick={()=>purchase.request("cart",beat)} aria-label={purchase.cart.some(item=>item.beatId===beat.id)?`Remove ${beat.title} from cart`:`Add ${beat.title} to cart`}>{purchase.cart.some(item=>item.beatId===beat.id)?<Check size={17}/>:<ShoppingBag size={17}/>}</button>
            <button className={s.buy} disabled={purchase.busy} onClick={()=>{audio.current?.pause();purchase.request("buy",beat);}} aria-label={`Instant buy ${beat.title}`}><span>Instant buy</span><strong>{`\u20b9${beatLicensePrice(beat,"mp3").toLocaleString("en-IN")}`}</strong></button>
          </div>
          {active===beat.id&&duration>0&&<div className={s.progress}><span>{time(current)}</span><input type="range" aria-label={`Seek ${beat.title}`} min={0} max={duration} step={0.1} value={Math.min(current,duration)} onChange={event=>{if(audio.current)audio.current.currentTime=Number(event.target.value);setCurrent(Number(event.target.value));}}/><span>{time(duration)}</span></div>}
        </div>)}</div>
        {offset<total&&<button className={s.more} disabled={moreLoading} onClick={()=>void loadMore()}>{moreLoading?"Loading...":"Load more beats"}<ArrowDown size={16}/></button>}
        {error&&<p className={s.error} role="alert">{error}</p>}
      </section>}
      {purchase.message&&<p className={s.feedback} role="status">{purchase.message}</p>}
      {purchase.error&&<p className={s.error} role="status">{purchase.error}</p>}
      <Link className={s.store} href={storeUrl} aria-label={`Open ${name}'s beat store`}><Music2 size={19}/><span>Explore my beat store</span><ArrowUpRight size={18}/></Link>
      <footer className={s.footer}><Link href="/" aria-label="Powered by HYMN Music"><span>Powered by</span><img src="/assets/hymnlogowhite.png" alt="HYMN Music" width={82} height={30}/></Link></footer>
    </div>
    {purchase.sheet}
    <audio ref={audio} preload="none" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onLoadedMetadata={()=>setDuration(Number.isFinite(audio.current?.duration)?audio.current!.duration:0)} onTimeUpdate={()=>setCurrent(audio.current?.currentTime||0)} onError={()=>{setPlaying(false);setError("Audio is unavailable. Explore the beat store for more.");}}/>
  </main>;
}
