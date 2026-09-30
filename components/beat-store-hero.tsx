"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Headphones, Mic2, Radio, Sparkles, WandSparkles } from "lucide-react";
import type { ProducerProfile } from "@/lib/types";

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
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setSlide((value) => (value + 1) % 3), 6500);
    return () => window.clearInterval(timer);
  }, [paused]);
  const go = (next: number) => setSlide((next + 3) % 3);
  const producerImage = producer?.imageUrl || producer?.avatarUrl || "/assets/producers/placeholder-1.jpg";

  return <section className="relative mb-6 overflow-hidden rounded-[2rem] border border-white/10 bg-[#090a0b] text-white shadow-[0_26px_80px_rgba(0,0,0,.28)]" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)} aria-roledescription="carousel" aria-label="HYMN Beat Store">
    <div className="relative min-h-[480px] sm:min-h-[520px]">
      <article className={`absolute inset-0 transition duration-700 ${slide === 0 ? "z-10 translate-x-0 opacity-100" : "pointer-events-none -translate-x-8 opacity-0"}`} aria-hidden={slide !== 0}>
        <img src="https://media1.giphy.com/media/v1.Y2lkPTZjMDliOTUydzVwNWR5MGQ2OTQ0YWloa2xic210OXk5dDJrcTlwcXZseW1neThlYiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/n3xnioxdtDrHIsfqOY/giphy-downsized-medium.gif" alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,7,.97)_0%,rgba(5,6,7,.75)_43%,rgba(5,6,7,.18)_78%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,.72),transparent_55%)]" />
        <div className="relative flex min-h-[480px] max-w-2xl flex-col justify-center p-7 sm:min-h-[520px] sm:p-12">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.24em] text-white/55"><Headphones className="h-4 w-4" />The HYMN Beat Store</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[.91] tracking-[-.06em] sm:text-7xl">Find the sound<br /><span className="text-[var(--money)]">that moves the room.</span></h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/70 sm:text-base">That reaction starts before the stage—with one beat you cannot stop replaying.</p>
          <div className="mt-7 flex flex-wrap gap-2">{moods.slice(0, 4).map((mood) => <button key={mood} type="button" onClick={() => onMood(mood)} className="rounded-full border border-white/20 bg-black/20 px-4 py-2.5 text-xs font-semibold backdrop-blur transition hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/10">{mood}</button>)}<button type="button" onClick={onSurprise} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-bold text-black transition hover:scale-[1.03]"><WandSparkles className="h-4 w-4" />Surprise me</button></div>
        </div>
      </article>

      <article className={`absolute inset-0 transition duration-700 ${slide === 1 ? "z-10 translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"}`} aria-hidden={slide !== 1}>
        <img src="https://media3.giphy.com/media/T9aOBkDuHGMaC0J2kP/giphy.gif" alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 grayscale-[25%]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,7,.98)_0%,rgba(5,6,7,.86)_48%,rgba(5,6,7,.52)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_46%,color-mix(in_srgb,var(--money)_15%,transparent),transparent_30%)]" />
        <div className="absolute inset-x-0 top-[30%] flex h-24 items-center gap-1 overflow-hidden opacity-15">{Array.from({ length: 56 }).map((_, index) => <span key={index} className="w-1 shrink-0 rounded-full bg-white animate-pulse" style={{ height: `${18 + ((index * 29) % 72)}%`, animationDelay: `${index * 35}ms` }} />)}</div>
        <div className="relative grid min-h-[480px] items-center gap-7 p-7 sm:min-h-[520px] sm:p-12 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.24em] text-[var(--money)]">From your headphones to theirs</p>
            <h2 className="mt-5 text-5xl font-semibold leading-[.91] tracking-[-.06em] sm:text-6xl">Start with a beat.<br /><span className="text-[var(--money)]">End with a record</span><br />the world can hear.</h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/65">Choose it here. Finish it with a real engineer. Release it without rebuilding your project somewhere else.</p>
            <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={onFinder} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-bold text-black"><Sparkles className="h-4 w-4" />Find my starting beat</button><Link href="/studio" className="rounded-full border border-white/25 px-5 py-3 text-xs font-semibold">Meet the studio</Link></div>
          </div>
          <div className="relative">
            <div className="absolute left-[8%] right-[8%] top-[2.65rem] h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent)]" />
            <div className="relative grid grid-cols-3">
              {[["01", "BEAT", "Find the pulse", Headphones], ["02", "STUDIO", "Shape the record", Mic2], ["03", "WORLD", "Meet listeners", Radio]].map(([number, title, note, Icon], index) => <div key={String(number)} className={`relative px-3 py-2 sm:px-5 ${index ? "border-l border-white/15" : ""}`}><span className="font-mono text-[9px] text-white/35">{String(number)}</span><span className="mt-5 grid h-9 w-9 place-items-center rounded-full border border-white/35 bg-black/40 text-white backdrop-blur"><Icon className="h-4 w-4" /></span><strong className="mt-6 block text-xs tracking-[.12em]">{String(title)}</strong><span className="mt-1 block text-[10px] text-white/45">{String(note)}</span></div>)}
            </div>
            <div className="mt-7 flex items-center justify-center gap-5 px-5 py-3">
              {["spotify", "apple", "youtube", "amazon"].map((store) => <img key={store} src={`/assets/store-logos/wordmark-${store}.png`} alt={store} className="h-4 max-w-20 object-contain brightness-0 invert opacity-65" />)}
            </div>
          </div>
        </div>
      </article>

      <article className={`absolute inset-0 transition duration-700 ${slide === 2 ? "z-10 translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"}`} aria-hidden={slide !== 2}>
        <img src={producerImage} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,7,.96),rgba(5,6,7,.62)_48%,rgba(5,6,7,.2))]" />
        <div className="relative flex min-h-[480px] max-w-2xl flex-col justify-center p-7 sm:min-h-[520px] sm:p-12">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.24em] text-[var(--money)]"><Radio className="h-4 w-4" />Producer on rotation</p>
          <h2 className="mt-5 text-5xl font-semibold leading-[.92] tracking-[-.055em] sm:text-7xl">{producer?.name || "A new sound is waiting."}</h2>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/65">{producer?.description || producer?.specialty || "Independent producers, real points of view, and beats made to become songs."}</p>
          <div className="mt-7 flex flex-wrap gap-3"><button type="button" onClick={onProducer} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-bold text-black"><Mic2 className="h-4 w-4" />Hear this producer</button><Link href="/producer-login" className="rounded-full border border-white/25 px-5 py-3 text-xs font-semibold">Put your beats here</Link></div>
        </div>
      </article>
    </div>

    <div className="absolute bottom-5 left-6 z-20 flex items-center gap-3 sm:left-10">
      <button type="button" onClick={() => go(slide - 1)} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/35 backdrop-blur transition hover:border-white/60" aria-label="Previous slide"><ArrowLeft className="h-4 w-4" /></button>
      <div className="flex gap-1.5">{[0, 1, 2].map((index) => <button key={index} type="button" onClick={() => go(index)} className={`h-1.5 rounded-full transition-all ${slide === index ? "w-8 bg-white" : "w-3 bg-white/35"}`} aria-label={`Go to slide ${index + 1}`} aria-current={slide === index ? "true" : undefined} />)}</div>
      <button type="button" onClick={() => go(slide + 1)} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/35 backdrop-blur transition hover:border-white/60" aria-label="Next slide"><ArrowRight className="h-4 w-4" /></button>
    </div>
  </section>;
}
