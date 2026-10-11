import Link from "next/link";
import { ArrowRight, AudioLines, ChevronDown, Clock3 } from "lucide-react";
import styles from "./analytics-empty-state.module.css";

export function AnalyticsEmptyState({ compact = false }: { compact?: boolean }) {
  return <section className={styles.panel} aria-label="Analytics reporting status">
    <div className={styles.topline}><span className={styles.eyebrow}><AudioLines size={18} aria-hidden="true" />Catalogue performance</span><span className={styles.status}><Clock3 size={13} aria-hidden="true" />Awaiting reports</span></div>
    <div className={styles.content}>
      <div className={styles.copy}>
        <h2>Verified analytics will appear here.</h2>
        <p>See how your music moves. Once HYMN receives verified reports for your catalogue, your performance will appear here.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href={compact ? "/analytics" : "/dashboard/releases"}>{compact ? "Open full analytics" : "View catalogue"}<ArrowRight size={16} aria-hidden="true" /></Link>
          <span className={styles.note}>Verified data. A clearer picture.</span>
        </div>
      </div>
      <div className={styles.artwork} aria-hidden="true"><AudioLines strokeWidth={1} /><span>Every listen has a story.</span></div>
    </div>
    <details className={styles.explainer}><summary>How reporting works<ChevronDown size={16} aria-hidden="true" /></summary><p>Stores supply performance reports on their own schedules. HYMN shows the data after it has been received and verified. Reports reflect their stated reporting period, rather than real-time activity. Estimates and unavailable audience demographics are not shown.</p></details>
  </section>;
}
