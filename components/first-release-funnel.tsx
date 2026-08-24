"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, LockKeyhole, Music2, ShieldCheck, Sparkles } from "lucide-react";
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

  return <main className="first-release-page relative min-h-[100svh] overflow-hidden bg-[#070a0d] text-white">
    <div className="first-release-aurora pointer-events-none absolute inset-0" />
    <section className="relative mx-auto grid min-h-[100svh] w-full max-w-5xl content-center gap-7 px-4 py-7 sm:px-8 sm:py-10 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:gap-14">
      <div className="text-center lg:text-left">
        <Image src="/assets/hymnlogowhite.png" alt="HYMN music.in" width={176} height={58} priority className="mx-auto h-auto w-28 object-contain sm:w-36 lg:mx-0" />
        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-[.68rem] font-semibold uppercase tracking-[.14em] text-emerald-200 sm:text-xs"><Sparkles className="h-3.5 w-3.5" /> First release welcome offer</div>
        {eligibility.authenticated && !eligibility.eligible ? <div className="mt-6">
          <h1 className="text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Ready for your next release?</h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/65 lg:mx-0">Your first-release offer has already been used. Start another release from ₹99 or compare a plan.</p>
          <div className="mx-auto mt-8 grid max-w-md gap-3 sm:grid-cols-2 lg:mx-0"><button onClick={() => router.push("/distribution/start")} className="first-release-primary">Start another release <ArrowRight className="h-4 w-4" /></button><Link href="/distribution?manage=plans#distribution-pricing" className="first-release-secondary">View plans</Link></div>
        </div> : <>
          <div className="mt-6"><p className="text-sm font-medium text-white/55">{eligibility.authenticated ? `Welcome, ${eligibility.firstName}` : "A genuine welcome from HYMN"}</p><h1 className="mt-3 text-[clamp(2.7rem,11vw,5.4rem)] font-semibold leading-[.96] tracking-[-.065em]">Release your first single <span className="text-emerald-300">free.</span></h1><p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-white/62 sm:text-base sm:leading-7 lg:mx-0">We’ll cover the ₹99 base distribution fee for your first Single. You keep control of your music; optional add-ons are always shown before checkout.</p></div>
          <div className="first-release-price-stage mx-auto mt-7 lg:mx-0" aria-label="₹99 reduced to free"><div className="first-release-old-price"><span>₹99</span><i /></div><ArrowRight className="first-release-price-arrow h-5 w-5" aria-hidden="true" /><div className="first-release-free-price">FREE</div><span className="first-release-on-us">ON US</span></div>
        </>}
      </div>
      {!(eligibility.authenticated && !eligibility.eligible) ? <aside className="first-release-trust-card mx-auto w-full max-w-md text-left">
        <div className="flex items-start gap-3 border-b border-white/10 pb-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-300/12 text-emerald-300"><ShieldCheck className="h-6 w-6" /></span><div><p className="font-semibold">Your account stays protected</p><p className="mt-1 text-sm leading-6 text-white/55">Continue through Google’s secure sign-in window. HYMN never sees or stores your Google password.</p></div></div>
        <div className="mt-5 grid gap-3 text-sm text-white/72"><p className="flex items-center gap-3"><LockKeyhole className="h-4 w-4 text-emerald-300" /> No card required to start</p><p className="flex items-center gap-3"><BadgeCheck className="h-4 w-4 text-emerald-300" /> Offer confirmed before submission</p><p className="flex items-center gap-3"><Check className="h-4 w-4 text-emerald-300" /> Draft saved privately to your account</p></div>
        <div className="mt-6">{eligibility.authenticated ? <button onClick={start} className="first-release-primary w-full">Start with your tracks <ArrowRight className="h-4 w-4" /></button> : <div onClick={() => void track("login_started")}><GoogleAuthButton label="Continue securely with Google" expectedRole="customer" onAuthenticated={() => { void track("login_completed"); router.push(startHref); router.refresh(); }} /></div>}</div>
        <p className="mt-4 text-center text-[.7rem] leading-5 text-white/38">By continuing, you create or access your HYMN artist account. No password is shared with us.</p>
      </aside> : null}
      <div className="flex items-center justify-center gap-2 text-[.62rem] uppercase tracking-[.14em] text-white/30 lg:col-span-2 sm:text-xs"><Music2 className="h-4 w-4" /> Deliver to Spotify · Apple Music · YouTube Music</div>
    </section>
  </main>;
}
