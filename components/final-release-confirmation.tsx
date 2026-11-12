"use client";
import { CustomerDialog } from "./customer-dialog";
import { useAccessibleDialog } from "./ui/use-accessible-dialog";
import { ArrowRight, Check } from "lucide-react";
import styles from "./final-release-confirmation.module.css";

export function FinalReleaseConfirmation({open, onClose, onAgree}: {open: boolean; onClose(): void; onAgree(): void}) {
  const dialog = useAccessibleDialog(open, onClose);
  return <CustomerDialog open={open} compact dialogRef={dialog} titleId="final-release-title" title="One final confirmation" eyebrow="Release submission" description="Check your authority to distribute before sending this release for review." onClose={onClose} closeLabel="Close final confirmation" footer={<>
    <button type="button" className="btn-outline" onClick={onClose}>Back to review</button>
    <button type="button" className="btn-primary" onClick={onAgree}><span>I agree - submit release</span><ArrowRight size={17} aria-hidden="true"/></button>
  </>}>
    <div className={styles.agreement}><span className={styles.check} aria-hidden="true"><Check size={16}/></span><p>I have checked the music, credits, rights and delivery details, and I have authority to distribute this release.</p></div>
    <p className={styles.next}>By choosing <strong>I agree</strong>, you confirm these details and send your release to HYMN for review.</p>
  </CustomerDialog>;
}
