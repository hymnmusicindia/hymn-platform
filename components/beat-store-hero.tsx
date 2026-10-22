"use client";

import Link from "next/link";
import { ArrowDown, ArrowUpRight, Headphones, Play, SlidersHorizontal, WandSparkles } from "lucide-react";
import type { ProducerProfile } from "@/lib/types";
import "@/app/styles/beat-store-hero.css";

export function BeatStoreHero({ moods, producer, onMood, onSurprise, onFinder, onProducer }: {
  moods: string[];
  producer: ProducerProfile | null;
  onMood: (mood: string) => void;
  onSurprise: () => void;
  onFinder: () => void;
  onProducer: () => void;
}) {
  const producerImage = producer?.coverPhotoUrl || producer?.imageUrl || producer?.avatarUrl;
  return <section className="beat-store-hero" aria-label="HYMN Beatstore">
    <div className="beat-hero-editorial">
      <div className="beat-hero-main">
        <p className="beat-hero-eyebrow"><span /> HYMN BEATSTORE</p>
        <h1>Your next song<br />starts <em>here.</em></h1>
        <p className="beat-hero-description">Find the beat you can already hear yourself on. Explore independent sounds, press play and make it yours.</p>
        <div className="beat-hero-cta">
          <a href="#beat-catalog" className="beat-hero-action">Explore beats <ArrowDown size={16} /></a>
          <button type="button" onClick={onSurprise} className="beat-hero-text-action"><Headphones size={17} /> Play something new</button>
        </div>
        {moods.length ? <div className="beat-hero-moods"><span>Set the mood</span>{moods.map(mood => <button type="button" key={mood} onClick={() => onMood(mood)}>{mood}<ArrowUpRight size={12}/></button>)}</div> : null}
      </div>
      <aside className="beat-hero-feature">
        {producer ? <>
          <button type="button" className="beat-hero-portrait" onClick={onProducer} aria-label={`Explore beats by ${producer.name}`}>
            {producerImage ? <img src={producerImage} alt="" onError={event => { event.currentTarget.style.display = "none"; }} /> : null}
            <span className="beat-hero-record" aria-hidden="true"><span /></span>
            <span className="beat-hero-portrait-play"><Play size={20} fill="currentColor" /></span>
          </button>
          <div className="beat-hero-feature-caption"><div><p>INDEPENDENT SOUND</p><h2>{producer.name}</h2></div><button type="button" onClick={onProducer} aria-label={`Browse ${producer.name}'s beats`}><ArrowUpRight size={22}/></button></div>
        </> : <div className="beat-hero-empty"><span className="beat-hero-record" aria-hidden="true"><span /></span><p>A new idea is one play away.</p></div>}
      </aside>
    </div>
    <div className="beat-hero-bottom"><span><Headphones size={15}/> Listen before you choose</span><span><SlidersHorizontal size={15}/> Compare licence options</span><button type="button" onClick={onFinder}><WandSparkles size={15}/> Help me find my sound <ArrowUpRight size={13}/></button><Link href="/producer-login">For producers <ArrowUpRight size={13}/></Link></div>
  </section>;
}
