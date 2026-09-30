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

        <div className="relative mt-10 min-h-[275px] lg:mt-0">
          <div className="absolute left-[2%] top-1 w-[78%] rotate-[-3deg] rounded-[1.4rem] border border-white/15 bg-black/55 p-5 shadow-[0_24px_70px_rgba(0,0,0,.45)] backdrop-blur-xl transition duration-300 hover:rotate-0">
            <div className="flex items-center justify-between"><span className="rounded-full border border-white/15 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[.18em] text-white/55">Your storefront</span><span className="flex items-center gap-1.5 text-[9px] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-white" />Live preview</span></div>
            <div className="mt-5 flex items-center gap-4">
              <span className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full border border-white/20 bg-[repeating-radial-gradient(circle,#08090b_0_5px,#252830_6px_7px)] shadow-[0_8px_22px_rgba(0,0,0,.5)]"><span className="grid h-7 w-7 place-items-center rounded-full bg-white text-black"><Play className="ml-0.5 h-3 w-3 fill-current" /></span></span>
              <div className="min-w-0 flex-1"><p className="truncate text-lg font-semibold">Your next placement</p><p className="mt-1 text-xs text-white/45">Preview · 02:41</p><div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[42%] rounded-full bg-white/70" /></div></div>
              <div className="text-right"><p className="text-[9px] uppercase tracking-[.16em] text-white/35">From</p><p className="mt-1 text-lg font-semibold">₹120</p></div>
            </div>
          </div>

          <div className="absolute bottom-1 right-0 w-[82%] rotate-[2deg] rounded-[1.4rem] border border-white/20 bg-[#17191e]/90 p-4 shadow-[0_25px_70px_rgba(0,0,0,.45)] backdrop-blur-2xl transition duration-300 hover:rotate-0">
            <div className="relative grid grid-cols-3 before:absolute before:left-[16%] before:right-[16%] before:top-5 before:h-px before:bg-white/15">
              {steps.map((step, index) => <button key={step.name} type="button" onClick={() => setActive(index)} aria-pressed={active === index} className="relative z-10 flex flex-col items-center text-center"><span className={`grid h-10 w-10 place-items-center rounded-full border transition ${active === index ? "border-white bg-white text-black shadow-[0_0_24px_rgba(255,255,255,.2)]" : "border-white/20 bg-[#111216] text-white/55 hover:border-white/50"}`}><step.icon className="h-4 w-4" /></span><strong className={`mt-2 text-[10px] ${active === index ? "text-white" : "text-white/45"}`}>{step.name}</strong></button>)}
            </div>
            <p className="mt-3 border-t border-white/10 pt-3 text-center text-xs text-white/65" aria-live="polite">{steps[active].detail}</p>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
