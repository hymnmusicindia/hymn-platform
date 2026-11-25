"use client";

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Play } from 'lucide-react';
import { CoverArt } from './cover-art';
import { homePlaylists } from '@/lib/home-playlists';
import { useShowcaseRotation } from './use-showcase-rotation';
import styles from './visitor-release-hero.module.css';

type ShowcaseRelease = { id: number; title: string; artistName: string; artworkUrl: string };
type ShowcaseBeat = { id: number; title: string; coverImage: string; producerName: string };
const slides = [
  { name: 'Distribution', title: 'Get your music ready.', promise: 'Release it worldwide.', copy: 'Your sound. Your release. Music distribution and creative support for independent artists.', action: 'Start my first release', href: '/first-release', secondary: 'See release costs', secondaryHref: '/pricing' },
  { name: 'Playlists', title: 'Your sound.', promise: 'A fresh pair of ears.', copy: 'Meet playlist curators. Get personal listening, written feedback and a next step for your track.', action: 'Explore playlist reviews', href: '/login?next=%2Fdashboard%2Fplaylists', secondary: 'How reviews work', secondaryHref: '/playlist-review-terms' },
  { name: 'Beat store', title: 'Find the beat.', promise: 'Make it your own.', copy: 'Explore independent producers. Hear a beat you connect with, then choose your licence.', action: 'Find my next beat', href: '/beat-store', secondary: 'For producers', secondaryHref: '/producer-onboarding' },
  { name: 'Studio', title: 'Your recording.', promise: 'Ready for its next step.', copy: 'Work with a mixing or mastering engineer to bring your recorded track together.', action: 'Explore studio services', href: '/studio', secondary: 'All artist services', secondaryHref: '/services' },
  { name: 'Growth', title: 'More than a release.', promise: 'A bigger artist presence.', copy: 'Shape your sound. Reach streaming platforms. Get curator feedback and plan what comes next.', action: 'Explore artist services', href: '/services', secondary: 'Hear from artists', secondaryHref: '#artist-reviews' },
  { name: 'Artists', title: 'Independent music.', promise: 'Already out there.', copy: 'Real releases. Real artists. Explore the music they brought to the world with HYMN.', action: 'Explore artist releases', href: '#released', secondary: 'Hear from artists', secondaryHref: '#artist-reviews' }
] as const;
const INTERVAL = 4500;

export function VisitorReleaseHero({ releases, beats = [] }: { releases: ShowcaseRelease[]; beats?: ShowcaseBeat[] }) {
  const { root, index: active, select, paused, tapped, handlers } = useShowcaseRotation(slides.length, INTERVAL);
  const slide = slides[active];
  const release = releases[0];
  const backgrounds = [release?.artworkUrl || '/images/home-hero-1280.webp', homePlaylists[0].cover, beats[0]?.coverImage || '/home-studio.jpg', '/home-studio.jpg', '/images/home-hero-1280.webp', releases[1]?.artworkUrl || release?.artworkUrl || '/images/home-hero-1280.webp'];
  return <section ref={root} tabIndex={0} {...handlers} className={`landing-hero force-dark ${styles.hero}`} aria-label="Discover HYMN" aria-describedby="hero-rotation-help" aria-roledescription="carousel" data-hero-slide={active} data-rotation-paused={paused}>
    <span id="hero-rotation-help" className={styles.srOnly}>On a phone, tap the background to pause or resume. Use arrow keys to choose a slide. Keyboard focus also pauses rotation.</span>
    <div className={styles.backdrops} aria-hidden="true">{backgrounds.map((src, index) => <div key={index} className={styles.backdrop} data-active={active === index}><CoverArt src={src} alt="" previewWidth={960} width={1200} height={800} loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'low'}/></div>)}</div>
    <div className={styles.layout} aria-live={paused ? 'polite' : 'off'} aria-atomic="true">
      <div key={`copy-${active}`} className={styles.copy}>
        <span className={styles.eyebrow}>{slide.name === 'Artists' ? 'RELEASED WITH HYMN' : `HYMN / ${slide.name.toUpperCase()}`}</span>
        <h1 id="visitor-hero-title">{slide.title}<br/><span className="home-hero-promise">{slide.promise}</span></h1>
        <p>{slide.copy}</p>
        <div className={styles.actions}><Link href={slide.href} className={styles.primary}>{slide.action}</Link><Link href={slide.secondaryHref} className={styles.secondary}>{slide.secondary}<ArrowRight size={16}/></Link></div>
        {active === 1 && <small className={styles.note}>A review does not guarantee playlist placement or streams.</small>}
      </div>
      <div key={`visual-${active}`} className={styles.visual}>
        {active === 1 ? <div className={styles.playlists}>{homePlaylists.slice(0, 3).map(playlist => <a key={playlist.title} href={playlist.href} target="_blank" rel="noreferrer" aria-label={`Listen to ${playlist.title} on Spotify`}><Image unoptimized src={playlist.cover} alt={playlist.title} width={260} height={260}/></a>)}<span>CURATED BY HYMN &middot; LISTEN ON SPOTIFY</span></div>
          : active === 2 ? beats[0] ? <figure><Link href="/beat-store"><CoverArt src={beats[0].coverImage} alt={`${beats[0].title} beat artwork`} previewWidth={640} width={480} height={480}/><span className={styles.listen}><Play size={17} fill="currentColor"/>Explore the beat store</span></Link><figcaption><span>FROM THE HYMN BEAT STORE</span><strong>{beats[0].title}</strong><small>{beats[0].producerName}</small></figcaption></figure> : <div className={styles.emptyVisual}><span>HYMN</span><strong>Beat store</strong><small>Your next sound starts here.</small></div>
          : active === 3 ? <figure><Link href="/studio"><CoverArt src="/home-studio.jpg" alt="Recording studio and mixing console" width={480} height={480}/></Link><figcaption><span>MIXING & MASTERING</span><strong>Make room for your best sound.</strong></figcaption></figure>
          : active === 4 ? <div className={styles.research}><span>HYMN-REPORTED RESEARCH</span><strong>280%</strong><p>Growth in artists&apos;<br/>overall online presence.</p><small>Based on HYMN&apos;s own research. Sample, timeframe and methodology not published. Individual results vary.</small></div>
          : active === 5 && releases.length > 1 ? <div className={styles.releaseGrid}>{releases.slice(0, 4).map(item => <a href="#released" key={item.id}><CoverArt src={item.artworkUrl} alt={`${item.title} by ${item.artistName}`} width={210} height={210}/><span>{item.title}</span></a>)}</div>
          : release ? <figure><a href="#released" aria-label={`Explore ${release.title} by ${release.artistName}, released with HYMN`}><CoverArt src={release.artworkUrl} previewWidth={640} width={480} height={480} alt={`${release.title} by ${release.artistName}`} loading="eager" fetchPriority="high"/></a><figcaption><span>RELEASED WITH HYMN</span><strong>{release.title}</strong><small>{release.artistName}</small></figcaption></figure>
          : <CoverArt className={styles.fallback} src="/images/home-hero-1280.webp" alt="An artist performing for a live audience" width={640} height={640}/>}
      </div>
    </div>
    <span className={styles.touchHint}>{tapped ? "Paused. Tap to continue" : "Tap to pause"}</span>
    <div className={styles.controls}><div className={styles.dots} role="group" aria-label="Choose a HYMN feature">{slides.map((item, index) => <button type="button" key={item.name} aria-label={`Show ${item.name} slide`} aria-current={active === index ? 'true' : undefined} onClick={() => select(index)}><span/></button>)}</div></div>
  </section>;
}
