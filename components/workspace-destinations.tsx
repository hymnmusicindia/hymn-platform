"use client";
import Link from "next/link";
import { Home, LayoutGrid } from "lucide-react";

export function WorkspaceDestinations({ homeActive = false, overviewActive = false, overviewHref, onOverview, onNavigate }: {
  homeActive?: boolean; overviewActive?: boolean; overviewHref?: string; onOverview?: () => void; onNavigate?: () => void;
}) {
  const overview = <><LayoutGrid size={16}/><span>Dashboard</span></>;
  return <nav className="workspace-destinations" aria-label="Workspace destinations">
    <Link href="/" prefetch={true} className="workspace-destination workspace-home-link" aria-label="Home" aria-current={homeActive ? "page" : undefined} title="Home" onClick={onNavigate}><Home size={16}/><span>Home</span></Link>
    {onOverview ? <button type="button" className="workspace-destination" aria-label="Dashboard" aria-current={overviewActive ? "page" : undefined} title="Dashboard" onClick={() => { onOverview(); onNavigate?.(); }}>{overview}</button>
      : overviewHref ? <Link className="workspace-destination" href={overviewHref} prefetch={true} aria-label="Dashboard" aria-current={overviewActive ? "page" : undefined} title="Dashboard" onClick={onNavigate}>{overview}</Link> : null}
  </nav>;
}
