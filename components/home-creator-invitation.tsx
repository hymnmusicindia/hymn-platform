'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Disc3, Headphones, ListMusic } from 'lucide-react';
import { creatorPerks, type CreatorRole } from '@/lib/creator-paths';
import styles from './home-creator-invitation.module.css';
import { CreatorPathPreview } from './creator-path-preview';

const paths = [
  { role: 'producer', title: 'Producers', headline: 'Your sound.\nYour own store.', copy: 'Build a store around your sound. Keep the details in one place.', action: 'Open my beat store', href: '/producer-onboarding', icon: Disc3 },
  { role: 'engineer', title: 'Engineers', headline: 'Your craft.\nA clearer process.', copy: 'Give artists a place to hear your craft, then manage the project together.', action: 'Apply as an engineer', href: '/join/engineer', icon: Headphones },
  { role: 'curator', title: 'Curators', headline: 'Your taste.\nNew discoveries.', copy: 'Welcome music that fits your audience. Make every review useful.', action: 'Apply as a curator', href: '/join/curator', icon: ListMusic }
] as const;

export function HomeCreatorInvitation() {
  const [role, setRole] = useState<CreatorRole>('producer');
  const path = paths.find(path => path.role === role)!;
  return <section id="creator-invitation" className={styles.root} aria-labelledby="creator-invitation-title">
    <header className={styles.heading}><p>FOR THE PEOPLE BEHIND THE MUSIC</p><h2 id="creator-invitation-title">Make your next move.<br/><span>Make it with HYMN.</span></h2><p>Your craft out front. The tools to support it, together.</p></header>
    <div className={styles.selector} role="group" aria-label="Choose your creator path">{paths.map(item=><button type="button" key={item.role} aria-pressed={role===item.role} aria-controls="creator-path-story" onClick={()=>setRole(item.role)}><item.icon size={17} strokeWidth={1.5}/>{item.title}</button>)}</div>
    <div id="creator-path-story" className={styles.story} role="region" aria-labelledby="creator-path-headline">
      <div className={styles.art}><CreatorPathPreview role={role}/></div>
      <div className={styles.copy} key={role}><p className={styles.eyebrow}>{role === 'engineer' ? 'MIXING & MASTERING' : role === 'producer' ? 'YOUR SOUND. YOUR STORE.' : 'INDEPENDENT CURATION'}</p><h3 id="creator-path-headline">{path.headline}</h3><p className={styles.description}>{path.copy}</p><ul>{creatorPerks[role].map(perk=><li key={perk.title}><span><Check size={14}/></span>{perk.title}</li>)}</ul><Link href={path.href} className={styles.action}>{path.action}<ArrowUpRight size={17}/></Link><small>{role==='producer' ? '70% of eligible sales to you. 30% to HYMN.' : 'Applications are reviewed before publishing.'}</small></div>
      <footer><span>01 <b>Create your profile</b></span><i/><span>02 <b>Share your craft</b></span><i/><span>03 <b>Manage your work</b></span></footer>
    </div>
  </section>;
}
