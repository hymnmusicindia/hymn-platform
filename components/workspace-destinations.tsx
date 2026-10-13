"use client";
import Link from "next/link";
import { Home, LayoutGrid } from "lucide-react";

export function WorkspaceDestinations({ homeActive = false, overviewActive = false, overviewHref, onOverview, onNavigate }: {
  homeActive?: boolean; overviewActive?: boolean; overviewHref?: string; onOverview?: () => void; onNavigate?: () => void;
}) {
  const overview = <><LayoutGrid size={16}/><span>Overview</span></>;
  return <nav className="workspace-destinations" aria-label="Workspace destinations">
    <Link href="/" className="workspace-destination workspace-home-link" aria-label="Home" aria-current={homeActive ? "page" : undefined} title="Home" onClick={onNavigate}><Home size={16}/><span>Home</span></Link>
    {onOverview ? <button type="button" className="workspace-destination" aria-label="Overview" aria-current={overviewActive ? "page" : undefined} title="Overview" onClick={() => { onOverview(); onNavigate?.(); }}>{overview}</button>
      : overviewHref ? <Link className="workspace-destination" href={overviewHref} aria-label="Overview" aria-current={overviewActive ? "page" : undefined} title="Overview" onClick={onNavigate}>{overview}</Link> : null}
  </nav>;
}
