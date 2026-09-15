"use client";

import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { FirstReleaseReceipt } from "@/components/first-release-receipt";

type Eligibility = { authenticated: boolean; eligible: boolean; reason: string; firstName?: string };
type Query = Record<string, string | undefined>;
type RevealState = "sealed" | "breaking" | "opening" | "revealing" | "revealed";

function releaseState(eligibility: Eligibility) {
  if (!eligibility.authenticated) return { status: "UNCLAIMED", cta: "RELEASE MY TRACK — ₹0", event: "first_release_primary_cta_clicked" };
  if (eligibility.eligible) return { status: "READY TO CLAIM", cta: "CLAIM MY FREE RELEASE", event: "first_release_primary_cta_clicked" };
  if (eligibility.reason === "reserved") return { status: "IN PROGRESS", cta: "CONTINUE MY RELEASE", event: "first_release_resumed" };
  if (eligibility.reason === "release_already_submitted" || eligibility.reason === "already_redeemed") return { status: "CLAIMED", cta: "RELEASE ANOTHER TRACK — ₹99", event: "first_release_plan_cta_clicked" };
  return { status: "MEMBER", cta: "START NEW RELEASE", event: "first_release_primary_cta_clicked" };
}

export function FirstReleaseFunnel({ eligibility, query }: { eligibility: Eligibility; query: Query }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const revealEnabled = process.env.NEXT_PUBLIC_FIRST_RELEASE_REVEAL_ENABLED !== "false";
  const [revealState, setRevealState] = useState<RevealState>(revealEnabled ? "sealed" : "revealed");
  const viewedRef = useRef(false);
  const hoveredRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const attribution = useMemo(() => Object.fromEntries(Object.entries(query).filter(([, value]) => Boolean(value))), [query]);
  const track = useCallback((event: string) => fetch("/api/promotions/first-release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, attribution }) }).catch(() => undefined), [attribution]);
  const state = releaseState(eligibility);
  const isUsed = state.status === "CLAIMED" || state.status === "MEMBER";
  const freeOfferAvailable = !isUsed;
  const referralCode = query.referral_code || query.ref;
  const startHref = useMemo(() => {
    const params = new URLSearchParams({ campaign: "first-release" });
    for (const [key, value] of Object.entries(attribution)) if (value) params.set(key, value);
    return `/distribution/start?${params}`;
  }, [attribution]);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void track("first_release_page_viewed");
    void track("first_release_envelope_impression");
  }, [track]);
  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), []);
  useEffect(() => {
    if (!revealEnabled || reduceMotion || sessionStorage.getItem("hymn:first-release-pass-revealed") === "1") setRevealState("revealed");
  }, [reduceMotion, revealEnabled]);

  const begin = () => {
    void track("first_release_pass_cta_clicked");
    void track(state.event);
    router.push(isUsed ? "/distribution/start" : startHref);
  };
  const schedule = (delay: number, next: RevealState, event?: string) => {
    timersRef.current.push(window.setTimeout(() => { setRevealState(next); if (event) void track(event); }, delay));
  };
  const openEnvelope = () => {
    if (revealState !== "sealed") return;
    void track("first_release_envelope_open_started");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
    if (reduceMotion) { setRevealState("revealed"); void track("first_release_envelope_open_completed"); void track("first_release_pass_revealed"); return; }
    setRevealState("breaking");
    schedule(260, "opening");
    schedule(720, "revealing");
    schedule(1700, "revealed", "first_release_envelope_open_completed");
    schedule(1750, "revealed", "first_release_pass_revealed");
    timersRef.current.push(window.setTimeout(() => sessionStorage.setItem("hymn:first-release-pass-revealed", "1"), 1700));
  };
  const passVisible = revealState === "opening" || revealState === "revealing" || revealState === "revealed";
  const envelopeFrame = passVisible ? "/assets/first-release-envelope-unsealed-v1.webp" : "/assets/first-release-envelope-closed-v1.webp";
  const pass = <aside className="first-release-pass" aria-label="HYMN First Release Pass">
    <div className="first-release-pass-head"><span>HYMN FIRST RELEASE PASS</span><b>01/01</b></div>
    <div className="first-release-pass-title">FIRST SINGLE</div>
    <FirstReleaseReceipt />
    <div className="first-release-product-status"><p>PRODUCT STATUS</p>{["Artwork", "Audio", "Metadata"].map(item => <span key={item}>{item}<Check aria-hidden="true" /></span>)}<em>Ready to begin your release</em></div>
    <div id="first-release-account" className="first-release-pass-account"><p>YOUR ACCOUNT</p>{eligibility.authenticated ? <button type="button" onClick={begin}>{state.cta}<ArrowRight aria-hidden="true" /></button> : <GoogleAuthButton label="Continue with Google" expectedRole="customer" referralCode={referralCode} appearance="quiet" onAuthenticated={() => { void track("first_release_auth_started"); void track("first_release_auth_completed"); router.push(startHref); router.refresh(); }} />}</div>
    <p className="first-release-pass-security">Secure sign-in · HYMN never receives your Google password</p>
    <div className="first-release-pass-foot">STATUS: <b>{state.status}</b></div>
  </aside>;

  return <main className={`first-release-page first-release-reveal-${revealState}`}>
    <section className="first-release-shell">
      <section className="first-release-hero-grid" aria-labelledby="first-release-title">
        <div className="first-release-copy">
          <p className="first-release-eyebrow">MUSIC DISTRIBUTION FOR INDEPENDENT ARTISTS</p>
          <h1 id="first-release-title">{freeOfferAvailable ? <>YOUR FIRST RELEASE<br />IS ON US.</> : <>YOUR NEXT RELEASE<br />STARTS HERE.</>}</h1>
          {freeOfferAvailable ? <div className="first-release-price" aria-label="Standard distribution price 99 rupees, first release free"><del className="first-release-price-was">₹99</del><strong className="first-release-price-free"><em>FREE</em></strong></div> : <div className="first-release-next-price"><small>YOUR NEXT RELEASE</small><strong>₹99</strong></div>}
        </div>

        <div className="first-release-pass-stage" data-reveal-state={revealState}>
          <div className="first-release-reveal-glow" aria-hidden="true" />
          <AnimatePresence initial={false}>
            {passVisible && <motion.div className="first-release-pass-riser" initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 210, rotate: -1 }} animate={revealState === "revealed" ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 1, y: 118, rotate: -1 }} transition={{ type: "spring", stiffness: 190, damping: 21, delay: revealState === "revealing" ? .08 : 0 }}>{pass}</motion.div>}
          </AnimatePresence>
          <motion.div className="first-release-envelope-object" animate={revealState === "sealed" ? { y: [0, -4, 0] } : { y: 0 }} transition={revealState === "sealed" ? { duration: 4.4, repeat: Infinity, ease: "easeInOut" } : { duration: .18 }}>
            <button type="button" className="first-release-envelope-button" onClick={openEnvelope} onPointerEnter={() => { if (revealState === "sealed" && !hoveredRef.current) { hoveredRef.current = true; void track("first_release_envelope_hovered"); } }} disabled={revealState !== "sealed"} aria-label="Open your HYMN First Release Pass">
              <Image className="first-release-envelope-frame" src={envelopeFrame} alt="" fill sizes="(max-width: 900px) 92vw, 560px" priority />
              <Image className="first-release-envelope-brand" src="/assets/hymnlogowhite.png" alt="" width={220} height={75} priority />
              {revealState === "breaking" && <span className="first-release-seal-spark" aria-hidden="true" />}
            </button>
          </motion.div>
          <div className="first-release-envelope-pocket" aria-hidden="true" />
          {revealState !== "revealed" && <p className="first-release-reveal-instruction"><ChevronDown aria-hidden="true" /> {revealState === "sealed" ? "OPEN YOUR FIRST RELEASE PASS" : revealState === "breaking" ? "BREAKING THE SEAL" : "YOUR PASS IS RISING"}</p>}
          {revealState === "revealed" && <p className="first-release-reveal-ready" role="status">YOUR PASS IS READY</p>}
        </div>
      </section>
    </section>
  </main>;
}
