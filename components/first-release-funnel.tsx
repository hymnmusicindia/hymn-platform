"use client";

import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import styles from "./first-release-reveal.module.css";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
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
  // Lift the letter clear of the pocket before exposing its claim action.
  const passLift = passRaised ? 0 : 170;
  const passVisible = revealState !== "sealed" && revealState !== "pressed" && revealState !== "sealBreaking";
  const actionVisible = revealState === "revealed";

  if (isUsed) return <main className="first-release-page first-release-empty-offer">
    <section className="first-release-empty-offer-shell" aria-labelledby="first-release-empty-offer-title">
      <Image className="first-release-empty-offer-art" src="/assets/first-release-empty-envelope.png" alt="An empty open envelope with a fly leaving a dotted trail" width={1280} height={1280} priority />
      <div className="first-release-empty-offer-copy">
        <p className="first-release-empty-offer-eyebrow">HYMN FIRST RELEASE PASS</p>
        <h1 id="first-release-empty-offer-title">Oops, it looks like you&apos;ve exhausted your offer :)</h1>
        <p>If you think this is a mistake, please <Link href="/contact">contact us</Link>.</p>
      </div>
    </section>
  </main>;

  return <main className={styles.scene} data-state={revealState}>
    <Link href="/" className={styles.home} aria-label="HYMN home"><Image src="/assets/hymnlogowhite.png" alt="HYMN" width={100} height={34} /></Link>
    <section className={styles.shell} aria-label="HYMN First Release Pass reveal">
      <header className={styles.heading}><p>A LITTLE SOMETHING TO GET YOU STARTED</p><h1>{passRaised ? "Your first record starts here." : "Big things start with one release."}</h1><span>{passRaised ? "A first-release gift, from HYMN to you." : "One tap. Your next chapter."}</span></header>
      <div className={styles.stage}>
        <div className={styles.halo} aria-hidden="true" />
        <div className={styles.rays} aria-hidden="true" />
        <div className={styles.shadow} aria-hidden="true" />
        <div className={styles.back} aria-hidden="true" />
        <motion.div className={styles.flap} animate={{ rotateX: passVisible ? -178 : 0 }} transition={{ duration: reduceMotion ? 0 : .6, ease: [.22, 1, .36, 1] }} aria-hidden="true" />
        {passVisible && <motion.section className={styles.letter} initial={reduceMotion ? false : { opacity: 0, y: 210, rotate: -3, scale: .88 }} animate={{ opacity: passRaised ? 1 : .3, y: passLift, rotate: passRaised ? -1 : -3, scale: passRaised ? 1 : .88 }} transition={{ type: "spring", stiffness: 125, damping: 20, duration: reduceMotion ? 0 : undefined }} aria-labelledby="first-release-pass-title">
          <div className={styles.letterhead}><strong>HYMN</strong><span>AN INVITATION<br />TO YOUR FIRST RELEASE</span></div>
          <p className={styles.salutation}>Dear {eligibility.firstName || "artist"},</p>
          <h2 id="first-release-pass-title">The world should<br />hear your music.</h2>
          <p className={styles.body}>Your first single’s base distribution fee is on us. Bring your sound. We’ll help you take the next step.</p>
          <FirstReleaseReceipt className={styles.receipt} />
          <div className={styles.signature}><span>Here’s to your first of many,</span><strong>The HYMN team</strong></div>
          <p className={styles.terms}>One single. Base distribution covered. Optional add-ons cost extra.</p>
          {actionVisible && <motion.div className={styles.action} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .22 }}>
            {eligibility.authenticated ? <button type="button" onClick={claim}>{state.cta}<ArrowRight aria-hidden="true" /></button> : <GoogleAuthButton label={state.cta} expectedRole="customer" referralCode={referralCode} appearance="quiet" onAuthenticated={() => { void track("first_release_auth_started"); void track("first_release_auth_completed"); router.push(startHref); router.refresh(); }} />}
          </motion.div>}
          <div className={styles.status}><Sparkles size={12} aria-hidden="true" />{state.status}</div>
        </motion.section>}
        <div className={styles.front} aria-hidden="true"><span>YOUR NEXT CHAPTER</span></div>
        <button type="button" className={styles.seal} onClick={open} disabled={revealState !== "sealed"} aria-label="Open your HYMN First Release Pass"><LockKeyhole size={23} aria-hidden="true" /><span>OPEN</span></button>
        {passRaised && <div className={styles.particles} aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} style={{ "--i": index, "--x": `${Math.cos(index * 2.4) * 210}px`, "--y": `${Math.sin(index * 2.4) * 240}px` } as React.CSSProperties} />)}</div>}
      </div>
      <p className={styles.progress} aria-live="polite">{revealState === "sealed" ? "TAP THE SEAL TO UNLOCK" : revealState === "revealed" ? "A SMALL GIFT. A BIG BEGINNING." : "UNLOCKING YOUR FIRST RELEASE…"}</p>
      {revealState === "revealed" && <p className="sr-only" role="status">Your first release pass is ready. ₹0 due today.</p>}
    </section>
  </main>;
}
