"use client";
import { CustomerOverlay } from "./customer-overlay";
import { useAccessibleDialog } from "./ui/use-accessible-dialog";
import { ArrowRight, Check, ShieldCheck, X } from "lucide-react";
import styles from "./final-release-confirmation.module.css";

export function FinalReleaseConfirmation({open, onClose, onAgree}: {open: boolean; onClose(): void; onAgree(): void}) {
  const dialog = useAccessibleDialog(open, onClose);
  return <CustomerOverlay open={open}><div className={styles.backdrop} style={{backdropFilter:"blur(10px)"}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="final-release-title" aria-describedby="final-release-copy final-release-next" tabIndex={-1} className={styles.dialog}>
      <button type="button" className={styles.close} aria-label="Close final confirmation" onClick={onClose}><X size={19} aria-hidden="true"/></button>
      <div className={styles.symbol} aria-hidden="true"><ShieldCheck size={26}/></div>
      <p className={styles.eyebrow}>Release submission</p>
      <h2 id="final-release-title" className={styles.title}>One final confirmation</h2>
      <div className={styles.agreement}>
        <span className={styles.check} aria-hidden="true"><Check size={16}/></span>
        <p id="final-release-copy">I have checked the music, credits, rights and delivery details, and I have authority to distribute this release.</p>
      </div>
      <p id="final-release-next" className={styles.next}>By choosing <strong>I agree</strong>, you confirm these details and send your release to HYMN for review.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onClose}>Back to review</button>
        <button type="button" className={styles.primary} onClick={onAgree}><span>I agree - submit release</span><ArrowRight size={17} aria-hidden="true"/></button>
      </div>
    </section>
  </div></CustomerOverlay>;
}
