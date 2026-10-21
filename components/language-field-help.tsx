"use client";

import { useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import "./language-field-help.css";

export function LanguageFieldHelp({ track = false }: { track?: boolean }) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return <span className="language-field-help">
    <button type="button" aria-label={track ? "What does track language mean?" : "What does release language mean?"}
      aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={event => {
        const panel = popup.current;
        if (!panel) return;
        if (panel.matches(":popover-open")) { panel.hidePopover(); return; }
        const anchor = event.currentTarget.getBoundingClientRect();
        panel.showPopover();
        const { width, height } = panel.getBoundingClientRect();
        panel.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
        panel.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - height - 12))}px`;
      }}><CircleHelp size={15} aria-hidden="true" /></button>
    <div ref={popup} id={id} popover="auto" role="dialog" aria-label={track ? "Track language help" : "Release language help"}
      className="language-field-popup" onToggle={event => setOpen(event.newState === "open")}>
      <strong>{track ? "Track language" : "Release language"}</strong>
      <p>{track ? "Choose the language sung or spoken, not the title’s script. “Ye Zindagi…” uses Latin letters but is Hindi: select Hindi. Use Instrumental only for audio without lyrics." : "Choose the release’s main language. For this Hindi single, select Hindi here and for track language—even though the title uses Latin letters. HYMN has no separate title-language field."}</p>
    </div>
  </span>;
}
