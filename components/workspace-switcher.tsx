"use client";

import { ArrowRight, Disc3, Music2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function WorkspaceSwitcher({ current }: { current: "customer" | "producer" }) {
  const router = useRouter(); const pathname = usePathname(); const [switching, setSwitching] = useState<"customer" | "producer" | null>(null);
  function choose(target: "customer" | "producer") {
    if (target === current || switching) return;
    setSwitching(target);
    window.setTimeout(() => router.push(target === "producer" ? "/producer/dashboard" : "/dashboard"), 170);
  }
  const CurrentIcon = current === "customer" ? Music2 : Disc3;
  const destination = current === "customer" ? "producer" : "customer";
  return <div className={`workspace-switcher ${switching ? "is-switching" : ""}`} aria-label="Workspace switcher">
    <span className="workspace-switcher-current"><CurrentIcon aria-hidden="true" /><span><small>Current workspace</small><strong>{current === "customer" ? "Artist" : "Producer"}</strong></span></span>
    <button type="button" className="workspace-switcher-action" onClick={() => choose(destination)} disabled={Boolean(switching)}>
      <span>{switching ? "Opening…" : `Switch to ${destination === "customer" ? "Artist" : "Producer"}`}</span><ArrowRight aria-hidden="true" />
    </button>
    <span className="sr-only" aria-live="polite">{switching ? `Opening ${switching} workspace` : `${current} workspace selected on ${pathname}`}</span>
  </div>;
}
