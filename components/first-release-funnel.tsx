"use client";

import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { FirstReleaseReceipt } from "@/components/first-release-receipt";

type Eligibility = { authenticated: boolean; eligible: boolean; reason: string; firstName?: string };
type Query = Record<string, string | undefined>;
type RevealState = "sealed" | "pressed" | "sealBreaking" | "opening" | "glowing" | "passRising" | "reward" | "revealed";

function releaseState(eligibility: Eligibility) {
  if (!eligibility.authenticated) return { status: "UNCLAIMED", cta: "CLAIM MY FREE RELEASE", event: "first_release_primary_cta_clicked" };
  if (eligibility.eligible) return { status: "READY TO CLAIM", cta: "START MY FREE RELEASE", event: "first_release_primary_cta_clicked" };
  if (eligibility.reason === "reserved") return { status: "IN PROGRESS", cta: "CONTINUE MY RELEASE", event: "first_release_resumed" };
  if (eligibility.reason === "release_already_submitted" || eligibility.reason === "already_redeemed") return { status: "CLAIMED", cta: "START ANOTHER RELEASE — ₹99", event: "first_release_plan_cta_clicked" };
  return { status: "MEMBER", cta: "START NEW RELEASE", event: "first_release_primary_cta_clicked" };
}

export function FirstReleaseFunnel({ eligibility, query }: { eligibility: Eligibility; query: Query }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const enabled = process.env.NEXT_PUBLIC_FIRST_RELEASE_REVEAL_ENABLED !== "false";
  const hapticsEnabled = process.env.NEXT_PUBLIC_FIRST_RELEASE_REVEAL_HAPTIC !== "false";
  const [revealState, setRevealState] = useState<RevealState>(enabled ? "sealed" : "revealed");
  const viewedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const attribution = useMemo(() => Object.fromEntries(Object.entries(query).filter(([, value]) => Boolean(value))), [query]);
  const track = useCallback((event: string) => fetch("/api/promotions/first-release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, attribution }) }).catch(() => undefined), [attribution]);
  const state = releaseState(eligibility);
  const isUsed = state.status === "CLAIMED" || state.status === "MEMBER";
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
    void track("first_release_reveal_impression");
    void track("first_release_envelope_idle_prompt_shown");
  }, [track]);
  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), []);
  useEffect(() => {
    if (!enabled || reduceMotion || sessionStorage.getItem("hymn:first-release-pass-revealed") === "1") setRevealState("revealed");
  }, [enabled, reduceMotion]);

  const schedule = (delay: number, next: RevealState, event?: string) => timersRef.current.push(window.setTimeout(() => { setRevealState(next); if (event) void track(event); }, delay));
  const open = () => {
    if (revealState !== "sealed") return;
    void track("first_release_envelope_open_started");
    if (reduceMotion) { setRevealState("revealed"); void track("first_release_pass_revealed"); void track("first_release_reward_cta_shown"); return; }
    setRevealState("pressed");
    schedule(105, "sealBreaking", "first_release_seal_broken");
    schedule(390, "opening");
    schedule(740, "glowing");
    schedule(940, "passRising");
    schedule(1630, "reward");
    schedule(1900, "revealed", "first_release_pass_revealed");
    schedule(2050, "revealed", "first_release_reward_cta_shown");
    timersRef.current.push(window.setTimeout(() => sessionStorage.setItem("hymn:first-release-pass-revealed", "1"), 1900));
    if (hapticsEnabled && typeof navigator !== "undefined" && "vibrate" in navigator) timersRef.current.push(window.setTimeout(() => navigator.vibrate(10), 105));
  };
  const claim = () => { void track("first_release_reward_cta_clicked"); void track(state.event); router.push(isUsed ? "/distribution/start" : startHref); };
  const passRaised = ["passRising", "reward", "revealed"].includes(revealState);
  // The spring overshoots the pocket while the pass is being pulled free, then
  // settles in its readable position above the envelope's foreground layer.
  const passLift = revealState === "passRising" ? -70 : passRaised ? 0 : 178;
  const passVisible = revealState !== "sealed" && revealState !== "pressed" && revealState !== "sealBreaking";
  const actionVisible = revealState === "revealed";

  return <main className={`first-release-page first-release-scene first-release-scene-${revealState}`}>
    <section className="first-release-scene-shell" aria-label="HYMN First Release Pass reveal">
      <div className="first-release-scene-vignette" aria-hidden="true" />
      <div className="first-release-envelope-stage" data-state={revealState}>
        <div className="first-release-ground-shadow" aria-hidden="true" />
        <div className="first-release-envelope-back" aria-hidden="true" />
        <div className="first-release-envelope-cavity" aria-hidden="true" />
        <div className="first-release-interior-glow" aria-hidden="true" />
        {passVisible && <motion.section className="first-release-live-pass" initial={reduceMotion ? false : { opacity: 0, y: 250, rotate: -1 }} animate={{ opacity: 1, y: passLift, rotate: passRaised ? 0 : -1 }} transition={{ type: "spring", stiffness: 185, damping: 20 }} aria-labelledby="first-release-pass-title">
          <div className="first-release-pass-head"><span>HYMN FIRST RELEASE PASS</span><b>01/01</b></div>
          <h1 id="first-release-pass-title" className="first-release-pass-title">FIRST SINGLE</h1>
          <FirstReleaseReceipt />
          <div className="first-release-product-status"><p>PRODUCT STATUS</p>{["Artwork", "Audio", "Metadata"].map(item => <span key={item}>{item}<Check aria-hidden="true" /></span>)}<em>Ready to begin your release</em></div>
          {actionVisible && <motion.div className="first-release-pass-action" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .22 }}>
            <p>YOUR PASS IS READY</p>
            {eligibility.authenticated ? <button type="button" onClick={claim}>{state.cta}<ArrowRight aria-hidden="true" /></button> : <GoogleAuthButton label={state.cta} expectedRole="customer" referralCode={referralCode} appearance="quiet" onAuthenticated={() => { void track("first_release_auth_started"); void track("first_release_auth_completed"); router.push(startHref); router.refresh(); }} />}
          </motion.div>}
          <div className="first-release-pass-foot">STATUS: <b>{state.status}</b></div>
        </motion.section>}
        <div className="first-release-envelope-front" aria-hidden="true" />
        <Image className="first-release-envelope-wordmark" src="/assets/hymnlogowhite.png" alt="" width={220} height={75} priority />
        <motion.div className="first-release-envelope-flap" animate={revealState === "opening" || revealState === "glowing" || passRaised ? { rotateX: -164 } : revealState === "sealBreaking" ? { rotateX: 2 } : { rotateX: 0 }} transition={{ duration: .52, ease: [0.16, 1, .3, 1] }} aria-hidden="true" />
        <button type="button" className="first-release-seal-button" onClick={open} disabled={revealState !== "sealed"} aria-label="Open your HYMN First Release Pass">
          <span className="first-release-seal-base" />
          {revealState !== "sealBreaking" && <span className="first-release-seal-mark" aria-hidden="true" />}
          {revealState === "sealBreaking" && <><span className="first-release-seal-half first-release-seal-half-left" /><span className="first-release-seal-half first-release-seal-half-right" /><span className="first-release-seal-fragment first-release-seal-fragment-one" /><span className="first-release-seal-fragment first-release-seal-fragment-two" /></>}
        </button>
        {passRaised && <div className="first-release-reward-particles" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <i key={index} style={{ "--particle": index } as React.CSSProperties} />)}</div>}
      </div>
      {revealState === "sealed" && <p className="first-release-scene-instruction"><ChevronDown aria-hidden="true" /><span className="first-release-desktop-copy">OPEN YOUR FIRST RELEASE PASS</span><span className="first-release-mobile-copy">TAP TO OPEN YOUR GIFT</span></p>}
      {revealState !== "sealed" && revealState !== "revealed" && <p className="first-release-scene-progress" aria-live="polite">{revealState === "sealBreaking" ? "BREAKING THE SEAL" : revealState === "opening" ? "OPENING YOUR GIFT" : "YOUR PASS IS RISING"}</p>}
      {revealState === "revealed" && <p className="sr-only" role="status">Your first release pass is ready. ₹0 due today.</p>}
    </section>
  </main>;
}
