import { AudioLines, Check, Headphones, ListMusic, Music2 } from 'lucide-react';
import type { CreatorRole } from '@/lib/creator-paths';
import styles from './creator-path-preview.module.css';

export function CreatorPathPreview({ role, compact = false }: { role: CreatorRole; compact?: boolean }) {
  const Icon = role === 'producer' ? AudioLines : role === 'engineer' ? Headphones : ListMusic;
  return <div className={styles.scene} data-compact={compact} aria-hidden="true">
    <div className={styles.glow}/><div className={styles.sheet}>
      <div className={styles.art}><Icon size={compact ? 28 : 44} strokeWidth={1}/><span>{role === 'producer' ? 'ORIGINAL SOUND' : role === 'engineer' ? 'HYMN STUDIO' : 'CURATED BY YOU'}</span></div>
      <div className={styles.body}><span className={styles.kicker}>YOUR PREVIEW</span><strong>{role === 'producer' ? 'Your next signature sound.' : role === 'engineer' ? 'A sound worth sharing.' : 'A home for fresh discoveries.'}</strong><div className={styles.lines}>{[1,2,3].map(i => <span key={i}><Music2 size={13}/><i/><b>{role === 'curator' ? <Check size={12}/> : <AudioLines size={16}/>}</b></span>)}</div></div>
    </div><span className={styles.float}><Icon size={15}/>{role === 'producer' ? 'Your store. Your identity.' : role === 'engineer' ? 'Your work, in focus.' : 'Independent editorial choice.'}</span>
  </div>;
}
