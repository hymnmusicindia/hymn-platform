"use client";

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Play, X } from 'lucide-react';
import { YoutubeOacCard } from './youtube-oac-card';
import { CustomerOverlay } from './customer-overlay';
import { useAccessibleDialog } from './ui/use-accessible-dialog';
import styles from './youtube-oac-page.module.css';

export function YoutubeOacPage() {
  const [playing, setPlaying] = useState(false);
  const close = useCallback(() => setPlaying(false), []);
  const dialog = useAccessibleDialog(playing, close);
  return <main className={styles.page}>
    <Link href="/dashboard?tab=promotions" className={styles.back}>← Promotion</Link>
    <header className={styles.heading}><h1>YouTube Official Artist Channel</h1><p>Apply for a YouTube Official Artist Channel with HYMN, and give listeners one place to discover your music.</p></header>
    <div className={styles.hero}>
      <div>
        <div className={styles.visual}>
          <div className={styles.visualBrand}><img src="/assets/promotion/youtube-music-original.png" alt="YouTube Music"/></div>
          <img className={styles.analyticsImage} src="/assets/promotion/youtube-overview.webp" alt="YouTube's example Artist Analytics dashboard"/>
          <div className={styles.phone}><div className={styles.portrait} role="img" aria-label="Shreya Ghoshal, illustrative artist channel portrait"/><div className={styles.artist}><span>Artist channel example</span><strong>Shreya Ghoshal</strong></div><div className={styles.phoneTracks}><div>Home <span>Releases</span> Videos</div><b>Discover the music</b><span className={styles.trackRow}><i/>Albums & singles</span><span className={styles.trackRow}><i/>Music videos</span></div></div>
          <button type="button" className={styles.play} onClick={() => setPlaying(true)} aria-label="Play Official Artist Channel explainer"><Play size={19} fill="currentColor"/></button><span className={styles.playLabel}>See how it works</span>
        </div>
        <p className={styles.credit}>Illustrative channel; no artist endorsement. Analytics image: YouTube. Photo: <a href="https://commons.wikimedia.org/wiki/File:Shreya.Ghoshal.jpg" target="_blank" rel="noreferrer">Bollywood Hungama / Wikimedia Commons</a>, <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. Cropped for display.</p>
      </div>
      <section className={styles.requirements} aria-labelledby="oac-requirements"><h2 id="oac-requirements">Make a channel request</h2><p>A one-time application for each artist. You do not need to reapply after every release.</p><ol>
        <li><strong>One artist, one channel</strong><p>Manage a channel dedicated to your artist’s music. Use the artist’s name so reviewers can identify it.</p></li>
        <li><strong>Get your artist profile ready</strong><p>HYMN requires a verified artist profile and at least five fully live releases before submission.</p></li>
        <li><strong>Use your channel ID link</strong><p>Paste <code>https://www.youtube.com/channel/UC…</code>. Handle links such as <code>/@artist</code>, custom URLs and video links are not accepted. Find your channel ID in YouTube’s advanced account settings.</p></li>
        <li><strong>Give reviewers a clear picture</strong><p>Your channel must follow YouTube policies. A public artist video is recommended; channels without public uploads may need additional review.</p></li>
      </ol><div id="oac-application"><YoutubeOacCard standalone/></div><p className={styles.terms}>First application: no resubmission fee. Rejected applications: ₹80 to resubmit after correcting the issue.</p><a className={styles.help} href="https://support.google.com/youtube/answer/7336634?hl=en" target="_blank" rel="noreferrer">YouTube's eligibility guidelines <ExternalLink size={13}/></a></section>
    </div>
    <section className={styles.application} aria-labelledby="oac-next-heading"><h2 id="oac-next-heading">What happens next?</h2><div className={styles.steps}><article><span>01</span><h3>Choose your artist</h3><p>Check your profile and live releases, then confirm the channel you own.</p></article><article><span>02</span><h3>Submit for review</h3><p>HYMN checks your application before sending it for partner review. Review usually takes 4–8 weeks after submission.</p></article><article><span>03</span><h3>Follow your progress</h3><p>Select the same artist here to see updates, approval or a rejection reason. Once approved, future releases do not need a new OAC application.</p></article></div><p className={styles.terms}>OAC is separate from Content ID. Approved artists can request channel-change assistance from their application status.</p></section>
    {playing && <CustomerOverlay><section ref={node => {dialog.current = node;}} role="dialog" aria-modal="true" aria-labelledby="oac-video-title" tabIndex={-1} className={styles.videoDialog}><div className={styles.videoHeader}><h2 id="oac-video-title">Your Official Artist Channel</h2><button type="button" onClick={close} aria-label="Close video"><X/></button></div><iframe title="YouTube Official Artist Channel explainer" src="https://www.youtube-nocookie.com/embed/EwY6doa-0Bg?start=31&autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen/><a href="https://www.youtube.com/watch?v=EwY6doa-0Bg&t=31s" target="_blank" rel="noreferrer">Watch on YouTube <ExternalLink size={14}/></a></section></CustomerOverlay>}
  </main>;
}
