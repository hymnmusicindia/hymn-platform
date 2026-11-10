"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./internal-navigation.module.css";

export function InternalSectionMenu({ sections, active }: {
  sections: { label: string; icon: ReactNode; badge?: number; content: ReactNode; selected: boolean; attribute: Record<string, string> }[];
  active: string;
}) {
  const id = useId();
  const current = sections.find(section => section.selected)?.label ?? null;
  const [expanded, setExpanded] = useState<{ active: string; label: string | null }>({ active, label: current });
  if (expanded.active !== active) setExpanded({ active, label: current });
  const open = expanded.active === active ? expanded.label : current;
  const reveal = (label: string | null) => setExpanded({ active, label });
  return <div className={styles.groups}>{sections.map((section, index) => {
    const panelId = `${id}-${index}`;
    const visible = open === section.label;
    return <section key={section.label} className={styles.group}
      onPointerEnter={event => { if (event.pointerType === "mouse") reveal(section.label); }}>
      <button type="button" className={styles.heading} {...section.attribute}
        aria-expanded={visible} aria-controls={panelId} aria-current={section.selected ? "page" : undefined}
        title={section.label} onClick={() => reveal(visible ? null : section.label)}
        onKeyDown={event => {
          if (event.key === "Escape") { reveal(null); event.stopPropagation(); }
          if (event.key === "ArrowDown") { event.preventDefault(); reveal(section.label); requestAnimationFrame(() => document.getElementById(panelId)?.querySelector<HTMLElement>("a,button")?.focus()); }
        }}>
        {section.icon}<span>{section.label}</span>{!!section.badge && <b>{section.badge > 99 ? "99+" : section.badge}</b>}<ChevronDown size={14} className={styles.chevron}/>
      </button>
      <div id={panelId} hidden={!visible} className={styles.links} onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); reveal(null); document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(panelId)}"]`)?.focus(); }
      }}>{section.content}</div>
    </section>;
  })}</div>;
}
