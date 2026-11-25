"use client";

import type { CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, AudioLines, Globe2, Headphones, ListMusic, Play, Disc3, FileCheck2, TrendingUp } from 'lucide-react';
import { CoverArt } from './cover-art';
import { homePlaylists } from '@/lib/home-playlists';
import { useShowcaseRotation } from './use-showcase-rotation';
import styles from './visitor-release-hero.module.css';

type ShowcaseRelease = { id: number; title: string; artistName: string; artworkUrl: string };
type ShowcaseBeat = { id: number; title: string; coverImage: string; producerName: string };
const slides = [
  { name: 'Distribution', title: 'Get your music ready.', promise: 'Release it worldwide.', copy: 'Distribution, beats, studio support and playlist reviews. One home for your next release.', action: 'Start my first release', href: '/first-release', secondary: 'See release costs', secondaryHref: '/pricing', Icon: Globe2 },
  { name: 'Your sound', title: 'Find your sound.', promise: 'Make it release-ready.', copy: 'Discover independent beats. Work with a mixing or mastering engineer. Bring your recording together.', action: 'Find my next beat', href: '/beat-store', secondary: 'Explore studio services', secondaryHref: '/studio', Icon: AudioLines },
  { name: 'Discovery', title: 'Your music.', promise: 'Its next introduction.', copy: 'Explore playlists, get personal feedback and find a useful next step for your track.', action: 'Explore playlist reviews', href: '/login?next=%2Fdashboard%2Fplaylists', secondary: 'How reviews work', secondaryHref: '/playlist-review-terms', Icon: ListMusic },
  { name: 'Creators', title: 'Work with HYMN.', promise: 'Make room to grow.', copy: 'Sell your beats, deliver your best mixes or discover new artists. Build your presence with tools that take care of the details.', action: 'Find my creator path', href: '#creator-invitation', secondary: 'Open my beat store', secondaryHref: '/producer-onboarding', Icon: Headphones }
] as const;

export function VisitorReleaseHero({ releases, beats = [] }: { releases: ShowcaseRelease[]; beats?: ShowcaseBeat[] }) {
  const { root, index: active, select, paused, tapped, handlers } = useShowcaseRotation(slides.length, 8000);
  const slide = slides[active];
  const releaseCovers = releases.slice(0, 5).map(item=>({title:item.title,artist:item.artistName,cover:item.artworkUrl,href:'#released'}));
  const beatCovers = beats.slice(0, 5).map(item=>({title:item.title,artist:item.producerName,cover:item.coverImage,href:'/beat-store'}));
  const playlistCovers = homePlaylists.map(item=>({title:item.title,artist:'Curated by HYMN',cover:item.cover,href:item.href}));
  const soundCovers = beatCovers.length ? beatCovers : releaseCovers;
  const backgrounds = [releases[0]?.artworkUrl || '/images/home-hero-1280.webp', beats[0]?.coverImage || '/home-studio.jpg', homePlaylists[0].cover, '/home-studio.jpg'];
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
        {active===0 && <div className={styles.releaseScene} data-hero-visual="releases">
          <div className={styles.earth}><Image src="/assets/home/earth-silver-v1.webp" alt="" width={768} height={768} priority/></div>
          <div className={styles.releasePopups}>{releaseCovers.map((item,index)=><a key={item.title} href={item.href} aria-label={`Explore ${item.title} by ${item.artist}`} className={styles.releasePopup} style={{'--popup':index} as CSSProperties}><CoverArt src={item.cover} alt={item.title} width={180} height={180} previewWidth={240}/><span><strong>{item.title}</strong><small>{item.artist}</small></span><Globe2 size={11}/></a>)}</div>
          <div className={styles.sceneLabel}><Globe2 size={12}/> ONE RELEASE. A WORLD OF POSSIBILITY.</div>
        </div>}
        {active===1 && <div className={styles.beatScene} data-hero-visual="beats">
          <div className={styles.sceneHeading}><AudioLines size={15}/><span>THE NEXT SOUND IS YOURS.</span></div>
          <div className={styles.beatWindow}><div className={styles.beatTrack}>{[false,true].map(duplicate=><div className={styles.beatSet} key={String(duplicate)} aria-hidden={duplicate||undefined}>{soundCovers.map(item=><Link key={item.title} href="/beat-store" tabIndex={duplicate?-1:undefined} className={styles.beatCard} aria-label={`Explore ${item.title} by ${item.artist}`}><CoverArt src={item.cover} alt={duplicate?'':item.title} width={240} height={240} previewWidth={320}/><div><span><strong>{item.title}</strong><small>{item.artist}</small></span><span className={styles.playIcon}><Play size={12}/></span></div></Link>)}</div>)}</div></div>
          <div className={styles.soundStrip}><span>Find it.</span><i/><span>Make it yours.</span><i/><span>Release it.</span></div>
        </div>}
        {active===2 && <div className={styles.playlistScene} data-hero-visual="playlists">
          <div className={styles.sceneHeading}><Headphones size={15}/><span>A FRESH PAIR OF EARS.</span></div>
          <div className={styles.discoveryDeck}>
            <a className={styles.playlistSpotlight} href={playlistCovers[0].href} target="_blank" rel="noreferrer" aria-label={`Listen to ${playlistCovers[0].title} on Spotify`}>
              <CoverArt src={playlistCovers[0].cover} alt={playlistCovers[0].title} width={220} height={220} previewWidth={320}/>
              <span><small>CURATED BY HYMN</small><strong>{playlistCovers[0].title}</strong><span className={styles.listeningBars} aria-hidden="true">{[9,18,12,26,17,31,22,12,24,16,29,11,19,26,14].map((height,index)=><i key={index} style={{height}}/>)}</span><span>Find your next listen <ArrowRight size={12}/></span></span>
              <span className={styles.spotlightPlay}><Play size={17}/></span>
            </a>
            <div className={styles.discoveryShelf}>{playlistCovers.slice(1).map(item=><a href={item.href} key={item.title} target="_blank" rel="noreferrer" aria-label={`Listen to ${item.title} on Spotify`}><CoverArt src={item.cover} alt={item.title} width={160} height={160} previewWidth={240}/><span><strong>{item.title}</strong><ArrowRight size={10}/></span></a>)}</div>
          </div>
          <div className={styles.reviewJourney}><span>Choose a curator</span><ArrowRight size={11}/><span>Get heard</span><ArrowRight size={11}/><span>Get feedback</span></div>
          <small className={styles.note}>A review does not guarantee playlist placement or streams.</small>
        </div>}
        {active===3 && <div className={styles.creatorScene} data-hero-visual="creators">
          <div className={styles.sceneHeading}><AudioLines size={15}/><span>THE PEOPLE BEHIND THE MUSIC.</span></div>
          <div className={styles.growthWorkspace}>
            <header><span>YOUR NEXT CHAPTER</span><TrendingUp size={16}/></header>
            <div className={styles.creatorRows}>
              <Link href="/producer-onboarding" className={styles.creatorRow}><span className={styles.roleArt}>{soundCovers[0] ? <CoverArt src={soundCovers[0].cover} alt="" width={80} height={80} previewWidth={160}/>:<Disc3 size={26}/>}</span><span className={styles.roleCopy}><strong>Beat sellers</strong><small>Build a store around your sound.</small><span>Storefront <i/> Licence PDFs <i/> Private delivery</span></span><span className={styles.roleEnd}><FileCheck2 size={19}/><span>Ready to sell</span><ArrowRight size={13}/></span></Link>
              <Link href="/join/engineer" className={styles.creatorRow}><span className={`${styles.roleArt} ${styles.waveArt}`} aria-hidden="true"><AudioLines size={32}/></span><span className={styles.roleCopy}><strong>Mixing &amp; mastering engineers</strong><small>Put your work in front of artists.</small><span>Portfolio <i/> Revisions <i/> Final delivery</span></span><span className={styles.roleEnd}><Headphones size={19}/><span>Built to deliver</span><ArrowRight size={13}/></span></Link>
              <Link href="/join/curator" className={styles.creatorRow}><span className={styles.roleArt}><CoverArt src={playlistCovers[1].cover} alt="" width={80} height={80} previewWidth={160}/></span><span className={styles.roleCopy}><strong>Playlist curators</strong><small>Turn your taste into useful feedback.</small><span>Your fee <i/> Review queue <i/> Your editorial choice</span></span><span className={styles.roleEnd}><ListMusic size={19}/><span>Room to discover</span><ArrowRight size={13}/></span></Link>
            </div>
            <footer><TrendingUp size={15}/><span>More time for your craft. More room for what comes next.</span></footer>
          </div>
        </div>}
      </div>
    </div>
    <div className={styles.controls}><div className={styles.dots} role="group" aria-label="Choose a HYMN feature">{slides.map((item,index)=><button key={item.name} type="button" aria-label={`Show ${item.name} slide`} aria-current={active===index?'true':undefined} onClick={()=>select(index)}><span/></button>)}</div></div>
    {tapped && <span className={styles.touchHint}>Tap the background to resume</span>}
  </section>;
}
