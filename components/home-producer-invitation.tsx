"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Disc3, Pause, Play, Upload, SlidersHorizontal, Wallet } from "lucide-react";

const steps = [
  { name: "Upload", icon: Upload, title: "Give that folder a future.", text: "Bring your original beats, artwork and preview. We review the files and rights before your listing goes live.", detail: "Your sound. Your producer name." },
  { name: "Set your price", icon: SlidersHorizontal, title: "Put a value on your sound.", text: "Choose prices for the licences you offer. Let artists pick the files and usage that suit their next release.", detail: "MP3 · WAV · Stems · Exclusive" },
  { name: "Earn", icon: Wallet, title: "Make music. Build a catalogue.", text: "Reach artists through the HYMN Beatstore and track verified sales from your producer workspace.", detail: "70% producer share on eligible sales" }
];

export function HomeProducerInvitation() {
  const [step, setStep] = useState(0);
  const [motion, setMotion] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const current = steps[step];
  return <section className="shell py-12 sm:py-20" aria-labelledby="producer-invitation-title">
    <div className="force-dark relative isolate overflow-hidden rounded-[2rem] bg-[#101114] text-white">
      <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1600&q=80')" }} />
      {motion && !failed && <img src="https://media3.giphy.com/media/T9aOBkDuHGMaC0J2kP/giphy.gif" alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 -z-10 h-full w-full object-cover opacity-45" />}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(7,8,10,.96),rgba(7,8,10,.83)_50%,rgba(7,8,10,.62))]" />
      <div className="flex items-center justify-between border-b border-white/15 px-6 py-5 sm:px-10">
        <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.22em]"><Disc3 className="h-4 w-4 text-[#f5c16c]" />The next sound could be yours</p>
        <button type="button" onClick={() => setMotion(value => !value)} aria-label={motion ? "Pause producer background" : "Play producer background"} className="rounded-full border border-white/25 p-2.5 transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{motion ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}</button>
      </div>
      <div className="grid gap-12 px-6 py-10 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:py-16">
        <div>
          <p className="mb-5 text-xs font-medium text-[#f5c16c]">Become a HYMN producer</p>
          <h2 id="producer-invitation-title" className="text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl">Your hard drive<br />has hits.<br /><span className="text-[#f5c16c]">Let artists find them.</span></h2>
          <p className="mt-6 max-w-md text-sm leading-7 text-white/70">Turn your beats into someone’s next record. Open your producer workspace, publish your sound and earn from your craft.</p>
          <Link href="/producer-login" className="group mt-8 inline-flex items-center gap-5 rounded-xl bg-white px-6 py-4 text-sm font-semibold text-black transition hover:bg-[#f5c16c]">Become a producer<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
          <Link href="/beat-store" className="ml-5 mt-5 inline-block border-b border-white/35 pb-1 text-xs text-white/80 hover:text-white">Explore the Beatstore</Link>
        </div>
        <div className="flex flex-col justify-center">
          <p className="mb-5 text-[10px] uppercase tracking-[.2em] text-white/50">Your first release, in three moves</p>
          <div role="tablist" aria-label="How selling beats works" className="grid grid-cols-3 border-b border-white/20">
            {steps.map((item, index) => <button key={item.name} id={`producer-tab-${index}`} role="tab" aria-selected={step === index} aria-controls="producer-step-panel" type="button" onClick={() => setStep(index)} className={`border-b-2 px-2 py-4 text-left text-xs font-semibold transition ${step === index ? "border-[#f5c16c] text-[#f5c16c]" : "border-transparent text-white/50 hover:text-white"}`}><span className="mb-2 block font-mono text-[10px] opacity-60">0{index + 1}</span>{item.name}</button>)}
          </div>
          <div id="producer-step-panel" role="tabpanel" aria-labelledby={`producer-tab-${step}`} className="min-h-[250px] py-8" aria-live="polite">
            <current.icon className="h-9 w-9 text-[#f5c16c]" strokeWidth={1.2} />
            <h3 className="mt-5 text-2xl font-semibold tracking-tight">{current.title}</h3>
            <p className="mt-3 max-w-md text-sm leading-7 text-white/65">{current.text}</p>
            <p className="mt-5 text-xs font-medium text-[#f5c16c]">{current.detail}</p>
          </div>
          <div className="flex items-end justify-between gap-6 border-t border-white/20 pt-6"><div><span className="text-4xl font-semibold tracking-tight">70<span className="text-xl text-[#f5c16c]">%</span></span><p className="mt-1 text-xs text-white/60">Your producer share</p></div><p className="max-w-[230px] text-[11px] leading-5 text-white/50">Eligible verified sales, subject to refunds and payout checks. <Link href="/policies/producer-terms" className="underline underline-offset-4 hover:text-white">Read producer terms</Link>.</p></div>
        </div>
      </div>
    </div>
  </section>;
}
