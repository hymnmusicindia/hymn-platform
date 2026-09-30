"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Play, Upload, SlidersHorizontal, Wallet } from "lucide-react";

const steps = [
  { name: "Upload", icon: Upload, detail: "Add your beat, cover and files." },
  { name: "Price", icon: SlidersHorizontal, detail: "Choose your licence prices." },
  { name: "Earn", icon: Wallet, detail: "Keep 70% of eligible sales." }
];

export function HomeProducerInvitation() {
  const [active, setActive] = useState(0);

  return <section className="shell py-10 sm:py-14" aria-labelledby="producer-invitation-title">
    <div className="force-dark relative isolate min-h-[390px] overflow-hidden rounded-[2rem] bg-[#090a0c] text-white shadow-[0_30px_90px_rgba(0,0,0,.28)]">
      <div className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1600&q=80')" }} />
      <img src="https://media3.giphy.com/media/T9aOBkDuHGMaC0J2kP/giphy.gif" alt="" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-40 grayscale motion-reduce:hidden" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(5,6,8,.98)_5%,rgba(5,6,8,.82)_53%,rgba(5,6,8,.45))]" />
      <div className="absolute -right-20 top-[-45%] -z-10 h-[150%] w-[52%] rotate-[12deg] border-l border-white/15 bg-white/[.04] backdrop-blur-[2px]" />

      <div className="grid min-h-[390px] px-6 py-8 sm:px-10 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:px-14">
        <div className="relative z-10 max-w-xl py-4">
          <h2 id="producer-invitation-title" className="text-4xl font-semibold leading-[.96] tracking-[-.055em] sm:text-6xl">Your beats deserve<br /><span className="text-white/55">a bigger room.</span></h2>
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/65">Open your store. Let the right artist press play.</p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <Link href="/producer-login" className="group inline-flex items-center gap-5 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:bg-white/90">Start selling<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
            <Link href="/beat-store" className="border-b border-white/35 pb-1 text-xs text-white/70 transition hover:text-white">See the marketplace</Link>
          </div>
        </div>

        <div className="relative mt-8 flex justify-center lg:mt-0 lg:justify-end lg:pr-10">
          <div className="pointer-events-none absolute inset-8 rounded-full bg-white/[.07] blur-3xl" />
          <div className="relative w-[250px] max-w-full rotate-[5deg] rounded-[2.5rem] border border-white/35 bg-gradient-to-br from-[#686b71] via-[#1a1b1e] to-[#45484f] p-[5px] shadow-[18px_28px_65px_rgba(0,0,0,.65),inset_0_0_0_1px_rgba(255,255,255,.2)] transition-transform duration-500 hover:rotate-0 focus-within:rotate-0 motion-reduce:transition-none">
            <span aria-hidden="true" className="absolute -left-[3px] top-20 h-10 w-[3px] rounded-l bg-[#666970]" />
            <span aria-hidden="true" className="absolute -right-[3px] top-24 h-14 w-[3px] rounded-r bg-[#666970]" />
            <div className="overflow-hidden rounded-[2.2rem] border border-black bg-[#0b0c0f] px-4 pb-3 pt-3">
              <div aria-hidden="true" className="flex items-center justify-between px-1 text-[9px] font-semibold text-white/70"><span>9:41</span><span className="h-5 w-[68px] rounded-full bg-black shadow-[inset_0_0_0_1px_#222]" /><span className="h-2 w-4 rounded-sm border border-white/60 bg-white/50" /></div>
              <div className="mb-3 mt-4 flex items-center justify-between"><strong className="text-sm tracking-[-.04em]">HYMN</strong><span className="text-[8px] uppercase tracking-[.18em] text-white/40">Store preview</span></div>
              <div className="relative grid h-[125px] place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_30%_10%,#747a85,#272a31_45%,#111216_80%)]">
                <span aria-hidden="true" className="absolute -right-8 -top-8 h-36 w-36 rounded-full border border-white/10" />
                <span aria-hidden="true" className="grid h-24 w-24 place-items-center rounded-full border border-white/15 bg-[repeating-radial-gradient(circle,#08090b_0_4px,#252830_5px_6px)] shadow-[8px_12px_22px_rgba(0,0,0,.6)]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#d5d8dd] text-black"><Play className="ml-0.5 h-3 w-3 fill-current" /></span></span>
              </div>
              <div className="mt-3"><p className="text-base font-semibold tracking-tight">Your sound. Your store.</p><p className="mt-1 text-[10px] text-white/45">Original beats, ready for their next record.</p></div>
              <div className="my-3 flex items-center gap-1" aria-hidden="true">{[7,12,8,17,22,10,15,24,13,8,20,16,9,22,14,7,18,11,15,7].map((height, index) => <span key={index} className={`flex-1 rounded-full ${index < 8 ? "bg-white/80" : "bg-white/20"}`} style={{ height }} />)}</div>
              <div className="grid grid-cols-3 gap-1 border-y border-white/10 py-2" aria-label="Explore selling steps">
                {steps.map((step, index) => <button key={step.name} type="button" onClick={() => setActive(index)} aria-pressed={active === index} className={`flex flex-col items-center gap-1.5 rounded-lg px-2 py-2 text-[10px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active === index ? "bg-white text-black" : "text-white/50 hover:bg-white/10 hover:text-white"}`}><step.icon className="h-3.5 w-3.5" />{step.name}</button>)}
              </div>
              <p className="min-h-9 pt-3 text-center text-[10px] text-white/65" aria-live="polite">{steps[active].detail}</p>
              <div aria-hidden="true" className="mx-auto mt-2 h-1 w-20 rounded-full bg-white/60" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
