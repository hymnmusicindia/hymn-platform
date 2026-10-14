import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import styles from "./add-release-card.module.css";

export function AddReleaseCard() {
  return <Link href="/distribution" aria-label="Add your release — open distribution portal" className={`release-summary-tile ${styles.card}`}>
    <div className={`release-summary-artwork ${styles.art}`} aria-hidden="true"><span className={styles.plus}><Plus size={44} strokeWidth={1.5} /></span><span className={styles.artLabel}>Your next chapter</span></div>
    <div className={styles.badgeRow}><span className={styles.badge}>Start here</span></div>
    <h3 className={`release-summary-title ${styles.title}`}>Add your release</h3>
    <p className={`release-summary-subtitle ${styles.description}`}>Single, EP or album. Make it yours.</p>
    <div className={`release-summary-actions ${styles.action}`}>Open distribution <ArrowUpRight size={16} aria-hidden="true" /></div>
  </Link>;
}
