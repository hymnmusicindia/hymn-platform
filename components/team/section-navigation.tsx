"use client";
import type { LucideIcon } from "lucide-react";

type Section = { label: string; items: { id: string; title: string; icon: LucideIcon }[] };
export function TeamSectionNavigation({ sections, active, unread, onSelect }: { sections: Section[]; active: string; unread: number; onSelect: (key: string) => void }) {
  return sections.map(section => {
    const current = section.items.find(item => item.id === active);
    const destination = current || section.items.find(item => item.id === "work") || section.items[0];
    return <button key={section.label} title={section.label} data-team-section={section.label} aria-current={current ? "page" : undefined} onClick={() => onSelect(destination.id)}>
      <destination.icon size={17}/><span>{section.label}</span>{section.items.some(item => item.id === "inbox") && unread > 0 ? <b>{unread}</b> : null}
    </button>;
  });
}
