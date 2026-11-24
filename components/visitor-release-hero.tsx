import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CoverArt } from './cover-art';
import styles from './visitor-release-hero.module.css';

type ShowcaseRelease = { id: number; title: string; artistName: string; artworkUrl: string };

export function VisitorReleaseHero({ releases }: { releases: ShowcaseRelease[] }) {
  const release = releases[0];
  return <section className={`landing-hero force-dark ${styles.hero}`} aria-labelledby="visitor-hero-title">
    <div className={styles.layout}>
      <div className={styles.copy}>
        <h1 id="visitor-hero-title">Get your music ready.<br/><span className="home-hero-promise">Release it worldwide.</span></h1>
        <p>Music distribution, beats and studio support.<br/>Built for independent artists.</p>
        <div className={styles.actions}><Link href="/first-release" className={styles.primary}>Start my first release</Link><Link href="/pricing" className={styles.secondary}>See release costs<ArrowRight size={16}/></Link></div>
      </div>
      <div className={styles.visual}>{release ? <figure><a href="#released" aria-label={`Explore ${release.title} by ${release.artistName}, released with HYMN`}><CoverArt src={release.artworkUrl} previewWidth={640} width={480} height={480} alt={`${release.title} by ${release.artistName}`} loading="eager" fetchPriority="high"/></a><figcaption><span>RELEASED WITH HYMN</span><strong>{release.title}</strong><small>{release.artistName}</small></figcaption></figure> : <img className={styles.fallback} src="/images/home-hero-1280.webp" alt="An artist performing for a live audience" width={640} height={640} fetchPriority="high"/>}</div>
    </div>
  </section>;
}
