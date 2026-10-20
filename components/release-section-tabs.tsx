"use client";

import { useEffect, useId, useRef } from "react";
import { FileText, Users, LayoutDashboard, Music2, CircleAlert, History, Radio, Megaphone, ChartNoAxesCombined, MessageSquare } from "lucide-react";
import "./release-section-tabs.css";

const icons = { information: FileText, splits: Users, overview: LayoutDashboard, tracks: Music2, corrections: CircleAlert, activity: History, distribution: Radio, promolink: Megaphone, earnings: ChartNoAxesCombined, requests: MessageSquare };
export type ReleaseSectionKey = keyof typeof icons;

export function ReleaseSectionTabs({ items, active, onChange, panelId }: {
  items: { key: ReleaseSectionKey; label: string; count?: number; attention?: boolean }[];
  active: ReleaseSectionKey; onChange: (key: ReleaseSectionKey) => void; panelId: string;
}) {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const button = buttons.current[items.findIndex(item => item.key === active)];
    const list = button?.parentElement;
    if (button && list) list.scrollLeft = button.offsetLeft - list.offsetLeft - (list.clientWidth - button.offsetWidth) / 2;
  }, [active, items]);
  return <div className="release-section-navigation">
    <div className="release-section-tabs" role="tablist" aria-label="Release sections">
      {items.map((item, index) => {
        const Icon = icons[item.key];
        return <button key={item.key} id={`${id}-${item.key}`} ref={node => { buttons.current[index] = node; }}
          type="button" role="tab" aria-selected={active === item.key} aria-controls={panelId}
          tabIndex={active === item.key ? 0 : -1} data-attention={item.attention || undefined}
          onClick={() => onChange(item.key)} onKeyDown={event => {
            let next = index;
            if (event.key === "ArrowRight") next = (index + 1) % items.length;
            else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = items.length - 1;
            else return;
            event.preventDefault(); onChange(items[next].key);
            buttons.current[next]?.focus({ preventScroll: true });
          }}>
          <Icon size={16} aria-hidden="true" /><span>{item.label}</span>
          {item.count !== undefined && item.count > 0 ? <span className="release-section-count" aria-label={`${item.count} ${item.key === "corrections" ? item.attention ? "open corrections" : "review notes" : item.label.toLowerCase()}`}>{item.count}</span> : null}
        </button>;
      })}
    </div>
    <p className="release-section-caption">{items.find(item => item.key === active)?.label}<span aria-hidden="true"> / </span><span>Release workspace</span></p>
  </div>;
}
