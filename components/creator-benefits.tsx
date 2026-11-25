import { Check } from 'lucide-react';
import { creatorPerks, type CreatorRole } from '@/lib/creator-paths';
import styles from './creator-benefits.module.css';
export function CreatorBenefits({ role }: { role: CreatorRole }) {
  return <details className={styles.root}><summary>What HYMN handles for you</summary><ul>{creatorPerks[role].map(perk=><li key={perk.title}><Check size={16}/><div><strong>{perk.title}</strong><p>{perk.copy}</p></div></li>)}</ul></details>;
}
