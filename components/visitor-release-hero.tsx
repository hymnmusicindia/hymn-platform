"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, Circle, FileAudio, Headphones, Image as ArtworkIcon, ListMusic, MessageCircle, Radio } from 'lucide-react';
import { CoverArt } from './cover-art';
import styles from './visitor-release-hero.module.css';
import { ArtistVideoReview } from './artist-video-review';

const goals = [
  { id: 'release', label: 'My song is ready', title: 'Give your finished song a home.', description: 'Upload your audio, artwork and credits. Review your costs, then submit to HYMN for checks before distribution.', action: 'Start my first release', href: '/first-release', icon: Radio },
  { id: 'studio', label: 'I need a final mix', title: 'Get the sound right before release.', description: 'Compare mixing and mastering engineers, their prices and deliverables. Choose the support your recording needs.', action: 'Find my engineer', href: '/studio', icon: Headphones },
  { id: 'beat', label: 'I need a beat', title: 'Find the starting point for your song.', description: 'Preview beats and compare their licences. Check the included files and usage rights before you choose.', action: 'Listen to beats', href: '/beat-store', icon: FileAudio }
] as const;
const checklist = [
  { label: 'Final audio', description: 'The recording you want to release.', icon: FileAudio },
  { label: 'Cover artwork', description: 'Artwork you have permission to use.', icon: ArtworkIcon },
  { label: 'Artist credits', description: 'Your artist names and contributors.', icon: ListMusic }
];
type ShowcaseRelease = { id: number; title: string; artistName: string; artworkUrl: string };

export function VisitorReleaseHero({ singleReleasePrice, releases }: { singleReleasePrice: string; releases: ShowcaseRelease[] }) {
  const [goal, setGoal] = useState(0);
  const [ready, setReady] = useState<boolean[]>([false, false, false]);
  const selected = goals[goal];
  const readyCount = ready.filter(Boolean).length;
  function askGuide() {
    window.dispatchEvent(new CustomEvent('hymn-support-chat-open', { detail: { question: goal === 0 ? 'What do I need for my first release?' : goal === 1 ? 'How do I choose a mixing or mastering engineer?' : 'Which beat licence do I need?' } }));
  }
  return <section className={`landing-hero force-dark ${styles.hero}`} aria-labelledby="visitor-hero-title">
    <div className={styles.backdrop} aria-hidden="true"><picture><source media="(max-width: 640px)" srcSet="/images/home-hero-640.webp"/><img src="/images/home-hero-1280.webp" alt="" fetchPriority="high" loading="eager" decoding="async"/></picture></div>
    <div className={styles.layout}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}><span/>YOUR MUSIC. YOUR NEXT CHAPTER.</p>
        <h1 id="visitor-hero-title">Get your music ready.<br/><span className="home-hero-promise">Release it worldwide.</span></h1>
        <p className={styles.intro}>Beats. Studio support. Worldwide distribution. One place for your next release.</p>
        <fieldset className={styles.goals}><legend>Where are you with your music?</legend><div>{goals.map((item, index) => <label key={item.id}><input type="radio" name="visitor-music-goal" checked={goal === index} onChange={() => setGoal(index)}/><span>{item.label}</span></label>)}</div></fieldset>
        <div className={styles.recommendation} aria-live="polite" aria-atomic="true"><strong>{selected.title}</strong></div>
        <div className={styles.actions}><Link href={selected.href} className="visitor-primary">{selected.action}<ArrowUpRight size={18}/></Link><Link href="/pricing" className="visitor-secondary">See release costs<ArrowRight size={16}/></Link></div>
        <p className={styles.basePrice}>Distribution from <strong>{singleReleasePrice}</strong> / track. Add-ons extra.</p>
        <p className={styles.offer}>Eligible first single? The base distribution fee may be covered. Optional extras cost separately.</p>
        <div className={styles.assurances}><span><Check size={14}/>Keep ownership of your music</span><span><Check size={14}/>Review costs before payment</span></div>
      </div>
      <div className={styles.visual}>
        <ArtistVideoReview/>
        <details className={styles.card}><summary className={styles.readinessSummary}>Release checklist<span>{readyCount} / 3 ready</span></summary>
          <div className={styles.cardHeading}><span className={styles.record}><Radio size={21}/></span><div><p>YOUR RELEASE DESK</p><h2>A little preparation.<br/>A clearer way forward.</h2></div></div>
          <div className={styles.progressHeading}><span>What have you got ready?</span><strong aria-live="polite">{readyCount} / 3</strong></div>
          <div className={styles.progress} aria-hidden="true">{ready.map((value,index)=><span key={index} data-ready={value}/>)}</div>
          <div className={styles.checklist}>{checklist.map((item, index) => <label key={item.label}><input type="checkbox" checked={ready[index]} onChange={() => setReady(current => current.map((value, at) => at === index ? !value : value))}/><item.icon size={18}/><span><strong>{item.label}</strong><small>{item.description}</small></span>{ready[index] ? <CheckCircle2 size={20}/> : <Circle size={20}/>}</label>)}</div>
          <p className={styles.readiness} role="status">{readyCount === 3 ? 'You have the essentials. Start a release to check file requirements and submit for review.' : 'Tap what you have. You can prepare the rest as you go.'}</p>
          <div className={styles.price}><div><small>One-time distribution from</small><p><strong>{singleReleasePrice}</strong><span> / track</span></p></div><Link href="#artist-growth">Plan a year of releases<ArrowUpRight size={15}/></Link></div>
          <p className={styles.priceNote}>Base distribution only. Add-ons cost extra. Submission is subject to review.</p>
        </details>
        <button type="button" className={styles.help} onClick={askGuide}><span><MessageCircle size={17}/><span>Not sure about something?<strong>Ask the HYMN support guide</strong></span></span><ArrowUpRight size={17}/></button>
        {releases.length > 0 ? <a className={styles.proof} href="#released"><span>{releases.slice(0, 3).map(item => <CoverArt key={item.id} src={item.artworkUrl} previewWidth={64} width={36} height={36} alt={`${item.title} by ${item.artistName}`} />)}</span><span>Independent music, already out there.<small>Explore the HYMN release showcase <ArrowRight size={12}/></small></span></a> : null}
      </div>
    </div>
  </section>;
}
