"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, LockKeyhole, Music2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { FirstReleaseReceipt } from "@/components/first-release-receipt";
import { distributionPlanCards } from "@/lib/distribution-plans";

type Eligibility = { authenticated: boolean; eligible: boolean; reason: string; firstName?: string };
type Query = Record<string, string | undefined>;

function releaseState(eligibility: Eligibility) {
  if (!eligibility.authenticated) return { status: "UNCLAIMED", cta: "RELEASE MY TRACK — ₹0", event: "first_release_primary_cta_clicked" };
  if (eligibility.eligible) return { status: "READY TO CLAIM", cta: "CLAIM MY FREE RELEASE", event: "first_release_primary_cta_clicked" };
  if (eligibility.reason === "reserved") return { status: "IN PROGRESS", cta: "CONTINUE MY RELEASE", event: "first_release_resumed" };
  if (eligibility.reason === "release_already_submitted" || eligibility.reason === "already_redeemed") return { status: "CLAIMED", cta: "RELEASE ANOTHER TRACK — ₹99", event: "first_release_plan_cta_clicked" };
  return { status: "MEMBER", cta: "START NEW RELEASE", event: "first_release_primary_cta_clicked" };
}

export function FirstReleaseFunnel({ eligibility, query }: { eligibility: Eligibility; query: Query }) {
  const router = useRouter();
  const [authIntent, setAuthIntent] = useState(false);
  const viewedRef = useRef(false);
  const attribution = useMemo(() => Object.fromEntries(Object.entries(query).filter(([, value]) => Boolean(value))), [query]);
  const track = useCallback((event: string) => fetch("/api/promotions/first-release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, attribution }) }).catch(() => undefined), [attribution]);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void track("first_release_page_viewed");
  }, [track]);

  const startHref = useMemo(() => {
    const params = new URLSearchParams({ campaign: "first-release" });
    for (const [key, value] of Object.entries(attribution)) if (value) params.set(key, value);
    return `/distribution/start?${params}`;
  }, [attribution]);
  const state = releaseState(eligibility);
  const isUsed = state.status === "CLAIMED" || state.status === "MEMBER";
  const begin = () => {
    void track(state.event);
    if (!eligibility.authenticated) {
      setAuthIntent(true);
      void track("first_release_auth_started");
      document.getElementById("first-release-account")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    router.push(isUsed ? "/distribution/start" : startHref);
  };
  const referralCode = query.referral_code || query.ref;

  return <main className="first-release-page">
    <section className="first-release-shell">
      <header className="first-release-header">
        <Image src="/assets/hymnlogowhite.png" alt="HYMN music.in" width={172} height={56} priority className="first-release-logo" />
        <Link href="/login" className="first-release-login">Log in</Link>
      </header>

      <section className="first-release-hero-grid" aria-labelledby="first-release-title">
        <div className="first-release-copy">
          <p className="first-release-eyebrow">MUSIC DISTRIBUTION FOR INDEPENDENT ARTISTS</p>
          <h1 id="first-release-title">YOUR FIRST RELEASE<br />IS ON US.</h1>
          <div className="first-release-price" aria-label="Standard distribution price 99 rupees, today zero rupees">
            <span><small>STANDARD DISTRIBUTION</small><del>₹99</del></span>
            <strong><small>TODAY</small>₹0</strong>
          </div>
          <p className="first-release-lede">One eligible Single. HYMN covers the ₹99 base distribution fee.</p>
          <button type="button" className="first-release-cta" onClick={begin}>{state.cta}<ArrowRight aria-hidden="true" /></button>
          <p className="first-release-micro"><LockKeyhole aria-hidden="true" /> No card required · Secure Google sign-in</p>
          <div className="first-release-metadata" aria-label="Offer details"><span>01 RELEASE</span><span>SINGLE</span><span>₹0 TODAY</span></div>
          <p className="first-release-platforms"><Music2 aria-hidden="true" /> Spotify · Apple Music · YouTube Music · JioSaavn · Amazon Music</p>
        </div>

        <aside className="first-release-pass" aria-label="HYMN First Release Pass">
          <div className="first-release-pass-head"><span>HYMN FIRST RELEASE PASS</span><b>01/01</b></div>
          <div className="first-release-pass-title">FIRST SINGLE</div>
          <FirstReleaseReceipt />
          <div className="first-release-product-status"><p>PRODUCT STATUS</p>{["Artwork", "Audio", "Metadata"].map(item => <span key={item}>{item}<Check aria-hidden="true" /></span>)}<em>Ready to begin your release</em></div>
          <div id="first-release-account" className="first-release-pass-account"><p>YOUR ACCOUNT</p>{!eligibility.authenticated && authIntent && <p className="first-release-auth-prompt">Sign in to claim your free release.</p>}{eligibility.authenticated ? <button type="button" onClick={begin}>{state.cta}<ArrowRight aria-hidden="true" /></button> : <GoogleAuthButton label="Continue with Google" expectedRole="customer" referralCode={referralCode} appearance="quiet" onAuthenticated={() => { void track("first_release_auth_completed"); router.push(startHref); router.refresh(); }} />}</div>
          <p className="first-release-pass-security">Secure sign-in · HYMN never receives your Google password</p>
          <div className="first-release-pass-foot">STATUS: <b>{state.status}</b></div>
        </aside>
      </section>

      <section className="first-release-section first-release-catch">
        <p className="first-release-eyebrow">SO, WHAT'S THE CATCH?</p><h2>There isn't a subscription hiding behind the button.</h2>
        <div className="first-release-three"><article><b>₹0 DISTRIBUTION FEE</b><p>Your first eligible Single's ₹99 base distribution fee is covered by HYMN.</p></article><article><b>NO CARD REQUIRED</b><p>You do not need payment details to start your eligible free release.</p></article><article><b>YOUR NEXT RELEASE IS YOUR CHOICE</b><p>Release individually or choose a HYMN plan later.</p></article></div>
      </section>

      <section className="first-release-section first-release-journey"><p className="first-release-eyebrow">HOW YOUR RELEASE MOVES</p><h2>From upload to live.</h2><div className="first-release-steps">{[["01", "UPLOAD"], ["02", "HYMN REVIEW"], ["03", "DISTRIBUTION"], ["04", "LIVE"]].map(([number, label]) => <div key={number}><b>{number}</b><span>{label}</span></div>)}</div><div className="first-release-proof"><div className="first-release-proof-art">HYMN<br />01</div><div><b>YOUR RELEASE</b><p>Artwork <Check /> &nbsp; Audio <Check /> &nbsp; Metadata <Check /></p><strong>READY FOR REVIEW</strong></div></div></section>

      <section className="first-release-section first-release-why"><p className="first-release-eyebrow">WHY IS THE FIRST RELEASE FREE?</p><h2>We want artists to judge HYMN by the actual experience, not a sales pitch.</h2><p>Your first eligible release lets you use the HYMN workflow before deciding how you want to release future music.</p></section>

      <section className="first-release-section first-release-next"><p className="first-release-eyebrow">WHAT HAPPENS AFTER RELEASE #1?</p><h2>Your next release stays on your terms.</h2><div className="first-release-plan-list">{distributionPlanCards.slice(0, 3).map((plan) => <div key={plan.key}><b>{plan.title}</b><span>₹{plan.price}{plan.key === "one_time" ? " / Single" : ""}</span></div>)}</div><Link href="/distribution?manage=plans#distribution-pricing" className="first-release-plan-link" onClick={() => void track("first_release_plan_cta_clicked")}>Compare plans <ArrowRight aria-hidden="true" /></Link></section>

      <section className="first-release-section first-release-faq"><p className="first-release-eyebrow">FIRST RELEASE FAQ</p><h2>Clear before you begin.</h2>{[["Is the first release actually free?", "For an eligible account, HYMN covers the ₹99 base fee for one new Single. Optional add-ons, if selected, are shown before you submit."], ["Do I need a subscription or card?", "No subscription or payment card is required to start an eligible first release."], ["Can I release an EP or album for free?", "No. This offer applies to one eligible Single with one track."], ["Which stores are included?", "Your distribution options are shown in the release flow before submission."], ["Does HYMN own my music?", "Your rights remain yours, subject to the distribution terms you accept for your release."]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}<Link href="/faq" className="first-release-plan-link">Read full FAQ <ArrowRight aria-hidden="true" /></Link></section>

      <section className="first-release-final"><div><p>YOUR FIRST HYMN RELEASE</p><FirstReleaseReceipt totalLabel="TOTAL" /></div><button type="button" className="first-release-cta" onClick={begin}>RELEASE MY TRACK FREE <ArrowRight aria-hidden="true" /></button><small>No card required · One eligible Single</small></section>
      <footer className="first-release-footer"><span>© {new Date().getFullYear()} HYMN Music</span><nav aria-label="First release information"><Link href="/terms-of-service">Terms</Link><Link href="/privacy-policy">Privacy</Link><Link href="/policies/distribution">Distribution terms</Link><Link href="/contact">Support</Link></nav></footer>
    </section>
  </main>;
}
