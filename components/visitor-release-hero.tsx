"use client";

import Link from 'next/link';
import { ArrowRight, AudioLines, Globe2, Headphones, ListMusic } from 'lucide-react';
import { CoverArt } from './cover-art';
import { homePlaylists } from '@/lib/home-playlists';
import { useShowcaseRotation } from './use-showcase-rotation';
import styles from './visitor-release-hero.module.css';

type ShowcaseRelease = { id: number; title: string; artistName: string; artworkUrl: string };
type ShowcaseBeat = { id: number; title: string; coverImage: string; producerName: string };
const slides = [
  { name: 'Distribution', title: 'Get your music ready.', promise: 'Release it worldwide.', copy: 'Distribution, beats, studio support and playlist reviews. One home for your next release.', action: 'Start my first release', href: '/first-release', secondary: 'See release costs', secondaryHref: '/pricing', Icon: Globe2 },
  { name: 'Your sound', title: 'Find your sound.', promise: 'Make it release-ready.', copy: 'Discover independent beats. Work with a mixing or mastering engineer. Bring your recording together.', action: 'Find my next beat', href: '/beat-store', secondary: 'Explore studio services', secondaryHref: '/studio', Icon: AudioLines },
  { name: 'Discovery', title: 'Your music.', promise: 'Its next introduction.', copy: 'Explore playlists, get personal feedback and find a useful next step for your track.', action: 'Explore playlist reviews', href: '/login?next=%2Fdashboard%2Fplaylists', secondary: 'How reviews work', secondaryHref: '/playlist-review-terms', Icon: ListMusic }
] as const;

export function VisitorReleaseHero({ releases, beats = [] }: { releases: ShowcaseRelease[]; beats?: ShowcaseBeat[] }) {
  const { root, index: active, select, paused, tapped, handlers } = useShowcaseRotation(slides.length, 4500);
  const slide = slides[active];
  const releaseCovers = releases.slice(0, 5).map(item=>({title:item.title,artist:item.artistName,cover:item.artworkUrl,href:'#released'}));
  const beatCovers = beats.slice(0, 5).map(item=>({title:item.title,artist:item.producerName,cover:item.coverImage,href:'/beat-store'}));
  const playlistCovers = homePlaylists.map(item=>({title:item.title,artist:'Curated by HYMN',cover:item.cover,href:item.href}));
  const covers = active===2 ? playlistCovers : active===1 && beatCovers.length ? beatCovers : releaseCovers;
  const backgrounds = [releases[0]?.artworkUrl || '/images/home-hero-1280.webp', beats[0]?.coverImage || '/home-studio.jpg', homePlaylists[0].cover];
  return <section ref={root} tabIndex={0} {...handlers} className={`landing-hero force-dark ${styles.hero}`} aria-label="Discover HYMN" aria-describedby="hero-rotation-help" aria-roledescription="carousel" data-hero-slide={active} data-rotation-paused={paused}>
    <span id="hero-rotation-help" className={styles.srOnly}>On a phone, tap the background to pause or resume. Use arrow keys to choose a slide. Keyboard focus also pauses rotation.</span>
    <div className={styles.backdrops} aria-hidden="true">{backgrounds.map((src,index)=><div key={index} className={styles.backdrop} data-active={active===index}><CoverArt src={src} alt="" previewWidth={960} width={1200} height={800} loading={index===0?'eager':'lazy'}/></div>)}</div>
    <div className={styles.layout} aria-live={paused?'polite':'off'} aria-atomic="true">
      <div className={styles.copy} key={`copy-${active}`}>
        <span className={styles.eyebrow}><slide.Icon size={13}/>INDEPENDENT MUSIC. REAL POSSIBILITIES.</span>
        <h1 id="visitor-hero-title">{slide.title}<br/><span className="home-hero-promise">{slide.promise}</span></h1>
        <p>{slide.copy}</p>
        <div className={styles.actions}><Link href={slide.href} className={styles.primary}>{slide.action}<ArrowRight size={15}/></Link><Link href={slide.secondaryHref} className={styles.secondary}>{slide.secondary}<ArrowRight size={15}/></Link></div>
        <div className={styles.impact} aria-label="HYMN-reported impact"><div><strong>2.4k</strong><span>Tracks influenced</span></div><i/><div><strong>45 lakh</strong><span>Views gathered</span></div><small>HYMN-reported cumulative totals.</small></div>
      </div>
      <div className={styles.visual} key={`visual-${active}`}>
        <div className={styles.world}>
          <svg viewBox="0 0 600 410" className={styles.globe} aria-hidden="true"><defs><radialGradient id="hero-world-light"><stop offset="0%" stopColor="#a9bfdc" stopOpacity=".15"/><stop offset="100%" stopColor="#a9bfdc" stopOpacity=".025"/></radialGradient><clipPath id="hero-world-clip"><circle cx="300" cy="410" r="280"/></clipPath></defs><circle cx="300" cy="410" r="280" fill="url(#hero-world-light)" stroke="currentColor"/><g clipPath="url(#hero-world-clip)" fill="none" stroke="currentColor">{[80,160,230].map(rx=><ellipse key={rx} cx="300" cy="410" rx={rx} ry="280"/>)}{[55,130,205].map(ry=><ellipse key={ry} cx="300" cy="410" rx="280" ry={ry}/>)}<path d="M20 410H580M300 130V410"/></g><circle cx="92" cy="300" r="4" fill="currentColor"/><circle cx="462" cy="219" r="4" fill="currentColor"/></svg>
          <div className={styles.covers}>{covers.map((item,index)=><a key={`${item.title}-${index}`} href={item.href} target={active===2?'_blank':undefined} rel={active===2?'noreferrer':undefined} aria-label={active===2?`Listen to ${item.title} on Spotify`:`Explore ${item.title} by ${item.artist}`} className={styles.cover} data-cover={index}><CoverArt src={item.cover} alt={`${item.title} by ${item.artist}`} previewWidth={320} width={220} height={220} loading="eager"/><span><strong>{item.title}</strong><small>{item.artist}</small></span></a>)}</div>
          {!covers.length && <div className={styles.emptyVisual}>Your music belongs here.</div>}
          <span className={styles.worldTag}>{active===0?<Globe2 size={13}/>:active===1?<Headphones size={13}/>:<ListMusic size={13}/>} {active===0?'FROM YOUR ROOM. TO THE WORLD.':active===1?'BEATS. MIXING. MASTERING.':'A FRESH PAIR OF EARS.'}</span>
        </div>
        <div className={styles.visualCaption}>{active===0?'Independent artists. Part of something bigger.':active===1?'Different sounds. One creative home.':'Curated by HYMN. Listen on Spotify.'}</div>
        {active===2 && <small className={styles.note}>A review does not guarantee playlist placement or streams.</small>}
      </div>
    </div>
    <div className={styles.controls}><div className={styles.dots} role="group" aria-label="Choose a HYMN feature">{slides.map((item,index)=><button key={item.name} type="button" aria-label={`Show ${item.name} slide`} aria-current={active===index?'true':undefined} onClick={()=>select(index)}><span/></button>)}</div></div>
    {tapped && <span className={styles.touchHint}>Tap the background to resume</span>}
  </section>;
}
