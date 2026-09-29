"use client";

import Link from "next/link";
import { useId, useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowRight, Check, Disc3, Globe2, Headphones, SlidersHorizontal } from "lucide-react";
import styles from "./music-lifecycle-banner.module.css";

const stages = [
  { name: "Find your beat", label: "The spark", icon: Disc3, title: "That beat you keep coming back to?", emphasis: "Make it yours.", body: "Find your sound, choose the licence that fits your plans, and purchase your beat. Record your vocals. Your next record starts here.", benefit: "Start with a HYMN Beat Store purchase to qualify for journey offers.", href: "/beat-store", output: "Beat + your vocals", tag: "01 / CREATE" },
  { name: "Mix & master", label: "The transformation", icon: SlidersHorizontal, title: "You bring the performance.", emphasis: "We bring the polish.", body: "Choose a professional engineer at their listed rate. Send your beat and vocals, collaborate on the mix, and approve a master ready for your release.", benefit: "Special Studio rates require an eligible HYMN beat purchase linked to your project. Otherwise, standard pricing applies.", href: "/studio", output: "Your finished master", tag: "02 / FINISH" },
  { name: "Release worldwide", label: "The next chapter", icon: Globe2, title: "From your headphones.", emphasis: "To everyone’s.", body: "Bring your approved master into distribution, add your artwork and credits, and submit for review. Choose your release date and give your music a home on streaming platforms.", benefit: "Continue from your HYMN beat purchase to claim eligible journey offers. Starting directly with distribution uses standard pricing.", href: "/distribution", output: "Ready for the world", tag: "03 / RELEASE" }
] as const;
const bars = Array.from({ length: 45 }, (_, i) => 18 + ((i * 37 + i * i * 11) % 70));

export function MusicLifecycleBanner() {
  const [active, setActive] = useState(0);
  const id = useId();

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  return (
    <section className="shell py-12 sm:py-16" aria-labelledby={`${id}-heading`}>
      <div className={styles.banner}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}><span /> THE HYMN FULL-CIRCLE EXPERIENCE</p>
            <h2 id={`${id}-heading`}>A beat. A finished record.<br /><span>Your next big beginning.</span></h2>
          </div>
          <p className={styles.intro}>Buy the beat. Mix & master with us. <br />Release it to the world. <br /><strong>Exclusive journey offers start with a HYMN beat purchase.</strong></p>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Explore your music journey">
          {stages.map((item, index) => <button key={item.name} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={(event) => navigate(event, index)} className={styles.tab}>
            <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
            <span><small>{item.label}</small><strong>{item.name}</strong></span>
            <ArrowRight size={18} className={styles.tabArrow} aria-hidden="true" />
          </button>)}
        </div>

        {stages.map((item, index) => <div key={item.name} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={active !== index} tabIndex={0} className={styles.panel}>
          {active === index && <>
            <div className={styles.story}>
              <span className={styles.chapter}>{item.tag}</span>
              <h3>{item.title}<br /><span>{item.emphasis}</span></h3>
              <p className={styles.body}>{item.body}</p>
              <div className={styles.benefit}><Check size={17} aria-hidden="true" /><p>{item.benefit}</p></div>
              <Link href="/beat-store" className={styles.cta}>{index === 0 ? "Find my beat" : "Start with a beat to claim offers"}<ArrowRight size={18} aria-hidden="true" /></Link>
              {index > 0 && <Link href={item.href} className={styles.skip}>{index === 1 ? "Explore Studio at standard pricing" : "Explore standard distribution pricing"} <ArrowRight size={14} /></Link>}
            </div>

            <div className={styles.visual}>
              <div className={styles.visualHeader}><span><span className={styles.signal} /> YOUR RECORD, TAKING SHAPE</span><Headphones size={17} /></div>
              {index === 0 ? <div className={styles.recordScene} aria-hidden="true">
                <div className={styles.sleeve}><span>HYMN<br />ORIGINALS</span><div className={styles.sleeveOrb} /><small>THE START OF SOMETHING.</small></div>
                <div className={styles.record}><div>YOUR<br />SOUND</div></div>
                <span className={styles.floatingTag}><Disc3 size={15} /> FIND THE ONE THAT FEELS LIKE YOU</span>
              </div> : index === 1 ? <div className={styles.mixer} aria-hidden="true">
                <div className={styles.waveLabel}><span>YOUR SOUND, REFINED</span><span>MASTER SESSION</span></div>
                <div className={styles.wave}>{bars.map((height, i) => <i key={i} style={{ height: `${height}%`, animationDelay: `${i * -0.13}s` }} />)}</div>
                <div className={styles.channels}>{["VOCALS", "BEAT", "MASTER"].map((name, i) => <div key={name}><span>{name}</span><div className={styles.fader}><i style={{ left: `${[62, 43, 76][i]}%` }} /></div><Check size={13} /></div>)}</div>
                <div className={styles.masterStamp}><Check size={15} /> FROM ROUGH TAKE TO RELEASE-READY</div>
              </div> : <div className={styles.releaseScene}>
                <div className={styles.destinations} aria-hidden="true"><Globe2 size={34} strokeWidth={1} /><span>Spotify</span><span>Apple Music</span><span>YouTube Music</span></div>
                <div className={styles.quote}>
                  <div className={styles.quoteHeading}><strong>Your route to journey offers</strong></div>
                  <ol className={styles.offerSteps}><li>Purchase your beat from the HYMN Beat Store.</li><li>Link that purchase when starting your Studio project.</li><li>Continue with your finished master into distribution.</li></ol>
                  <p>Offers apply only to eligible beat-purchase journeys. Direct service orders use standard pricing. Available offers and final prices are shown before payment.</p>
                </div>
              </div>}
              <div className={styles.output}><span><item.icon size={17} />{item.output}</span><span>MADE WITH HYMN <ArrowDown size={13} /></span></div>
            </div>
          </>}
        </div>)}

        <div className={styles.footer}><span><span className={styles.footerMark}>H</span> LESS RUNNING AROUND. MORE MAKING MUSIC.</span><p>Special offers require an eligible HYMN Beat Store purchase and must start through the beat-purchase workflow. Otherwise, standard pricing applies. <Link href="/terms-of-service" className={styles.terms}>T&amp;C apply.</Link></p></div>
      </div>
    </section>
  );
}
