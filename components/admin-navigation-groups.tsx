"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { sectionItems, adminModuleKey } from "@/lib/navigation-sections";
import styles from "./admin-navigation-groups.module.css";
type Item = { key: string; href: string; label: string; description: string; group: string };
export function AdminNavigationGroups({ items, active, search, counts = {} }: { items: Item[]; active?: string; search: string; counts?: Record<string, number> }) {
  const pathname = usePathname();
  const current = items.find(item => item.key === adminModuleKey(active));
  const link = (item: Item, label = item.label, selected = current?.key === item.key, count = counts[item.key] || 0) => <Link key={item.key} href={item.href} prefetch={false}
    onNavigate={event => { if (pathname === "/admin" && item.href.startsWith("/admin?")) { event.preventDefault(); window.history.pushState(null, "", item.href); } }}
    aria-current={selected ? "page" : undefined} title={item.description} data-admin-section={label}><LayoutGrid size={16}/><span>{label}</span>{count > 0 ? <small className={styles.count} aria-label={count + " items need attention"}>{count > 99 ? "99+" : count}</small> : null}</Link>;
  if (search.trim()) {
    const found = items.filter(item => (item.label + " " + item.description + " " + item.group).toLowerCase().includes(search.toLowerCase().trim()));
    return <section className={styles.root}><h2>Module results</h2>{found.map(item => link(item))}{!found.length && <p role="status">No authorised modules match.</p>}</section>;
  }
  const preferred = ["overview", "releases", "revenue", "users", "operations", "team"];
  return <div className={styles.root}>{sectionItems(items, item => item.group).map(section => {
    const selected = current?.group === section.label;
    const destination = (selected ? current : undefined) || section.items.find(item => preferred.includes(item.key)) || section.items[0];
    return link(destination, section.label, selected, section.items.reduce((sum, item) => sum + (counts[item.key] || 0), 0));
  })}</div>;
}
