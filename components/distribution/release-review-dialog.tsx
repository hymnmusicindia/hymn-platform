"use client";

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { CustomerOverlay } from '../customer-overlay';
import { useAccessibleDialog } from '../ui/use-accessible-dialog';
import styles from './release-review-dialog.module.css';

export function ReleaseReviewDialog({open,onClose,children,actions}:{open:boolean;onClose:()=>void;children:ReactNode;actions:ReactNode}) {
  const dialog=useAccessibleDialog(open,onClose);
  return <CustomerOverlay open={open}><div className={styles.backdrop} onClick={event=>{if(event.currentTarget===event.target)onClose();}}>
    <section ref={dialog} className={styles.letter} role="dialog" aria-modal="true" aria-label="Review your release" tabIndex={-1}>
      <div className={styles.toolbar}><div className={styles.brand}><strong>HYMN</strong><span>Release review</span></div><button type="button" aria-label="Close release review" onClick={onClose}><X size={18}/></button></div>
      <div className={styles.content} data-review-scroll>{children}</div>
      <div className={styles.actions}>{actions}</div>
    </section>
  </div></CustomerOverlay>;
}
