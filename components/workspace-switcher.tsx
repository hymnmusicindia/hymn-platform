"use client";

import { Disc3, Music2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function WorkspaceSwitcher({ current }: { current: "customer" | "producer" }) {
  const router = useRouter(); const pathname = usePathname(); const [switching, setSwitching] = useState<"customer" | "producer" | null>(null);
  function choose(target: "customer" | "producer") {
    if (target === current || switching) return;
    setSwitching(target);
    window.setTimeout(() => router.push(target === "producer" ? "/producer/dashboard" : "/dashboard"), 170);
  }
  return <div className={`workspace-switcher ${switching ? "is-switching" : ""}`} data-current={current} aria-label="Choose workspace">
    <span className="workspace-switcher-label">Viewing as</span>
    <div className="workspace-switcher-track" role="group">
      <span className="workspace-switcher-thumb" aria-hidden="true" />
      <button type="button" className={current === "customer" ? "is-active" : ""} aria-pressed={current === "customer"} onClick={() => choose("customer")} title="Music distribution workspace"><Music2 /> <span>Artist</span></button>
      <button type="button" className={current === "producer" ? "is-active" : ""} aria-pressed={current === "producer"} onClick={() => choose("producer")} title="Beat selling workspace"><Disc3 /> <span>Producer</span></button>
    </div>
    <span className="sr-only" aria-live="polite">{switching ? `Opening ${switching} workspace` : `${current} workspace selected on ${pathname}`}</span>
  </div>;
}
