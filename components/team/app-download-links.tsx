"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Copy, Download, Smartphone } from "lucide-react";
import styles from "./app-download.module.css";

export function TeamAppLinks({ compact = false }: { compact?: boolean }) {
  const [message, setMessage] = useState("");
  const [fallback, setFallback] = useState("");
  const field = useRef<HTMLInputElement>(null);
  async function copyLink() {
    const link = `${window.location.origin}/team/app`;
    try { await navigator.clipboard.writeText(link); setMessage("App link copied."); }
    catch { setFallback(link); setMessage("Select and copy the app link below."); requestAnimationFrame(() => { field.current?.focus(); field.current?.select(); }); }
  }
  const content = <div className={styles.links}>
    <a className={styles.download} href="/team/app/download"><Download size={16} aria-hidden="true" />Download Android app</a>
    <button type="button" onClick={() => void copyLink()}><Copy size={16} aria-hidden="true" />Copy app link</button>
    {compact ? <Link href="/team/app">Version & install instructions</Link> : null}
    {fallback ? <label className={styles.fallback}>App link<input ref={field} value={fallback} readOnly onFocus={event => event.target.select()} /></label> : null}
    {message ? <span className={styles.status} role="status">{message}</span> : null}
  </div>;
  return compact ? <details className={styles.menu}><summary><Smartphone size={17} aria-hidden="true" />HYMN Team app</summary>{content}</details> : content;
}
