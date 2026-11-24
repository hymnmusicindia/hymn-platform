import Link from 'next/link';
import { ArrowUpRight, Disc3, Headphones, ListMusic } from 'lucide-react';
import styles from './home-creator-invitation.module.css';

const paths = [
  { title: 'Producers', copy: 'Build your storefront and offer beat licences.', action: 'Open my beat store', href: '/producer-onboarding', icon: Disc3 },
  { title: 'Mixing & mastering engineers', copy: 'Share your portfolio and apply to work with artists.', action: 'Apply as an engineer', href: '/studio/apply', icon: Headphones },
  { title: 'Playlist curators', copy: 'Add your playlist and apply to review artists\u2019 tracks.', action: 'Apply as a curator', href: '/login?next=%2Fdashboard%2Fplaylists%3FreviewView%3Dcurator', icon: ListMusic }
] as const;

export function HomeCreatorInvitation() {
  return <section className={styles.root} aria-labelledby="creator-invitation-title">
    <header><p>FOR THE PEOPLE BEHIND THE MUSIC</p><h2 id="creator-invitation-title">Bring your craft to HYMN.</h2></header>
    <div className={styles.paths}>{paths.map(path => <Link key={path.title} href={path.href} className={styles.path}>
      <span className={styles.icon}><path.icon size={25} strokeWidth={1.3}/></span>
      <h3>{path.title}</h3><p>{path.copy}</p>
      <span className={styles.action}>{path.action}<ArrowUpRight size={17}/></span>
    </Link>)}</div>
  </section>;
}
