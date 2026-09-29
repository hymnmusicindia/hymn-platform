"use client";

import Link from "next/link";
import Image from "next/image";
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
        <Image src="/assets/beat-store/artist-studio-hero-v1.png" alt="" fill priority sizes="(max-width: 1700px) 100vw, 1700px" className="object-cover object-[64%_center]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,7,.96)_0%,rgba(5,6,7,.78)_39%,rgba(5,6,7,.08)_78%)]" />
        <div className="relative flex min-h-[480px] max-w-2xl flex-col justify-center p-7 sm:min-h-[520px] sm:p-12">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.24em] text-white/55"><Headphones className="h-4 w-4" />The HYMN Beat Store</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[.91] tracking-[-.06em] sm:text-7xl">Hear the first bar.<br /><span className="text-[#c9ff63]">See the whole song.</span></h1>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/65 sm:text-base">Find the beat that pulls a record out of you. Licence it clearly and keep building from the same place.</p>
          <div className="mt-7 flex flex-wrap gap-2">{moods.slice(0, 4).map((mood) => <button key={mood} type="button" onClick={() => onMood(mood)} className="rounded-full border border-white/20 bg-black/20 px-4 py-2.5 text-xs font-semibold backdrop-blur transition hover:-translate-y-0.5 hover:border-[#c9ff63] hover:text-[#c9ff63]">{mood}</button>)}<button type="button" onClick={onSurprise} className="inline-flex items-center gap-2 rounded-full bg-[#c9ff63] px-4 py-2.5 text-xs font-bold text-black transition hover:scale-[1.03]"><WandSparkles className="h-4 w-4" />Surprise me</button></div>
        </div>
      </article>

      <article className={`absolute inset-0 transition duration-700 ${slide === 1 ? "z-10 translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"}`} aria-hidden={slide !== 1}>
        <div className="absolute inset-0 bg-[#ebe9e2]" />
        <div className="absolute -right-20 top-[-9rem] h-[34rem] w-[34rem] rounded-full border-[6rem] border-[#c9ff63]" />
        <Image src="/assets/release-globe.svg" alt="" width={448} height={448} className="absolute bottom-[-4rem] right-[5%] h-[28rem] w-[28rem] opacity-75" />
        <div className="relative flex min-h-[480px] max-w-3xl flex-col justify-center p-7 text-black sm:min-h-[520px] sm:p-12">
          <p className="text-[10px] font-bold uppercase tracking-[.24em] text-black/45">One song. One connected run.</p>
          <h2 className="mt-5 text-5xl font-semibold leading-[.91] tracking-[-.06em] sm:text-7xl">Beat to master.<br />Master to world.</h2>
          <div className="mt-8 grid max-w-2xl gap-2 sm:grid-cols-3">
            {[["01", "Choose the beat", "Clear licence. Files ready."], ["02", "Mix + master", "Work with HYMN engineers."], ["03", "Release everywhere", "Distribution when it’s ready."]].map(([number, title, note]) => <div key={number} className="border-t border-black/25 py-4 sm:pr-5"><span className="font-mono text-[10px] text-black/40">{number}</span><strong className="mt-2 block text-sm">{title}</strong><span className="mt-1 block text-xs text-black/50">{note}</span></div>)}
          </div>
          <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={onFinder} className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-xs font-semibold text-white"><Sparkles className="h-4 w-4" />Need a beat for your banger?</button><Link href="/studio" className="rounded-full border border-black/25 px-5 py-3 text-xs font-semibold">Explore mixing</Link></div>
        </div>
      </article>

      <article className={`absolute inset-0 transition duration-700 ${slide === 2 ? "z-10 translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"}`} aria-hidden={slide !== 2}>
        <img src={producerImage} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,7,.96),rgba(5,6,7,.62)_48%,rgba(5,6,7,.2))]" />
        <div className="relative flex min-h-[480px] max-w-2xl flex-col justify-center p-7 sm:min-h-[520px] sm:p-12">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.24em] text-[#c9ff63]"><Radio className="h-4 w-4" />Producer on rotation</p>
          <h2 className="mt-5 text-5xl font-semibold leading-[.92] tracking-[-.055em] sm:text-7xl">{producer?.name || "A new sound is waiting."}</h2>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/65">{producer?.description || producer?.specialty || "Independent producers, real points of view, and beats made to become songs."}</p>
          <div className="mt-7 flex flex-wrap gap-3"><button type="button" onClick={onProducer} className="inline-flex items-center gap-2 rounded-full bg-[#c9ff63] px-5 py-3 text-xs font-bold text-black"><Mic2 className="h-4 w-4" />Hear this producer</button><Link href="/producer-login" className="rounded-full border border-white/25 px-5 py-3 text-xs font-semibold">Put your beats here</Link></div>
        </div>
      </article>
    </div>

    <div className="absolute bottom-5 left-6 z-20 flex items-center gap-3 sm:left-10">
      <button type="button" onClick={() => go(slide - 1)} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/35 backdrop-blur transition hover:border-white/60" aria-label="Previous slide"><ArrowLeft className="h-4 w-4" /></button>
      <div className="flex gap-1.5">{[0, 1, 2].map((index) => <button key={index} type="button" onClick={() => go(index)} className={`h-1.5 rounded-full transition-all ${slide === index ? "w-8 bg-[#c9ff63]" : "w-3 bg-white/35"}`} aria-label={`Go to slide ${index + 1}`} aria-current={slide === index ? "true" : undefined} />)}</div>
      <button type="button" onClick={() => go(slide + 1)} className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/35 backdrop-blur transition hover:border-white/60" aria-label="Next slide"><ArrowRight className="h-4 w-4" /></button>
    </div>
  </section>;
}
