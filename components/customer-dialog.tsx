"use client";

import type { ReactNode, Ref } from 'react';
import { X } from 'lucide-react';
import { CustomerOverlay } from './customer-overlay';
import s from './customer-dialog.module.css';

/** Shared customer dialog: fixed chrome, one scrolling body and visible actions. */
export function CustomerDialog({ open, titleId, title, eyebrow = 'Artist services', description, children, footer, onClose, closeLabel = 'Close dialog', busy = false, dialogRef, compact = false, purchaseReview = false, wide = false }: {
  open: boolean; titleId: string; title: ReactNode; eyebrow?: string; description?: ReactNode;
  children: ReactNode; footer?: ReactNode; onClose: () => void; closeLabel?: string;
  busy?: boolean; dialogRef: Ref<HTMLElement>; compact?: boolean; purchaseReview?: boolean; wide?: boolean;
}) {
  return <CustomerOverlay open={open}><div className={s.backdrop} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section data-purchase-review={purchaseReview || undefined} ref={dialogRef} role="dialog" aria-modal="true" aria-busy={busy || undefined} aria-labelledby={titleId} aria-describedby={description ? `${titleId}-description` : undefined} tabIndex={-1} className={s.dialog} data-compact={compact || undefined} data-wide={wide || undefined}>
      <header className={s.header}><div><p className={s.eyebrow}>{eyebrow}</p><h2 id={titleId}>{title}</h2>{description ? <p id={`${titleId}-description`} className={s.description}>{description}</p> : null}</div><button type="button" className={s.close} aria-label={closeLabel} disabled={busy} onClick={onClose}><X size={19}/></button></header>
      <div className={s.body}>{children}</div>
      {footer ? <footer className={s.footer}>{footer}</footer> : null}
    </section>
  </div></CustomerOverlay>;
}
