"use client";

import Link from 'next/link';
import {useState} from 'react';
import { ArrowRight, ArrowUpRight, Search, X } from 'lucide-react';
import styles from './promotion-tools.module.css';

const tools = [
  { title: 'One official home for your music', description: 'Bring your artist channel and releases together on YouTube.', category: 'YouTube Official Artist Channel', action: 'Choose your artist', href: '/promotion/youtube-oac', tone: 'youtube', logo: '/assets/promotion/youtube-music-transparent.png', image: '/assets/promotion/shreya-ghoshal.jpg' },
  { title: 'Make your Spotify profile yours', description: 'Claim your profile, tell your story and get to know your listeners.', category: 'Spotify for Artists', action: 'Get started', href: 'https://artists.spotify.com/get-started', tone: 'spotify', logo: '/assets/store-logos/wordmark-spotify.png', image: '/assets/onboarding/artist.jpg' },
  { title: 'Find the right playlists for your sound', description: 'Explore curator reviews and discover where your next release fits.', category: 'Playlist discovery', action: 'Explore playlists', href: '#promotion-playlists', tone: 'playlists', image: '/assets/playlist-images/previews/1.webp' },
  { title: 'Give your next release a plan', description: 'Talk to HYMN about campaigns, creative support and your audience.', category: 'Campaign support', action: 'Plan your campaign', href: '#promotion-campaigns', tone: 'campaign', image: '/assets/onboarding/producer.jpg' },
  { title: 'Pitch your next release on Spotify', description: 'Learn how editorial pitching works before release day.', category: 'Release preparation', action: 'Read the guide', href: 'https://support.spotify.com/us/artists/article/pitching-music-to-playlist-editors/', tone: 'pitch', logo: '/assets/store-logos/wordmark-spotify.png', image: '/assets/promotion/record-rights.jpg' },
  { title: 'Build something bigger, together', description: 'Tailored music services for collectives, campus clubs and cypher crews.', category: 'Community plans', action: 'Explore community plans', href: '#community-plans', tone: 'community', image: '/assets/promotion/community-concert.jpg' },
];
const resources = [
  { title: 'Build your Official Artist Channel', source: 'YouTube for Artists', href: 'https://artists.youtube/resources/', image: '/assets/promotion/youtube-oac-guide.webp' },
  { title: 'Understand your audience on YouTube', source: 'YouTube for Artists', href: 'https://artists.youtube/resources/analytics-for-artists/', image: '/assets/promotion/youtube-analytics.webp' },
  { title: 'Get ready for your next release', source: 'Spotify for Artists', href: 'https://artists.spotify.com/get-started', image: '/assets/onboarding/producer.jpg' },
];

export function PromotionTools({ onSelect }: { onSelect: (id: string) => void }) {
  const [query,setQuery]=useState('');
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches=(tool:typeof tools[number])=>terms.every(term=>`${tool.title} ${tool.description} ${tool.category} ${tool.tone==='youtube'?'oac youtube channel video':tool.tone==='community'?'concert campus society collective cypher club':tool.tone==='campaign'?'instagram facebook social advertising marketing':''}`.toLowerCase().includes(term));
  const visible=tools.filter(matches);
  return <div className={styles.tools}>
    <label className={styles.search}><Search size={19}/><span className="sr-only">Search promotion tools</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a tool: YouTube, playlists, campaigns..."/>{query?<button type="button" aria-label="Clear tool search" onClick={()=>setQuery('')}><X size={17}/></button>:<kbd>Explore your next move</kbd>}</label>
    <p role="status" className="sr-only">{visible.length} promotion tools found</p>
    <section aria-labelledby="essential-tools"><div className={styles.sectionHeading}><h2 id="essential-tools">Essential tools</h2><p>A stronger presence. A clearer plan. More ways to reach your listeners.</p></div>
      <div className={styles.grid}>{visible.map(tool => {
        const external = tool.href.startsWith('https:');
        return <Link key={tool.title} href={tool.href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className={`${styles.card} ${styles[tool.tone]}`} onClick={event => { if (tool.href.startsWith('#')) { event.preventDefault(); onSelect(tool.href.slice(1)); } }}>
          <span className={styles.category}>{tool.category}</span>
          <div className={styles.art} aria-hidden="true"><img src={tool.image} alt="" loading="lazy"/>{tool.logo ? <span className={styles.brand}><img src={tool.logo} alt=""/></span> : null}</div>
          <div className={styles.copy}><h3>{tool.title}</h3><p>{tool.description}</p><span className={styles.action}>{tool.action}{external ? <ArrowUpRight size={17}/> : <ArrowRight size={17}/>}</span></div>
        </Link>;
      })}</div>{!visible.length?<div className={styles.empty}><h3>No tools match "{query}"</h3><p>Try artist, playlist, community or campaign.</p><button type="button" onClick={()=>setQuery('')}>Show all tools</button></div>:null}
    </section>
    <section aria-labelledby="promotion-resources"><div className={styles.sectionHeading}><h2 id="promotion-resources">Advice for your next move</h2><p>Practical guides, straight from the platforms.</p></div><div className={styles.resources}>{resources.map(item => <a key={item.title} href={item.href} target="_blank" rel="noreferrer"><img src={item.image} alt="" loading="lazy"/><div><small>{item.source}</small><h3>{item.title}<ArrowUpRight size={16}/></h3></div></a>)}</div></section>
    <section className={styles.support} aria-labelledby="promotion-support"><div><h2 id="promotion-support">Need an extra pair of hands?</h2><p>Tell us about your release. We’ll help you find the right next step.</p></div><button type="button" onClick={() => onSelect('promotion-campaigns')}>Talk to HYMN <ArrowRight size={16}/></button></section>
  </div>;
}
