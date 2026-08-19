"use client";

import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export function ContextualHelp({ faqId, label, children, side = "top" }: { faqId: string; label: string; children: string; side?: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const href = `/faq#${faqId}`;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <span ref={rootRef} className={`context-help ${open ? "is-open" : ""}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <Link href={href} className="context-help-trigger" aria-label={`Help: ${label}`} aria-describedby={id} onClick={(event) => { if (window.matchMedia("(hover: none), (pointer: coarse)").matches && !open) { event.preventDefault(); setOpen(true); } }}>
        <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      <span id={id} role="tooltip" className={`context-help-tooltip context-help-tooltip-${side}`}>
        <span>{children}</span>
        <Link href={href} className="context-help-more">Learn More <span aria-hidden="true">→</span></Link>
      </span>
    </span>
  );
}
