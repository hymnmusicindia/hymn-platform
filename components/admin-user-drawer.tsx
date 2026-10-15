"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./admin-user-drawer.module.css";

export function AdminUserDrawer({ name, onClose, children }: { name: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; focused?.focus(); };
  }, []);
  return <dialog ref={ref} className={styles.drawer} aria-label={`Account details: ${name}`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.inner}>
      <header className={styles.header}><div><p>User workspace</p><h2>{name}</h2></div><button type="button" className="btn-outline" onClick={onClose} aria-label="Close user details"><X size={18}/></button></header>
      <nav className={styles.links} aria-label="Account shortcuts"><a href="#user-records">Releases & activity</a><a href="#user-benefits">Plan & credits</a><a href="#user-controls">Access & flags</a></nav>
      <div className={styles.body}>{children}</div>
    </div>
  </dialog>;
}
