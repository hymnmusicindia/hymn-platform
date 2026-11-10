"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { sectionItems, adminModuleKey } from "@/lib/navigation-sections";
import styles from "./internal-navigation.module.css";
import { InternalSectionMenu } from "./internal-section-menu";
type Item = { key: string; href: string; label: string; description: string; group: string };
export function AdminNavigationGroups({ items, active, search, counts = {} }: { items: Item[]; active?: string; search: string; counts?: Record<string, number> }) {
  const pathname = usePathname();
  const current = items.find(item => item.key === adminModuleKey(active));
  const link = (item: Item, label = item.label, selected = current?.key === item.key, count = counts[item.key] || 0) => <Link key={item.key} href={item.href} prefetch={false}
    onNavigate={event => { if (pathname === "/admin" && item.href.startsWith("/admin?")) { event.preventDefault(); window.history.pushState(null, "", item.href); } }}
    aria-current={selected ? "page" : undefined} title={item.description} data-admin-module={item.key}><LayoutGrid size={16}/><span>{label}</span>{count > 0 ? <small className={styles.count} aria-label={count + " items need attention"}>{count > 99 ? "99+" : count}</small> : null}</Link>;
  if (search.trim()) {
    const found = items.filter(item => (item.label + " " + item.description + " " + item.group).toLowerCase().includes(search.toLowerCase().trim()));
    return <section className={styles.groups}><h2>Module results</h2><div className={styles.links}>{found.map(item => link(item))}</div>{!found.length && <p role="status">No authorised modules match.</p>}</section>;
  }
  return <InternalSectionMenu active={current?.key || ""} sections={sectionItems(items, item => item.group).map(section => ({
    label: section.label, selected: current?.group === section.label, icon: <LayoutGrid size={16}/>,
    attribute: { "data-admin-section": section.label }, badge: section.items.reduce((sum, item) => sum + (counts[item.key] || 0), 0),
    content: section.items.map(item => link(item))
  }))}/>;
}
