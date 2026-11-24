"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, AudioLines, Disc3, Radio } from 'lucide-react';
import { CoverArt } from './cover-art';
import styles from './artist-feature-showcase.module.css';

const features = [
  { label: 'Find your sound', title: 'Give your next idea a sound.', copy: 'License a beat. Work with an engineer. Make a record that feels like you.', href: '/beat-store', action: 'Explore beats', icon: AudioLines },
  { label: 'Reach more places', title: 'Be where your listeners are.', copy: 'Submit your finished music for distribution to the platforms they already use.', href: '/distribution', action: 'Explore distribution', icon: Radio },
  { label: 'Build your catalogue', title: 'Give listeners more to come back to.', copy: 'Plan your next release and build a body of work, one record at a time.', href: '#artist-growth', action: 'Plan my next release', icon: Disc3 }
] as const;

export function ArtistFeatureShowcase({ releases }: { releases: { id: number; title: string; artistName: string; artworkUrl: string }[] }) {
  const [selected, setSelected] = useState(0);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLElement>(null);
  const feature = features[selected];
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { threshold: .15 });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  function openPlanner() {
    if (selected !== 2) return;
    const planner = document.querySelector<HTMLDetailsElement>('.visitor-planner');
    if (planner) planner.open = true;
  }
  return <section ref={root} className={`landing-next-move ${styles.root}`} data-visible={visible} aria-labelledby="next-move-title">
    <header><p className={styles.eyebrow}>MORE POSSIBILITIES FOR YOUR MUSIC</p><h2 id="next-move-title">Your next chapter.<br/><span>Built with HYMN.</span></h2></header>
    <div className={styles.tabs} role="group" aria-label="Explore how HYMN helps artists">{features.map((item, index) => <button type="button" key={item.label} aria-pressed={selected === index} onClick={() => setSelected(index)}><item.icon size={16}/>{item.label}</button>)}</div>
    <div className={styles.stage}>
      <div key={selected} className={styles.scene} aria-hidden="true" data-scene={selected}>
        {selected === 0 ? <div className={styles.sound}><div className={styles.record}><Disc3 size={130} strokeWidth={.5}/></div><div className={styles.wave}>{Array.from({ length: 39 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 37 + 11) % 83)}%`, animationDelay: `${index * -.07}s` }}/>)}</div><span className={styles.sceneLabel}>BEATS · MIXING · MASTERING</span></div> : selected === 1 ? <div className={styles.network}><div className={styles.networkCore}>{releases[0] ? <CoverArt src={releases[0].artworkUrl} alt="" width={150} height={150}/> : <Disc3 size={65}/>}</div>{['Spotify', 'Apple Music', 'YouTube Music', 'Amazon Music'].map((name, index) => <span className={styles.destination} key={name} data-position={index}>{name}</span>)}<svg viewBox="0 0 600 340" preserveAspectRatio="none"><path d="M300 170Q200 40 90 70M300 170Q400 40 510 70M300 170Q200 300 90 270M300 170Q400 300 510 270"/></svg><span className={styles.sceneLabel}>ONE RELEASE. MORE PLACES TO BE FOUND.</span></div> : <div className={styles.catalogue}><div className={styles.sleeves}>{Array.from({ length: 3 }, (_, index) => { const release = releases[index % Math.max(1, releases.length)]; return <div key={index}>{release ? <CoverArt src={release.artworkUrl} alt="" width={160} height={160}/> : <Disc3 size={75}/>}</div>; })}</div><div className={styles.timeline}><i/><span/><i/><span/><i/></div><span className={styles.sceneLabel}>YOUR FIRST. YOUR NEXT. YOUR BODY OF WORK.</span></div>}
      </div>
      <div className={styles.caption} key={`copy-${selected}`}><div><h3>{feature.title}</h3><p>{feature.copy}</p></div><Link href={feature.href} onClick={openPlanner}>{feature.action}<ArrowUpRight size={16}/></Link></div>
    </div>
  </section>;
}
