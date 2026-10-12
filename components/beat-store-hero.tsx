"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "@/app/styles/beat-store-hero.css";
import { ArrowLeft, ArrowRight, Headphones, Mic2, Radio, WandSparkles } from "lucide-react";
import type { ProducerProfile } from "@/lib/types";

const carouselGlassButton = "beat-hero-action beat-hero-action-secondary";
const carouselPrimaryButton = "beat-hero-action";

export function BeatStoreHero({ moods, producer, onMood, onSurprise, onFinder, onProducer }: {
  moods: string[];
  producer: ProducerProfile | null;
  onMood: (mood: string) => void;
  onSurprise: () => void;
  onFinder: () => void;
  onProducer: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setSlide((value) => (value + 1) % 3), 6500);
    return () => window.clearInterval(timer);
  }, [paused]);
  const go = (next: number) => setSlide((next + 3) % 3);
  const producerImage = producer?.coverPhotoUrl || producer?.imageUrl || producer?.avatarUrl || "/assets/producers/placeholder-1.jpg";

  return <section className="beat-store-hero force-dark relative mb-6 overflow-hidden rounded-[2rem] border border-white/10 bg-[#090a0b] text-white shadow-[0_26px_80px_rgba(0,0,0,.28)]" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)} aria-roledescription="carousel" aria-label="HYMN Beat Store">
    <div className="beat-hero-stage relative" onTouchStart={event => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={event => { if (touchStart.current !== null) { const delta = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(delta) > 50) go(slide + (delta < 0 ? 1 : -1)); } touchStart.current = null; }}>
      <article className={`absolute inset-0 transition duration-700 ${slide === 0 ? "z-10 translate-x-0 opacity-100" : "pointer-events-none -translate-x-8 opacity-0"}`} aria-hidden={slide !== 0} inert={slide !== 0}>
        <img src="https://media1.giphy.com/media/v1.Y2lkPTZjMDliOTUydzVwNWR5MGQ2OTQ0YWloa2xic210OXk5dDJrcTlwcXZseW1neThlYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/n3xnioxdtDrHIsfqOY/giphy-downsized-medium.gif" alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,7,.97)_0%,rgba(5,6,7,.75)_43%,rgba(5,6,7,.18)_78%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,.72),transparent_55%)]" />
        <div className="beat-hero-copy relative flex h-full max-w-2xl flex-col justify-center">
          <h1 className="text-5xl font-semibold leading-[.91] tracking-[-.06em] sm:text-6xl">Find the sound<br /><span className="text-white/55">that moves the room.</span></h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/70 sm:text-base">The right beat makes the room move before you ever step on stage.</p>
          <div className="mt-7 flex flex-wrap gap-2">{moods.slice(0, 4).map((mood) => <button key={mood} type="button" onClick={() => onMood(mood)} className={carouselGlassButton}>{mood}</button>)}<button type="button" onClick={onSurprise} className={carouselPrimaryButton}><WandSparkles className="h-4 w-4" />Surprise me</button></div>
        </div>
      </article>

      <article className={`absolute inset-0 transition duration-700 ${slide === 1 ? "z-10 translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"}`} aria-hidden={slide !== 1} inert={slide !== 1}>
        <img src="https://media3.giphy.com/media/T9aOBkDuHGMaC0J2kP/giphy.gif" alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 grayscale-[25%]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,7,.98)_0%,rgba(5,6,7,.86)_48%,rgba(5,6,7,.52)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_46%,rgba(255,255,255,.09),transparent_30%)]" />
        <div className="beat-hero-copy beat-hero-journey relative h-full">
          <h2>Your sound. <span>Out in the world.</span></h2>
          <div className="beat-hero-flow" aria-label="Choose a beat, record in the studio, release worldwide">
            <button type="button" onClick={onFinder}><Headphones aria-hidden="true" /><span>Find a beat</span></button>
            <ArrowRight className="beat-hero-flow-arrow" aria-hidden="true" />
            <Link href="/studio"><Mic2 aria-hidden="true" /><span>Make it yours</span></Link>
            <ArrowRight className="beat-hero-flow-arrow" aria-hidden="true" />
            <Link href="/distribution/start"><Radio aria-hidden="true" /><span>Release it</span></Link>
          </div>
        </div>
      </article>

      <article className={`beat-hero-producer absolute inset-0 transition duration-700 ${slide === 2 ? "z-10 translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"}`} aria-hidden={slide !== 2} inert={slide !== 2}>
        <img src={producerImage} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,7,.96),rgba(5,6,7,.62)_48%,rgba(5,6,7,.2))]" />
        <div className="beat-hero-copy relative flex h-full max-w-2xl flex-col justify-center">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.24em] text-white/60"><Radio className="h-4 w-4" />Producer on rotation</p>
          <h2 className="mt-4 text-5xl font-semibold leading-[.92] tracking-[-.055em] sm:text-6xl">{producer?.name || "A new sound is waiting."}</h2>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/65">{producer?.description || producer?.specialty || "Independent producers, real points of view, and beats made to become songs."}</p>
          <div className="mt-7 flex flex-wrap gap-3"><button type="button" onClick={onProducer} className={carouselPrimaryButton}><Mic2 className="h-4 w-4" />Listen</button><Link href="/producer-login" className={carouselGlassButton}>Start selling</Link></div>
        </div>
      </article>
    </div>

    <nav className="beat-hero-controls" aria-label="Banner slides">
      <button type="button" onClick={() => go(slide - 1)} className="beat-hero-previous" aria-label="Previous slide"><ArrowLeft size={16} /></button>
      <div className="beat-hero-pagination">{[0, 1, 2].map(index => <button key={index} type="button" onClick={() => go(index)} aria-label={`Go to slide ${index + 1}`} aria-current={slide === index ? "true" : undefined}><span /></button>)}</div>
      <button type="button" onClick={() => go(slide + 1)} className="beat-hero-forward" aria-label="Next slide"><ArrowRight size={16} /></button>
    </nav>
  </section>;
}
