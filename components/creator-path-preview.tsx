import Image from 'next/image';
import { AudioLines, Check, FileCheck2, Headphones, ListMusic } from 'lucide-react';
import type { CreatorRole } from '@/lib/creator-paths';
import styles from './creator-path-preview.module.css';

const scenes = {
  producer: { image: '/assets/creators/producer-doodle-v1.png', label: 'The details, covered.', rows: ['Purchase-linked licences', 'Recorded order terms', 'Private file delivery'], Icon: FileCheck2 },
  engineer: { image: '/assets/creators/engineer-doodle-v1.png', label: 'Room for great work.', rows: ['Files & conversations', 'Revision tracking', 'Final delivery'], Icon: Headphones },
  curator: { image: '/assets/creators/curator-doodle-v1.png', label: 'A more thoughtful queue.', rows: ['Your fee & capacity', 'Listening notes', 'Review deadlines'], Icon: ListMusic }
} as const;
export function CreatorPathPreview({ role, compact = false }: { role: CreatorRole; compact?: boolean }) {
  const scene = scenes[role];
  return <div className={styles.scene} data-compact={compact} aria-hidden="true">
    <div className={styles.orbit}/><span className={styles.spark}>+</span>
    <Image src={scene.image} alt="" fill sizes="(max-width:760px) 100vw, 50vw" className={styles.artwork}/>
    <div className={styles.badge}><AudioLines size={14}/>YOUR CRAFT, CONNECTED.</div>
    <div className={styles.card}><div className={styles.cardTitle}><span><scene.Icon size={17} strokeWidth={1.5}/></span><strong>{scene.label}</strong></div><div className={styles.rows}>{scene.rows.map(row=><span key={row}><Check size={12}/>{row}</span>)}</div></div>
  </div>;
}
