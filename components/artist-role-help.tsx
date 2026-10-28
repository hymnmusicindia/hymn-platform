"use client";

import { useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import "./language-field-help.css";

export function ArtistRoleHelp() {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  return <span className="language-field-help">
    <button type="button" aria-label="About primary and featured artists" aria-expanded={open}
      aria-controls={id} aria-haspopup="dialog" onClick={event => {
        const panel = popup.current;
        if (!panel) return;
        if (panel.matches(":popover-open")) { panel.hidePopover(); return; }
        const anchor = event.currentTarget.getBoundingClientRect();
        panel.showPopover();
        const { width, height } = panel.getBoundingClientRect();
        panel.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
        panel.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - height - 12))}px`;
      }}><CircleHelp size={15} aria-hidden="true" /></button>
    <div ref={popup} id={id} popover="auto" role="dialog" aria-label="Artist credit help"
      className="language-field-popup" onToggle={event => setOpen(event.newState === "open")}>
      <strong>Primary or featured?</strong>
      <p>Add the lead artist(s) here to credit the release to their main artist page.</p>
      <p>Add guest performers under Featured artists. On Spotify, these releases usually appear in their &ldquo;Appears On&rdquo; section. Placement varies by store.</p>
    </div>
  </span>;
}
