import Link from "next/link";
import { Plus } from "lucide-react";
import styles from "./add-release-card.module.css";

export function AddReleaseCard() {
  return <Link href="/distribution/start" aria-label="Add your release — open release wizard" className={`release-summary-tile ${styles.card}`}>
    <div className={`release-summary-artwork ${styles.art}`} aria-hidden="true"><span className={styles.plus}><Plus size={44} strokeWidth={1.5} /></span></div>
    <h3 className={`release-summary-title ${styles.title}`}>Add your release</h3>
    <p className={`release-summary-subtitle ${styles.description}`}>Single, EP or Album. Make it yours.</p>
  </Link>;
}
