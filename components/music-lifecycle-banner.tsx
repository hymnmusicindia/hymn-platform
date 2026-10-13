"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import styles from "./music-lifecycle-banner.module.css";

const bars = Array.from({ length: 23 }, (_, i) => 20 + ((i * 37 + i * i * 11) % 65));
const steps = [
  { title: "Find your starting sound", description: "Explore beats, choose your sound, and buy the license that fits your project.", action: "Explore beats", href: "/beat-store" },
  { title: "Turn your recording into a finished track", description: "Bring your recorded song to our engineers for mixing and mastering before release.", action: "Explore studio services", href: "/studio" },
  { title: "Take your finished music worldwide", description: "Submit your release for review and distribution to Spotify, Apple Music, YouTube Music and more.", action: "Explore distribution", href: "/distribution" }
] as const;

export function MusicLifecycleBanner() {
  const [activeStep, setActiveStep] = useState(0);
  const step = steps[activeStep];
  return (
    <section className="shell py-7 sm:py-9" aria-labelledby="music-journey-heading">
      <div className={styles.banner}>
        <div className={styles.heading}>
          <div><h2 id="music-journey-heading">Your sound. <span>Release-ready.</span></h2><p>Beat to master to worldwide release. All with HYMN.</p></div>
          <Link href="/beat-store" className={styles.cta}>Start with a beat <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <p className={styles.hint}>Three steps. One connected journey. <span>Select a step to explore.</span></p>
        <div className={styles.journey}>
          <button type="button" className={styles.stage} aria-pressed={activeStep === 0} aria-controls="music-journey-detail" onClick={() => setActiveStep(0)}>
            <div className={styles.art} aria-hidden="true"><div className={styles.record}><span>H</span></div><div className={styles.sleeve} /></div>
            <div className={styles.caption}><span className={styles.number}>01</span><div><h3>Buy your beat</h3><p>Your sound starts here.</p></div><ArrowRight size={16} aria-hidden="true" /></div>
          </button>
          <div className={styles.connector} aria-hidden="true"><ArrowRight size={18} /></div>
          <button type="button" className={styles.stage} aria-pressed={activeStep === 1} aria-controls="music-journey-detail" onClick={() => setActiveStep(1)}>
            <div className={styles.art} aria-hidden="true"><div className={styles.console}><div className={styles.wave}>{bars.map((height, i) => <i key={i} style={{ height: height + "%", "--bar-delay": i * -0.07 + "s" } as CSSProperties} />)}</div><div className={styles.controls}><SlidersHorizontal size={18} /><span /><span /><span /></div></div></div>
            <div className={styles.caption}><span className={styles.number}>02</span><div><h3>Mix & master</h3><p>Polished by our engineers.</p></div><ArrowRight size={16} aria-hidden="true" /></div>
          </button>
          <div className={styles.connector} aria-hidden="true"><ArrowRight size={18} /></div>
          <button type="button" className={`${styles.stage} ${styles.distributionStage}`} aria-pressed={activeStep === 2} aria-controls="music-journey-detail" onClick={() => setActiveStep(2)}>
            <div className={styles.art} aria-hidden="true"><div className={styles.world}><span className={styles.globe} /><span className={styles.platformOne} title="Spotify" /><span className={styles.platformTwo} title="Apple Music" /><span className={styles.platformThree} title="YouTube Music" /></div></div>
            <div className={styles.caption}><span className={styles.number}>03</span><div><h3>Reach global listeners</h3><p>Distribute to streaming platforms.</p></div><ArrowRight size={16} aria-hidden="true" /></div>
          </button>
        </div>
        <div id="music-journey-detail" className={styles.detail}>
          <div className={styles.detailCopy} aria-live="polite" aria-atomic="true"><span className={styles.detailNumber}>0{activeStep + 1} / 03</span><div><h3>{step.title}</h3><p>{step.description}</p></div></div>
          <Link href={step.href} className={styles.detailAction}>{step.action} <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <p className={styles.terms}>Special offers: start with an eligible HYMN beat purchase and link it to your project. Otherwise, standard pricing applies. <Link href="/terms-of-service">T&amp;C apply.</Link></p>
      </div>
    </section>
  );
}
