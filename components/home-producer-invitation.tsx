"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, Check, FileAudio, IndianRupee, Play, SlidersHorizontal, Upload, UserRound, Wallet } from "lucide-react";

const stages = [
  { name: "Upload", icon: Upload, detail: "Your files are ready", tone: "#8fc7ff" },
  { name: "Set price", icon: SlidersHorizontal, detail: "WAV licence · ₹1,200", tone: "#c8a8ff" },
  { name: "Go live", icon: BadgeCheck, detail: "Visible to artists", tone: "#8ff0c4" },
  { name: "Earn", icon: Wallet, detail: "New licensed sale", tone: "#f3d47b" }
] as const;

const waveform = [7, 13, 9, 18, 25, 12, 17, 28, 14, 9, 23, 18, 11, 25, 16, 8, 20, 12, 17, 8];

export function HomeProducerInvitation() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % stages.length), 2100);
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion]);

  const stage = stages[active];
  return <section className="shell py-10 sm:py-14" aria-labelledby="producer-invitation-title">
    <div className="force-dark relative isolate overflow-hidden rounded-[2rem] bg-[#07090d] text-white shadow-[0_30px_90px_rgba(0,0,0,.28)]">
      <div className="absolute inset-0 -z-30 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1800&q=84')" }} />
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(100deg,rgba(4,6,10,.99)_2%,rgba(4,6,10,.9)_45%,rgba(4,6,10,.57)_100%)]" />
      <div className="absolute inset-0 -z-10 opacity-60 [background-image:radial-gradient(circle_at_75%_20%,rgba(105,167,255,.22),transparent_25%),radial-gradient(circle_at_88%_78%,rgba(151,99,255,.18),transparent_28%)]" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-[.13] [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(90deg,transparent,black_55%,black)]" />

      <div className="grid min-h-[430px] gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-14 lg:py-8">
        <div className="relative z-20 max-w-xl py-4">
          <div className="mb-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.22em] text-white/55"><span className="h-px w-9 bg-white/35" />Built for independent producers</div>
          <h2 id="producer-invitation-title" className="text-4xl font-semibold leading-[.94] tracking-[-.055em] sm:text-6xl">Put your beats<br /><span className="bg-gradient-to-r from-[#b9d9ff] via-white to-[#c9b3ff] bg-clip-text text-transparent">in artists’ hands.</span></h2>
          <p className="mt-5 max-w-md text-sm leading-6 text-white/65 sm:text-base">Upload your catalogue, set your licence prices, and earn when an artist finds their next record.</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link href="/producer-login" className="group inline-flex items-center gap-5 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black shadow-[0_10px_35px_rgba(255,255,255,.13)] transition hover:-translate-y-0.5 hover:bg-[#eef4ff]">Upload your first beat<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
            <Link href="/beat-store" className="rounded-full border border-white/15 bg-white/[.04] px-5 py-3 text-xs text-white/75 backdrop-blur transition hover:border-white/30 hover:text-white">See artists’ view</Link>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-white/55">{["You set the price", "Flexible licences", "Keep 70% of eligible sales"].map(item => <span key={item} className="flex items-center gap-1.5"><Check className="h-3 w-3 text-[#8ff0c4]" />{item}</span>)}</div>
        </div>

        <div className="relative z-10 min-h-[390px]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="pointer-events-none absolute inset-x-[12%] inset-y-[18%] rounded-full bg-[#7aa9ff]/15 blur-[70px]" />
          <div className="absolute left-0 right-0 top-1/2 hidden h-px bg-gradient-to-r from-transparent via-white/25 to-transparent md:block" aria-hidden="true" />

          <motion.div aria-hidden="true" animate={reduceMotion ? undefined : { y: [0, -7, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }} className="absolute left-[1%] top-[10%] z-20 hidden w-[190px] rounded-2xl border border-white/15 bg-[#11151c]/85 p-3.5 shadow-[0_18px_40px_rgba(0,0,0,.4)] backdrop-blur-xl sm:block">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#92c8ff]/15 text-[#a9d5ff]"><FileAudio className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-xs font-semibold">MIDNIGHT.wav</p><p className="mt-1 text-[9px] uppercase tracking-[.12em] text-white/40">92 BPM · C minor</p></div></div>
            <div className="mt-3 flex items-end gap-[3px]">{waveform.slice(0, 14).map((height, index) => <span key={index} className="w-1 rounded-full bg-[#a9d5ff]/70" style={{ height: Math.max(3, height * .55) }} />)}</div>
            <motion.div initial={false} animate={{ width: active >= 1 ? "100%" : "18%" }} className="mt-3 h-0.5 rounded-full bg-[#92c8ff]" />
          </motion.div>

          <motion.div animate={reduceMotion ? undefined : { y: [0, 6, 0] }} transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: .4 }} className="absolute bottom-[9%] right-0 z-30 hidden w-[205px] rounded-2xl border border-white/15 bg-[#11151c]/90 p-3.5 shadow-[0_18px_45px_rgba(0,0,0,.48)] backdrop-blur-xl sm:block">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><UserRound className="h-4 w-4" /></span><div><p className="text-[10px] font-semibold">Artist licensed your beat</p><p className="mt-0.5 text-[8px] text-white/40">WAV commercial licence</p></div></div><BadgeCheck className="h-4 w-4 text-[#8ff0c4]" /></div>
            <div className="mt-3 flex items-end justify-between border-t border-white/10 pt-3"><span className="text-[9px] uppercase tracking-[.12em] text-white/35">Producer share</span><strong className="flex items-center text-base text-[#f3d47b]"><IndianRupee className="h-3.5 w-3.5" />840</strong></div>
            <motion.span initial={false} animate={{ opacity: active === 3 ? 1 : .25, scale: active === 3 ? 1 : .96 }} className="absolute inset-0 -z-10 rounded-2xl ring-1 ring-[#f3d47b]/50 shadow-[0_0_30px_rgba(243,212,123,.18)]" />
          </motion.div>

          <div className="relative mx-auto w-[238px] rounded-[2.45rem] border border-white/40 bg-gradient-to-br from-[#777b84] via-[#181a20] to-[#4b4f58] p-[5px] shadow-[18px_28px_65px_rgba(0,0,0,.68),inset_0_0_0_1px_rgba(255,255,255,.2)] sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
            <span aria-hidden="true" className="absolute -left-[3px] top-20 h-10 w-[3px] rounded-l bg-[#666970]" /><span aria-hidden="true" className="absolute -right-[3px] top-24 h-14 w-[3px] rounded-r bg-[#666970]" />
            <div className="overflow-hidden rounded-[2.12rem] border border-black bg-[#090b0f] px-4 pb-3 pt-3">
              <div aria-hidden="true" className="flex items-center justify-between px-1 text-[8px] font-semibold text-white/70"><span>9:41</span><span className="h-5 w-[64px] rounded-full bg-black shadow-[inset_0_0_0_1px_#222]" /><span className="h-2 w-4 rounded-sm border border-white/60 bg-white/50" /></div>
              <div className="mb-3 mt-3 flex items-center justify-between"><strong className="text-xs tracking-[-.04em]">HYMN</strong><motion.span key={stage.name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-[7px] uppercase tracking-[.18em]" style={{ color: stage.tone }}>{stage.name}</motion.span></div>
              <div className="relative grid h-[116px] place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_30%_10%,#747a85,#272a31_45%,#111216_80%)]">
                <motion.div animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: "linear" }} className="grid h-24 w-24 place-items-center rounded-full border border-white/15 bg-[repeating-radial-gradient(circle,#08090b_0_4px,#252830_5px_6px)] shadow-[8px_12px_22px_rgba(0,0,0,.6)]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#e1e5ec] text-black"><Play className="ml-0.5 h-3 w-3 fill-current" /></span></motion.div>
                {active >= 2 ? <motion.span initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#8ff0c4] px-2 py-1 text-[7px] font-bold uppercase tracking-wider text-[#082419]"><BadgeCheck className="h-2.5 w-2.5" />Live</motion.span> : null}
              </div>
              <div className="mt-3 flex items-start justify-between gap-2"><div><p className="text-sm font-semibold tracking-tight">Midnight Run</p><p className="mt-0.5 text-[8px] text-white/40">Your storefront · WAV licence</p></div><strong className="text-xs text-[#f3d47b]">₹1,200</strong></div>
              <div className="my-3 flex items-center gap-1" aria-hidden="true">{waveform.map((height, index) => <motion.span key={index} className="flex-1 rounded-full" animate={{ height: active === 0 ? height : Math.max(5, height * .65), backgroundColor: index < (active + 1) * 5 ? stage.tone : "rgba(255,255,255,.16)" }} transition={{ duration: .45 }} />)}</div>
              <div className="grid grid-cols-4 gap-1 border-y border-white/10 py-2" aria-label="Beat selling journey">{stages.map((item, index) => <button key={item.name} type="button" onClick={() => setActive(index)} aria-pressed={active === index} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[7px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active === index ? "bg-white text-black" : index < active ? "text-white/75" : "text-white/35 hover:bg-white/10 hover:text-white"}`}><item.icon className="h-3 w-3" /><span className="truncate">{item.name}</span></button>)}</div>
              <motion.p key={stage.detail} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="min-h-8 pt-3 text-center text-[9px] font-medium" style={{ color: stage.tone }}>{stage.detail}</motion.p>
              <div aria-hidden="true" className="mx-auto mt-1 h-1 w-20 rounded-full bg-white/55" />
            </div>
          </div>

          <div className="absolute bottom-0 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[8px] uppercase tracking-[.14em] text-white/40 backdrop-blur sm:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8ff0c4] motion-reduce:animate-none" />From hard drive to paid licence</div>
        </div>
      </div>
    </div>
  </section>;
}
