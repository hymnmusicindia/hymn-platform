"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Music2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthButton } from "@/components/google-auth-button";

type Eligibility = { authenticated: boolean; eligible: boolean; reason: string; firstName?: string };

export function FirstReleaseFunnel({ eligibility, query }: { eligibility: Eligibility; query: Record<string, string | undefined> }) {
  const router = useRouter();
  const attribution = useMemo(() => Object.fromEntries(Object.entries(query).filter(([key, value]) => key.startsWith("utm_") && value)), [query]);
  const track = useCallback((event: string) => fetch("/api/promotions/first-release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, attribution }) }).catch(() => undefined), [attribution]);
  useEffect(() => { void track("landing_view"); }, [track]);

  const startHref = `/distribution/start?campaign=first-release${Object.entries(attribution).map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("")}`;
  const start = () => { void track("release_started"); router.push(startHref); };

  return <main className="first-release-page relative min-h-[100svh] overflow-hidden bg-[#080a0d] text-white">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(89,223,224,.13),transparent_32%),linear-gradient(180deg,#0d1116_0%,#080a0d_65%)]" />
    <section className="relative mx-auto flex min-h-[100svh] w-full max-w-xl flex-col items-center justify-center px-5 py-8 text-center sm:px-8">
      <Image src="/assets/hymnlogowhite.png" alt="HYMN" width={176} height={58} priority className="h-auto w-32 object-contain sm:w-40" />
      <div className="mt-12 w-full">
        {eligibility.authenticated && !eligibility.eligible ? <>
          <p className="text-xs font-semibold uppercase tracking-[.28em] text-white/50">Single distribution</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-[-.055em] sm:text-6xl">Starting from ₹99</h1>
          <p className="mx-auto mt-5 max-w-sm text-base leading-7 text-white/65">You’ve already used your first-release offer.</p>
          <div className="mt-9 grid gap-3"><button onClick={() => router.push("/distribution/start")} className="min-h-14 rounded-2xl bg-white px-6 font-semibold text-black">Start another release <ArrowRight className="ml-2 inline h-4 w-4" /></button><Link href="/distribution?manage=plans#distribution-pricing" className="min-h-12 rounded-2xl border border-white/15 px-6 py-3 font-semibold text-white/80">View plans</Link></div>
        </> : <>
          {eligibility.authenticated ? <p className="mb-5 text-sm text-white/55">Welcome, {eligibility.firstName}</p> : null}
          <p className="first-release-free-enter text-[clamp(4.7rem,24vw,8.5rem)] font-black leading-[.78] tracking-[-.085em]">FREE</p>
          <p className="mt-7 text-xl font-semibold tracking-[-.025em] sm:text-2xl">Your first release is on us.</p>
          <p className="first-release-strike mx-auto mt-4 w-fit text-base text-white/45"><span>Starting from ₹99</span></p>
          <p className="mx-auto mt-6 max-w-sm text-sm leading-6 text-white/58 sm:text-base">Distribute your first Single through HYMN without paying the ₹99 base release fee. Optional add-ons remain chargeable.</p>
          <div className="mt-9">
            {eligibility.authenticated ? <button onClick={start} className="min-h-14 w-full rounded-2xl bg-white px-6 font-semibold text-black shadow-[0_24px_80px_rgba(255,255,255,.12)]">Start distribution <ArrowRight className="ml-2 inline h-4 w-4" /></button> : <div onClick={() => void track("login_started")}><GoogleAuthButton label="Release for free" expectedRole="customer" onAuthenticated={() => { void track("login_completed"); router.push(startHref); router.refresh(); }} /></div>}
          </div>
          {!eligibility.authenticated ? <p className="mt-4 text-xs leading-5 text-white/42">Sign in with Google to save your release and claim your one-time offer.</p> : <p className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-300"><Check className="h-4 w-4" /> Your free first release is unlocked</p>}
        </>}
      </div>
      <div className="mt-12 flex items-center gap-2 text-[.68rem] uppercase tracking-[.18em] text-white/35"><Music2 className="h-4 w-4" /> Spotify · Apple Music · YouTube Music</div>
    </section>
  </main>;
}
