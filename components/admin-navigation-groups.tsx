"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LayoutGrid } from "lucide-react";
import styles from "./admin-navigation-groups.module.css";
type Item = { key: string; href: string; label: string; description: string; group: string };
export function AdminNavigationGroups({ items, active, search, counts = {} }: { items: Item[]; active?: string; search: string; counts?: Record<string, number> }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentGroup = items.find(i => i.key === active)?.group || items[0]?.group;
  const [open, setOpen] = useState<string | undefined>(currentGroup);
  useEffect(() => setOpen(currentGroup), [currentGroup]);
  const link = (n: Item) => <Link key={n.key} href={n.href} prefetch={false}
    onMouseEnter={() => { if (!n.href.startsWith("/admin?")) router.prefetch(n.href); }}
    onFocus={() => { if (!n.href.startsWith("/admin?")) router.prefetch(n.href); }}
    onNavigate={event => {
      if (pathname === "/admin" && n.href.startsWith("/admin?")) {
        event.preventDefault();
        window.history.pushState(null, "", n.href);
      }
    }}
    aria-current={active === n.key || ["distribution-queue", "delivery-failed"].includes(active || "") && n.key === "releases" ? "page" : undefined} title={n.description}><LayoutGrid size={16}/><span>{n.label}</span>{counts[n.key] > 0 ? <small className={styles.count} aria-label={`${counts[n.key]} items need attention`}>{counts[n.key] > 99 ? "99+" : counts[n.key]}</small> : null}</Link>;
  if (search.trim()) { const found = items.filter(n => `${n.label} ${n.description} ${n.group}`.toLowerCase().includes(search.toLowerCase().trim())); return <section className={styles.root}><h2>Module results</h2>{found.map(link)}{!found.length && <p role="status">No authorised modules match.</p>}</section>; }
  return <div className={styles.root}>{[...new Set(items.map(i => i.group))].map(group => <section key={group}><button className={styles.toggle} aria-expanded={open === group} onClick={() => setOpen(open === group ? undefined : group)}><span>{group}</span><ChevronDown size={14} style={{ transform: open === group ? "rotate(180deg)" : undefined }}/></button>{open === group && <div>{items.filter(i => i.group === group).map(link)}</div>}</section>)}</div>;
}
