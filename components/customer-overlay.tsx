"use client";

import "./customer-overlay.css";
import { createPortal } from "react-dom";
import { useEffect, type ReactNode } from "react";

let locks = 0;
let previousOverflow = "";

/** Customer dialogs escape transformed cards and retain the workspace palette. */
export function CustomerOverlay({ open = true, lockScroll = true, children }: { open?: boolean; lockScroll?: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!open || !lockScroll) return;
    if (locks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    return () => { if (--locks === 0) document.body.style.overflow = previousOverflow; };
  }, [open, lockScroll]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div data-theme-surface="overlay" className="hymn-overlay customer-overlay">{children}</div>, document.body);
}
