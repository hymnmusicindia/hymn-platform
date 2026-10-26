"use client";

import Link from "next/link";
import styles from "./module-tabs.module.css";

export type ModuleTab = { key: string; label: string; href?: string; description?: string; count?: number };
export function ModuleTabs({ items, active, label, onSelect, onFollow }: {
  items: readonly ModuleTab[];
  active?: string;
  label: string;
  onSelect?: (key: string) => void;
  onFollow?: (item: ModuleTab) => boolean;
}) {
  if (items.length < 2) return null;
  const content = (item: ModuleTab) => <>{item.label}{(item.count || 0) > 0 ? <small aria-label={`${item.count} items need attention`}>{item.count! > 99 ? "99+" : item.count}</small> : null}</>;
  return <nav className={styles.tabs} aria-label={`${label} modules`} data-module-tabs>
    {items.map(item => item.href
      ? <Link key={item.key} href={item.href} prefetch={false} title={item.description} aria-current={active === item.key ? "page" : undefined} data-module-key={item.key} data-guide-route={item.href} onNavigate={event => { if (onFollow?.(item)) event.preventDefault(); }}>{content(item)}</Link>
      : <button type="button" key={item.key} title={item.description} aria-current={active === item.key ? "page" : undefined} data-module-key={item.key} onClick={() => onSelect?.(item.key)}>{content(item)}</button>)}
  </nav>;
}
