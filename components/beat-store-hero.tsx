"use client";

import Link from "next/link";
import { ArrowRight, Headphones, Search, SlidersHorizontal } from "lucide-react";
import "@/app/styles/beat-store-hero.css";

export function BeatStoreHero({ moods, search, onSearch, onMood, onSurprise, onFinder }: {
  moods: string[];
  search: string;
  onSearch: (query: string) => void;
  onMood: (mood: string) => void;
  onSurprise: () => void;
  onFinder: () => void;
}) {
  function browse() {
    document.getElementById("beat-catalog")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  return <section className="beat-store-hero" aria-label="HYMN Beatstore">
    <img className="beat-hero-background" src="/assets/onboarding/engineer.jpg" alt="" fetchPriority="high" />
    <div className="beat-hero-shade" aria-hidden="true" />
    <div className="beat-hero-content">
      <span className="beat-hero-label">THE HYMN BEATSTORE</span>
      <h1>Find the beat.<br />Make your next hit.</h1>
      <p className="beat-hero-description">Beats from independent producers. A sound for every story.</p>
      <form className="beat-hero-search" role="search" aria-label="Find beats" onSubmit={event => { event.preventDefault(); browse(); }}>
        <Search size={20} aria-hidden="true" />
        <input type="search" aria-label="Search beats from hero" placeholder="Try a genre, mood or producer" value={search} onChange={event => onSearch(event.target.value)} />
        <button type="submit">Search <ArrowRight size={16} aria-hidden="true" /></button>
      </form>
      {moods.length ? <div className="beat-hero-moods"><span>Explore moods</span>{moods.map(mood => <button type="button" key={mood} onClick={() => onMood(mood)}>{mood}</button>)}</div> : null}
      <div className="beat-hero-actions">
        <button type="button" onClick={onSurprise}><Headphones size={17} aria-hidden="true" /> Start listening</button>
        <button type="button" onClick={onFinder}><SlidersHorizontal size={17} aria-hidden="true" /> Find my sound</button>
        <Link href="/producer-login">Sell your beats <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
    </div>
  </section>;
}
