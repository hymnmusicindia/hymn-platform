"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import styles from "./save-indicator.module.css";

export function SaveIndicator({ state, error, conflict, onRetry }: {
  state: "waiting" | "saving" | "saved" | "error";
  error: string | null;
  conflict: boolean;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const failed = state === "error";
  const label = failed ? "Save failed" : state === "saved" ? "Saved" : state === "saving" ? "Saving" : "Changes pending";
  if (!mounted) return null;
  return createPortal(<aside className={styles.root} data-state={state} onKeyDown={event => { if (event.key === "Escape") setExpanded(false); }}>
    {failed ? <div className={styles.failure} data-expanded={expanded || undefined}>
      <button type="button" className={styles.status} aria-expanded={expanded} aria-controls="release-save-error" onClick={() => setExpanded(value => !value)}>
        <X size={16} aria-hidden="true" /><span>{label}</span>
      </button>
      <div id="release-save-error" className={styles.details}>
        <strong>Your changes haven’t been saved.</strong>
        <p>{error || "Could not save your changes. Please try again."}</p>
        {conflict ? <p>Keep this page open and check the latest draft in another tab before reloading.</p> : <button type="button" onClick={onRetry}>Retry save</button>}
      </div>
    </div> : <span className={styles.status} role="status"><span key={state} className={styles.icon}>{state === "saved" ? <Check size={16} /> : <Loader2 size={16} className={state === "saving" ? styles.spinner : undefined} />}</span>{label}</span>}
    <span className={styles.srOnly} role="status">{failed ? `${label}: ${error || "Please try again."}` : ""}</span>
  </aside>, document.body);
}
