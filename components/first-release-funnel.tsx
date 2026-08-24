"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, LockKeyhole, Music2, ShieldCheck } from "lucide-react";
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
  const offerUsed = eligibility.authenticated && !eligibility.eligible;

  return <main className="first-release-page relative h-[100svh] overflow-hidden">
    <div className="first-release-aurora pointer-events-none absolute inset-0" />
    <section className={`first-release-layout relative mx-auto grid min-h-[100svh] w-full max-w-5xl content-center px-5 py-6 sm:px-8 sm:py-10 ${offerUsed ? "first-release-layout-used" : ""}`}>
      <header className="first-release-brand">
        <Image src="/assets/hymnlogowhite.png" alt="HYMN music.in" width={176} height={58} priority className="first-release-logo mx-auto h-auto w-28 object-contain sm:w-36 lg:mx-0" />
        <span className="first-release-brand-note"><ShieldCheck aria-hidden="true" /> Secure artist distribution</span>
      </header>

      {offerUsed ? <div className="first-release-used text-center lg:text-left">
        <p className="first-release-eyebrow">Welcome back{eligibility.firstName ? `, ${eligibility.firstName}` : ""}</p>
        <h1>Ready for your next release?</h1>
        <p>Your one-time free release has been used. Continue with a release from ₹99, or choose a plan that fits your schedule.</p>
        <div className="first-release-used-actions"><button onClick={() => router.push("/distribution/start")} className="first-release-primary">Start another release <ArrowRight className="h-4 w-4" /></button><Link href="/distribution?manage=plans#distribution-pricing" className="first-release-secondary">View plans</Link></div>
      </div> : <>
        <div className="first-release-hero text-center lg:text-left">
          <p className="first-release-eyebrow">{eligibility.authenticated ? `Welcome, ${eligibility.firstName}` : "Your music. Your account. Your control."}</p>
          <div className="first-release-free-lockup" aria-label="₹99 reduced to free for this release">
            <div className="first-release-stamp-stage">
              <span className="first-release-stamp-old">₹99<i /></span>
              <span className="first-release-free-word">FREE</span>
            </div>
            <span className="first-release-free-caption">Your first release is on us.</span>
          </div>
          <div className="first-release-offer-copy">
            <p><strong>Release one Single for ₹0.</strong> We cover the ₹99 base distribution fee.</p>
            <p><span>Single release only</span><span>Optional add-ons shown upfront</span></p>
          </div>
        </div>

        <aside className="first-release-trust-card text-left">
          <div className="first-release-trust-head">
            <span className="first-release-shield"><ShieldCheck /></span>
            <div><p>Your account stays protected</p><p>Google handles sign-in. HYMN never sees or stores your Google password.</p></div>
          </div>
          <div className="first-release-trust-points">
            <p><LockKeyhole /> No card required to start</p>
            <p><BadgeCheck /> Offer confirmed before submission</p>
            <p><Check /> Draft saved privately to your account</p>
          </div>
          <div className="first-release-auth">{eligibility.authenticated ? <button onClick={start} className="first-release-primary w-full">Start distribution <ArrowRight className="h-4 w-4" /></button> : <div onClick={() => void track("login_started")}><GoogleAuthButton label="Continue securely with Google" expectedRole="customer" onAuthenticated={() => { void track("login_completed"); router.push(startHref); router.refresh(); }} /></div>}</div>
          <p className="first-release-disclaimer">Secure sign-in · No password shared · No card required</p>
        </aside>
      </>}

      <div className="first-release-stores"><Music2 /> Spotify <span>·</span> Apple Music <span>·</span> YouTube Music</div>
    </section>
  </main>;
}
