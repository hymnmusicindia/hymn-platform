import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import styles from "./music-lifecycle-banner.module.css";

const bars = Array.from({ length: 23 }, (_, i) => 20 + ((i * 37 + i * i * 11) % 65));

export function MusicLifecycleBanner() {
  return (
    <section className="shell py-7 sm:py-9" aria-labelledby="music-journey-heading">
      <div className={styles.banner}>
        <div className={styles.heading}>
          <div><h2 id="music-journey-heading">Your sound. <span>Release-ready.</span></h2><p>Beat to master to worldwide release. All with HYMN.</p></div>
          <Link href="/beat-store" className={styles.cta}>Start with a beat <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className={styles.journey}>
          <Link href="/beat-store" className={styles.stage} aria-label="Buy a beat from HYMN to start your offer journey">
            <div className={styles.art} aria-hidden="true"><div className={styles.record}><span>H</span></div><div className={styles.sleeve} /></div>
            <div className={styles.caption}><span className={styles.number}>01</span><div><h3>Buy your beat</h3><p>Your sound starts here.</p></div><ArrowRight size={16} aria-hidden="true" /></div>
          </Link>
          <div className={styles.connector} aria-hidden="true"><ArrowRight size={18} /></div>
          <Link href="/studio" className={styles.stage} aria-label="Explore mixing and mastering; standard pricing without an eligible HYMN beat purchase">
            <div className={styles.art} aria-hidden="true"><div className={styles.console}><div className={styles.wave}>{bars.map((height, i) => <i key={i} style={{ height: height + "%", animationDelay: i * -.13 + "s" }} />)}</div><div className={styles.controls}><SlidersHorizontal size={18} /><span /><span /><span /></div></div></div>
            <div className={styles.caption}><span className={styles.number}>02</span><div><h3>Mix & master</h3><p>Polished by our engineers.</p></div><ArrowRight size={16} aria-hidden="true" /></div>
          </Link>
          <div className={styles.connector} aria-hidden="true"><ArrowRight size={18} /></div>
          <Link href="/distribution" className={styles.stage} aria-label="Explore distribution; standard pricing without an eligible HYMN beat purchase">
            <div className={styles.art} aria-hidden="true"><div className={styles.world}><span className={styles.globe} /><span className={styles.platformOne} title="Spotify" /><span className={styles.platformTwo} title="Apple Music" /><span className={styles.platformThree} title="YouTube Music" /></div></div>
            <div className={styles.caption}><span className={styles.number}>03</span><div><h3>Release worldwide</h3><p>Ready for your listeners.</p></div><ArrowRight size={16} aria-hidden="true" /></div>
          </Link>
        </div>
        <p className={styles.terms}>Special offers: start with an eligible HYMN beat purchase and link it to your project. Otherwise, standard pricing applies. <Link href="/terms-of-service">T&amp;C apply.</Link></p>
      </div>
    </section>
  );
}
