"use client";

import { createPortal } from "react-dom";
import { useEffect, type ReactNode } from "react";

/** Customer dialogs escape transformed cards and retain the workspace palette. */
export function CustomerOverlay({ open = true, children }: { open?: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className="hymn-overlay customer-overlay">{children}</div>, document.body);
}
