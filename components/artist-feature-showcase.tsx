"use client";

import { useShowcaseRotation } from './use-showcase-rotation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, AudioLines, Disc3, Radio, ListMusic } from 'lucide-react';
import { homePlaylists } from '@/lib/home-playlists';
import { CoverArt } from './cover-art';
import styles from './artist-feature-showcase.module.css';

const storeLogos = [
  { name: 'Spotify', src: '/assets/store-logos/wordmark-spotify.png' },
  { name: 'Apple Music', src: '/assets/store-logos/wordmark-apple.png' },
  { name: 'YouTube Music', src: '/assets/store-logos/wordmark-youtube.png' },
  { name: 'Amazon Music', src: '/assets/store-logos/wordmark-amazon.png' },
  { name: 'JioSaavn', src: '/assets/store-logos/wordmark-jiosaavn.png' },
  { name: 'Deezer', src: '/assets/store-logos/wordmark-deezer.png' },
  { name: 'TIDAL', src: '/assets/store-logos/wordmark-tidal.png' },
  { name: 'SoundCloud', src: '/assets/store-logos/wordmark-soundcloud.png' }
] as const;

const features = [
  { label: 'Find your sound', title: 'Give your next idea a sound.', copy: 'License a beat. Work with an engineer. Make a record that feels like you.', href: '/beat-store', action: 'Explore beats', icon: AudioLines },
  { label: 'Reach more places', title: 'Be where your listeners are.', copy: 'Submit your finished music for distribution to the platforms they already use.', href: '/distribution', action: 'Explore distribution', icon: Radio },
  { label: 'Build your catalogue', title: 'Give listeners more to come back to.', copy: 'Plan your next release and build a body of work, one record at a time.', href: '#artist-growth', action: 'Plan my next release', icon: Disc3 },
  { label: 'Playlist reviews', title: 'Find a fresh pair of ears.', copy: 'Personal listening and written feedback from curators. Reviews do not guarantee placement or streams.', href: '/login?next=%2Fdashboard%2Fplaylists', action: 'Explore playlist reviews', icon: ListMusic }
] as const;

function ArtworkRails({ covers, stores = false }: { covers: { src: string; title: string }[]; stores?: boolean }) {
  const unique = [...new Map(covers.filter(cover => cover.src).map(cover => [cover.src, cover])).values()];
  const pool = unique.length ? Array.from({ length: Math.max(8, unique.length) }, (_, index) => unique[index % unique.length]) : [];
  return <div className={styles.coverRails} data-kind={stores ? "stores" : "artwork"} aria-hidden="true">{[0, 1].map(row => <div className={styles.coverTrack} key={row} data-direction={row === 1 ? 'reverse' : 'forward'}>{[0, 1].map(copy => <div className={styles.coverGroup} key={copy}>{pool.map((cover, index) => <div className={styles.wallCover} key={`${index}-${cover.title}`}>{stores ? <Image unoptimized src={cover.src} alt="" width={180} height={180}/> : <CoverArt src={cover.src} alt="" previewWidth={192} width={180} height={180}/>}</div>)}</div>)}</div>)}</div>;
}

export function ArtistFeatureShowcase({ releases, beats = [] }: { beats?: { title: string; coverImage: string; producerName: string }[]; releases: { id: number; title: string; artistName: string; artworkUrl: string }[] }) {
  const { root, index: selected, select, paused, tapped, visible, handlers } = useShowcaseRotation(features.length);
  const feature = features[selected];
  const beatCovers = beats.map(beat => ({ src: beat.coverImage, title: beat.title }));
  const releaseCovers = releases.map(release => ({ src: release.artworkUrl, title: release.title }));
  function openPlanner() {
    if (selected !== 2) return;
    const planner = document.querySelector<HTMLDetailsElement>('.visitor-planner');
    if (planner) planner.open = true;
  }
  return <section ref={root} tabIndex={0} {...handlers} data-feature-slide={selected} data-rotation-paused={paused} aria-roledescription="carousel" aria-describedby="feature-rotation-help" className={`landing-next-move ${styles.root}`} data-visible={visible} aria-labelledby="next-move-title">
    <span id="feature-rotation-help" className={styles.srOnly}>Tap the background on a phone to pause or resume. Use arrow keys to choose a feature.</span><header><p className={styles.eyebrow}>MORE POSSIBILITIES FOR YOUR MUSIC</p><h2 id="next-move-title">Your next chapter.<br/><span>Built with HYMN.</span></h2></header>
    <div className={styles.tabs} role="group" aria-label="Explore how HYMN helps artists">{features.map((item, index) => <button type="button" key={item.label} aria-pressed={selected === index} onClick={() => select(index)}><item.icon size={16}/>{item.label}</button>)}</div>
    <div className={styles.stage} aria-live={paused ? "polite" : "off"}>
      <div key={selected} className={styles.scene} data-scene={selected}>
        <div className={styles.beatWall} data-story={selected}>
          <ArtworkRails stores={selected === 1} covers={selected === 0 ? beatCovers : selected === 1 ? storeLogos.map(store => ({ src: store.src, title: store.name })) : selected === 3 ? homePlaylists.map(playlist => ({ src: playlist.cover, title: playlist.title })) : releaseCovers}/>
          <div className={styles.beatWallCopy} data-has-details={selected !== 0}>
            <span>{['HYMN BEAT STORE', 'WORLDWIDE DISTRIBUTION', 'YOUR RELEASE JOURNEY', 'HYMN PLAYLIST REVIEWS'][selected]}</span>
            <h3>{selected === 0 ? <>Find the beat<br/>that suits you.</> : selected === 1 ? <>Be where<br/>listeners listen.</> : selected === 2 ? <>Your music.<br/>A body of work.</> : <>Your track.<br/>A fresh perspective.</>}</h3>
          </div>
          {selected === 1 && <div className={styles.storeRibbon}>{storeLogos.slice(0, 4).map(store => <span key={store.name}><Image unoptimized src={store.src} alt={store.name} width={132} height={40}/></span>)}</div>}
          {selected === 2 && <div className={styles.catalogueJourney} aria-label="Build your catalogue one release at a time"><span>Your first</span><i aria-hidden="true"/><span>Your next</span><i aria-hidden="true"/><span>Your body of work</span></div>}
          {selected === 3 && <div className={styles.playlistRibbon}>{homePlaylists.map(playlist => <a key={playlist.title} href={playlist.href} target="_blank" rel="noreferrer" aria-label={`Listen to ${playlist.title} on Spotify`}><Image unoptimized src={playlist.cover} alt="" width={80} height={80}/></a>)}</div>}
        </div>
      </div>
      <div className={styles.benefit}><span>{["Stand out with a sound that is yours", "More destinations for listeners to find you", "More music for listeners to return to", "Feedback to shape your next move"][selected]}</span><small>{tapped ? "Paused. Tap to continue" : "Explore what comes next"}</small></div><div className={styles.caption} key={`copy-${selected}`}><div><h3>{feature.title}</h3><p>{feature.copy}</p></div><Link href={feature.href} onClick={openPlanner}>{feature.action}<ArrowUpRight size={16}/></Link></div>
    </div>
  </section>;
}
