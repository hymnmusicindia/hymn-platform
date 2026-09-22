"use client";

import { Disc3, LayoutDashboard, Music2 } from "lucide-react";
import Link from "next/link";

export type Workspace = "customer" | "producer" | "admin";
const workspaces = {
  customer: { label: "Artist", href: "/dashboard", icon: Music2 },
  producer: { label: "Producer", href: "/producer/dashboard", icon: Disc3 },
  admin: { label: "Admin", href: "/admin", icon: LayoutDashboard }
} as const;

export function WorkspaceSwitcher({ current, available = ["customer", "producer"] }: { current: Workspace; available?: Workspace[] }) {
  const items = Array.from(new Set([current, ...available])).filter((key) => workspaces[key]);
  return <nav className="workspace-switcher" aria-label="Switch workspace">
    {items.map((key) => { const item = workspaces[key]; const Icon = item.icon; const active = key === current; return <Link key={key} href={item.href} prefetch aria-current={active ? "page" : undefined} className={`workspace-switcher-option ${active ? "is-active" : ""}`}><Icon aria-hidden="true"/><span>{item.label}</span></Link>; })}
  </nav>;
}
