"use client";
import type { LucideIcon } from "lucide-react";
import { InternalSectionMenu } from "../internal-section-menu";

type Section = { label: string; items: { id: string; title: string; icon: LucideIcon }[] };
export function TeamSectionNavigation({ sections, active, unread, onSelect }: { sections: Section[]; active: string; unread: number; onSelect: (key: string) => void }) {
  return <InternalSectionMenu active={active} sections={sections.filter(section => section.items.length).map(section => {
    const Icon = section.items[0].icon;
    return { label: section.label, selected: section.items.some(item => item.id === active), icon: <Icon size={16}/>,
      attribute: { "data-team-section": section.label }, badge: section.items.some(item => item.id === "inbox") ? unread : 0,
      content: section.items.map(item => <button type="button" key={item.id} aria-current={item.id === active ? "page" : undefined} onClick={() => onSelect(item.id)}><item.icon size={16}/><span>{item.title}</span>{item.id === "inbox" && unread > 0 ? <b>{unread}</b> : null}</button>) };
  })}/>;
}
