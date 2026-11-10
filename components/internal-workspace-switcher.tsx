"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Users } from "lucide-react";
import styles from "./internal-navigation.module.css";
type Workspace = { id: string; name: string; kind: string; href: string };
export function InternalWorkspaceSwitcher({ current, name }: { current: string; name: string }) {
  const [items, setItems] = useState<Workspace[]>([]);
  useEffect(() => { let live = true; fetch("/api/workspaces", { cache: "no-store" }).then(r => r.ok ? r.json() : { items: [] }).then(r => { if (live && Array.isArray(r.items)) setItems(r.items.filter((item: Workspace) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.href === "string")); }).catch(() => {}); return () => { live = false; }; }, []);
  const destinations = items.some(item => item.id === current) ? items : [{ id: current, name, kind: current === "admin" ? "admin" : "team", href: current === "admin" ? "/admin" : `/team?workspace=${encodeURIComponent(current)}` }, ...items];
  const teams = destinations.filter(item => item.kind === "team");
  return <div className={styles.switcher} role="navigation" aria-label="Switch internal workspace">{destinations.filter(item => item.kind === "team" || item.kind === "admin").map(item => {
    const Icon = item.kind === "admin" ? ShieldCheck : Users;
    const label = item.kind === "admin" ? "Admin OS" : teams.length > 1 ? item.name : "Team OS";
    return <Link key={item.id} href={item.href} prefetch={false} className={styles.destination} aria-current={item.id === current ? "page" : undefined} title={item.name}><Icon aria-hidden="true"/><span>{label}</span></Link>;
  })}</div>;
}
