"use client";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./admin-centered-dialog.module.css";
export function AdminCenteredDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; const before = document.activeElement instanceof HTMLElement ? document.activeElement : null; const overflow = document.body.style.overflow; d?.showModal(); document.body.style.overflow = "hidden"; return () => { d?.close(); document.body.style.overflow = overflow; before?.focus(); }; }, []);
  return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close details">×</button></header><div className={styles.body}>{children}</div></dialog>;
}
