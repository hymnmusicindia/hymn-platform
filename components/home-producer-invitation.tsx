"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Disc3, Pause, Play, Upload, SlidersHorizontal, Wallet } from "lucide-react";

const steps = [
  { name: "Upload", icon: Upload, detail: "Add your beat, cover and files." },
  { name: "Price", icon: SlidersHorizontal, detail: "Choose your licence prices." },
  { name: "Earn", icon: Wallet, detail: "Keep 70% of eligible sales." }
];

export function HomeProducerInvitation() {
  const [active, setActive] = useState(0);
  const [motion, setMotion] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setMotion(!query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return <section className="shell py-10 sm:py-14" aria-labelledby="producer-invitation-title">
    <div className="force-dark relative isolate min-h-[390px] overflow-hidden rounded-[2rem] bg-[#090a0c] text-white shadow-[0_30px_90px_rgba(0,0,0,.28)]">
      <div className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1600&q=80')" }} />
      {motion && !failed ? <img src="https://media3.giphy.com/media/T9aOBkDuHGMaC0J2kP/giphy.gif" alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 -z-20 h-full w-full object-cover opacity-35 grayscale" /> : null}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(5,6,8,.98)_5%,rgba(5,6,8,.82)_53%,rgba(5,6,8,.45))]" />
      <div className="absolute -right-20 top-[-45%] -z-10 h-[150%] w-[52%] rotate-[12deg] border-l border-white/15 bg-white/[.04] backdrop-blur-[2px]" />

      <div className="grid min-h-[390px] px-6 py-8 sm:px-10 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:px-14">
        <div className="relative z-10 max-w-xl py-4">
          <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.24em] text-white/55"><Disc3 className="h-4 w-4" />HYMN for producers</p>
          <h2 id="producer-invitation-title" className="mt-5 text-4xl font-semibold leading-[.96] tracking-[-.055em] sm:text-6xl">Be heard.<br /><span className="text-white/55">Get paid.</span></h2>
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/65">Put your beats where artists are looking.</p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <Link href="/producer-login" className="group inline-flex items-center gap-5 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:bg-white/90">Start selling<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
            <Link href="/beat-store" className="border-b border-white/35 pb-1 text-xs text-white/70 transition hover:text-white">See the marketplace</Link>
          </div>
        </div>

        <div className="relative mt-10 min-h-[275px] lg:mt-0">
          <div className="absolute right-0 top-0 flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[.2em] text-white/40">Studio motion</span>
            <button type="button" onClick={() => setMotion(value => !value)} aria-label={motion ? "Pause producer background" : "Play producer background"} className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/20 backdrop-blur-md transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{motion ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}</button>
          </div>

          <div className="absolute left-[6%] top-10 w-[68%] rotate-[-3deg] rounded-2xl border border-white/15 bg-black/45 p-5 shadow-[0_24px_70px_rgba(0,0,0,.45)] backdrop-blur-xl transition duration-300 hover:rotate-0">
            <div className="flex items-center justify-between"><span className="text-[9px] uppercase tracking-[.2em] text-white/45">New listing</span><span className="h-2 w-2 rounded-full bg-white" /></div>
            <div className="mt-7 flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_35%_30%,#747b86,#15171c_48%,#050506_50%)]"><Disc3 className="h-5 w-5 text-white/75" /></span><div><p className="font-semibold">Your beat title</p><p className="mt-1 text-xs text-white/45">Ready for artists to discover</p></div></div>
            <div className="mt-6 flex h-5 items-end gap-1" aria-hidden="true">{[6,12,8,18,11,15,7,20,10,16,8,13,19,9,14,6,17,11,20,8].map((height, index) => <span key={index} className="w-1 flex-1 rounded-full bg-white/35" style={{ height }} />)}</div>
          </div>

          <div className="absolute bottom-2 right-0 w-[72%] rotate-[2deg] rounded-2xl border border-white/20 bg-white/[.09] p-3 shadow-[0_25px_70px_rgba(0,0,0,.45)] backdrop-blur-2xl transition duration-300 hover:rotate-0">
            <div className="grid grid-cols-3 gap-2">
              {steps.map((step, index) => <button key={step.name} type="button" onClick={() => setActive(index)} aria-pressed={active === index} className={`min-h-24 rounded-xl p-3 text-left transition ${active === index ? "bg-white text-black" : "bg-black/25 text-white hover:bg-white/10"}`}><step.icon className="h-4 w-4" /><strong className="mt-4 block text-xs">{step.name}</strong><span className={`mt-1 block text-[9px] leading-4 ${active === index ? "text-black/55" : "text-white/40"}`}>{step.detail}</span></button>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
