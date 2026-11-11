"use client";

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ExternalLink, Play, X, Youtube } from 'lucide-react';
import { YoutubeOacCard } from './youtube-oac-card';
import { CustomerOverlay } from './customer-overlay';
import { useAccessibleDialog } from './ui/use-accessible-dialog';
import styles from './youtube-oac-page.module.css';

export function PromotionOacLink() {
  return <Link href="/promotion/youtube-oac" className={styles.promotionLink}><span className={styles.youtubeIcon}><Youtube size={28}/></span><span><small>ARTIST TOOLS</small><strong>YouTube Official Artist Channel</strong><span>Bring your music and artist channel together. Check eligibility and track your application.</span></span><ArrowRight aria-hidden="true"/></Link>;
}

export function YoutubeOacPage() {
  const [playing, setPlaying] = useState(false);
  const close = useCallback(() => setPlaying(false), []);
  const dialog = useAccessibleDialog(playing, close);
  return <main className={styles.page}>
    <Link href="/dashboard?tab=promotions" className={styles.back}>← Promotion</Link>
    <header className={styles.heading}><span className={styles.eyebrow}><Youtube size={18}/> YOUTUBE FOR ARTISTS</span><h1>Your music. Your channel.<br/>One official home.</h1><p>Apply for a YouTube Official Artist Channel with HYMN, and give listeners one place to discover your music.</p></header>
    <div className={styles.hero}>
      <div>
        <div className={styles.visual}>
          <span className={styles.visualBrand}><Youtube fill="currentColor"/> YouTube <small>Artist channel illustration</small></span>
          <div className={styles.analytics} aria-hidden="true"><span>Artist overview</span><strong>A clearer view of your music</strong><div className={styles.chart}><i/><i/><i/><i/><i/><i/><i/><i/></div><span>Music · Videos · Audience</span><div className={styles.chartLines}/></div>
          <div className={styles.phone}><div className={styles.portrait} role="img" aria-label="Shreya Ghoshal, illustrative artist channel portrait"/><div className={styles.artist}><small>ILLUSTRATIVE CHANNEL</small><strong>Shreya Ghoshal <Check size={14}/></strong><span>Artist · Music</span></div><div className={styles.phoneTracks}><b>Your music, together</b><span>Releases</span><span>Music videos</span><span>Artist uploads</span></div></div>
          <button type="button" className={styles.play} onClick={() => setPlaying(true)} aria-label="Play Official Artist Channel explainer"><Play size={19} fill="currentColor"/></button><span className={styles.playLabel}>See how it works</span>
        </div>
        <p className={styles.credit}>Illustration only; no artist endorsement. Photo: <a href="https://commons.wikimedia.org/wiki/File:Shreya.Ghoshal.jpg" target="_blank" rel="noreferrer">Bollywood Hungama / Wikimedia Commons</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. Cropped for display.</p>
      </div>
      <section className={styles.requirements} aria-labelledby="oac-requirements"><span className={styles.eyebrow}>BEFORE YOU APPLY</span><h2 id="oac-requirements">Make a channel request</h2><p>A one-time application for each artist. You do not need to reapply after every release.</p><ol>
        <li><strong>One artist, one channel</strong><p>Manage a channel dedicated to your artist’s music. Use the artist’s name so reviewers can identify it.</p></li>
        <li><strong>Get your artist profile ready</strong><p>HYMN requires a verified artist profile and at least five fully live releases before submission.</p></li>
        <li><strong>Use your channel ID link</strong><p>Paste <code>https://www.youtube.com/channel/UC…</code>. Handle links such as <code>/@artist</code>, custom URLs and video links are not accepted. Find your channel ID in YouTube’s advanced account settings.</p></li>
        <li><strong>Give reviewers a clear picture</strong><p>Your channel must follow YouTube policies. A public artist video is recommended; channels without public uploads may need additional review.</p></li>
      </ol><a href="#oac-application" className={styles.primary}>Check eligibility & apply <ArrowRight size={17}/></a><a className={styles.help} href="https://support.google.com/youtube/answer/7336634?hl=en" target="_blank" rel="noreferrer">YouTube’s eligibility guidelines <ExternalLink size={13}/></a></section>
    </div>
    <section id="oac-application" className={styles.application} aria-labelledby="oac-apply-heading"><div className={styles.steps}><span>01 · Check eligibility</span><span>02 · Confirm your channel</span><span>03 · Track review</span></div><h2 id="oac-apply-heading">Your artist & application</h2><p>Select your artist to see eligibility, submit a request or follow its progress. Review usually takes 4–8 weeks after submission. OAC is separate from Content ID.</p><YoutubeOacCard standalone/><p className={styles.terms}>Your first application has no resubmission fee. If rejected, a new application costs ₹80. Approved channels can request change assistance from their application status.</p></section>
    {playing && <CustomerOverlay><section ref={node => {dialog.current = node;}} role="dialog" aria-modal="true" aria-labelledby="oac-video-title" tabIndex={-1} className={styles.videoDialog}><div className={styles.videoHeader}><h2 id="oac-video-title">Your Official Artist Channel</h2><button type="button" onClick={close} aria-label="Close video"><X/></button></div><iframe title="YouTube Official Artist Channel explainer" src="https://www.youtube-nocookie.com/embed/EwY6doa-0Bg?start=31&autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen/><a href="https://www.youtube.com/watch?v=EwY6doa-0Bg&t=31s" target="_blank" rel="noreferrer">Watch on YouTube <ExternalLink size={14}/></a></section></CustomerOverlay>}
  </main>;
}
