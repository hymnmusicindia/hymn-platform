import Link from 'next/link';
import { ArrowUpRight, Disc3, Headphones, ListMusic } from 'lucide-react';
import styles from './home-creator-invitation.module.css';
import { CreatorPathPreview } from './creator-path-preview';

const paths = [
  { role: 'producer', title: 'Producers', copy: 'Your beats. A store that feels like you.', action: 'Open my beat store', href: '/producer-onboarding', icon: Disc3 },
  { role: 'engineer', title: 'Mixing & mastering engineers', copy: 'Put your best work in front of artists.', action: 'Apply as an engineer', href: '/join/engineer', icon: Headphones },
  { role: 'curator', title: 'Playlist curators', copy: 'Your taste. A useful next step for artists.', action: 'Apply as a curator', href: '/join/curator', icon: ListMusic }
] as const;

export function HomeCreatorInvitation() {
  return <section id="creator-invitation" className={styles.root} aria-labelledby="creator-invitation-title">
    <header><p>FOR THE PEOPLE BEHIND THE MUSIC</p><h2 id="creator-invitation-title">Bring your craft to HYMN.</h2></header>
    <div className={styles.paths}>{paths.map(path => <Link key={path.title} href={path.href} className={styles.path}>
      <CreatorPathPreview role={path.role} compact/>
      <span className={styles.icon}><path.icon size={25} strokeWidth={1.3}/></span>
      <h3>{path.title}</h3><p>{path.copy}</p>
      <span className={styles.action}>{path.action}<ArrowUpRight size={17}/></span>
    </Link>)}</div>
  </section>;
}
