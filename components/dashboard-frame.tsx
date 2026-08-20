"use client";

import { Bell, ChevronDown, ChevronUp, Command, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DashboardNavItem<T extends string> = {
  key: T | string;
  label: string;
  description?: string;
  group?: string;
  href?: string;
};

type DashboardNavGroup<T extends string> = {
  label: string;
  description?: string;
  items: DashboardNavItem<T>[];
};

export function DashboardFrame<T extends string>({
  eyebrow,
  title,
  subtitle,
  overviewSubtitle,
  navItems,
  navGroups,
  activeKey,
  onSelect,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search workspace...",
  quickActions,
  workspaceAction,
  onNotificationsClick,
  notificationCount = 0,
  compactOverview = false,
  children
}: {
  eyebrow?: string;
  title: string;
  subtitle: React.ReactNode;
  overviewSubtitle?: React.ReactNode;
  navItems: DashboardNavItem<T>[];
  navGroups?: DashboardNavGroup<T>[];
  activeKey: T;
  onSelect: (key: T) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  quickActions?: React.ReactNode;
  workspaceAction?: React.ReactNode;
  onNotificationsClick?: () => void;
  notificationCount?: number;
  compactOverview?: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set());
  const [localSearch, setLocalSearch] = useState("");
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [navScroll, setNavScroll] = useState({ canUp: false, canDown: false });

  const updateNavScroll = useCallback(() => {
    const element = navScrollRef.current;
    if (!element) return;
    setNavScroll({ canUp: element.scrollTop > 2, canDown: element.scrollTop + element.clientHeight < element.scrollHeight - 2 });
  }, []);

  function scrollNavigation(direction: -1 | 1) {
    const navigation = navScrollRef.current;
    if (!navigation) return;
    const step = Math.min(360, Math.max(220, navigation.clientHeight * 0.78));
    navigation.scrollBy({ top: direction * step, behavior: "smooth" });
  }

  const groups = useMemo<DashboardNavGroup<T>[]>(() => {
    if (navGroups?.length) return navGroups;
    const byGroup = new Map<string, DashboardNavItem<T>[]>();
    navItems.forEach((item) => {
      const label = item.group ?? "Workspace";
      byGroup.set(label, [...(byGroup.get(label) ?? []), item]);
    });
    return Array.from(byGroup.entries()).map(([label, items]) => ({ label, items }));
  }, [navGroups, navItems]);

  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const effectiveSearch = onSearchChange ? searchValue : localSearch;
  const visibleGroups = useMemo(() => {
    const query = effectiveSearch.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((group) => ({ ...group, items: group.items.filter((item) => `${item.label} ${item.description ?? ""} ${group.label}`.toLowerCase().includes(query)) }))
      .filter((group) => group.items.length > 0);
  }, [effectiveSearch, groups]);

  useEffect(() => {
    updateNavScroll();
    const element = navScrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(updateNavScroll);
    observer.observe(element);
    window.addEventListener("resize", updateNavScroll);
    return () => { observer.disconnect(); window.removeEventListener("resize", updateNavScroll); };
  }, [updateNavScroll, visibleGroups, closedGroups, mobileOpen, collapsed]);
  const activeItem = useMemo(() => flatItems.find((item) => item.key === activeKey), [activeKey, flatItems]);
  const activeGroup = useMemo(() => groups.find((group) => group.items.some((item) => item.key === activeKey)), [activeKey, groups]);

  function handleSelect(key: string) {
    onSelect(key as T);
    setMobileOpen(false);
  }

  function toggleGroup(label: string) {
    setClosedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const isOverview = activeKey === "overview";

  return (
    <div className="dashboard-os-shell lg:grid-cols-[var(--dashboard-sidebar-width,312px),minmax(0,1fr)]" style={{ "--dashboard-sidebar-width": collapsed ? "96px" : "312px" } as React.CSSProperties}>
      <div className="dashboard-os-mobile-head lg:hidden">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{title}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{activeItem?.label}</p>
        </div>
        <button type="button" className="btn-outline pressable" aria-expanded={mobileOpen} aria-controls="workspace-navigation" onClick={() => setMobileOpen(true)}>
          <Menu className="h-4 w-4" />
          Menu
        </button>
      </div>

      <div
        className={clsx(
          "dashboard-backdrop fixed inset-0 z-40 transition-opacity duration-300 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden={!mobileOpen}
      />

      <aside
        id="workspace-navigation"
        className={clsx(
          "dashboard-os-sidebar fixed inset-y-0 left-0 z-50 flex w-[min(88vw,340px)] flex-col p-4 shadow-2xl transition-transform duration-300 lg:sticky lg:top-24 lg:z-10 lg:h-[calc(100vh-7rem)] lg:w-full lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:max-w-[96px]" : "lg:max-w-[312px]"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b pb-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
           <div className={clsx("min-w-0", collapsed ? "lg:hidden" : "") }>
            <div className="mb-5 flex items-center gap-3">
              <Image src="/assets/hymnlogowhite.png" alt="HYMN" width={112} height={32} className="h-8 w-auto object-contain" />
               {eyebrow ? <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ background: "var(--bg-soft)", color: "var(--accent)" }}>{eyebrow}</span> : null}
            </div>
            <h2 className="text-2xl font-semibold leading-tight" style={{ color: "var(--text)" }}>{title}</h2>
            <div className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Close workspace navigation" className="pressable inline-flex h-11 w-11 items-center justify-center rounded-xl border lg:hidden" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }} onClick={() => setMobileOpen(false)}>
              <X className="h-4 w-4" />
            </button>
            <button type="button" aria-label={collapsed ? "Expand workspace navigation" : "Collapse workspace navigation"} className="dashboard-sidebar-toggle pressable hidden h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent lg:inline-flex" onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div ref={navScrollRef} onScroll={updateNavScroll} className={clsx("dashboard-nav-scroll mt-4 min-h-0 flex-1 content-start gap-3 overflow-x-hidden overflow-y-auto pr-1", collapsed ? "lg:hidden" : "grid")}>
          {visibleGroups.map((group) => {
            const groupActive = group.items.some((item) => item.key === activeKey);
            const closed = closedGroups.has(group.label) && !groupActive;
            return (
              <div key={group.label} className="dashboard-os-nav-group">
                <button
                  type="button"
                  className={clsx("dashboard-os-group-toggle", collapsed ? "lg:justify-center" : "")}
                  onClick={() => toggleGroup(group.label)}
                  title={collapsed ? group.label : undefined}
                >
                  <span className={clsx(collapsed ? "lg:hidden" : "")}>
                    <span>{group.label}</span>
                    {group.description ? <small>{group.description}</small> : null}
                  </span>
                  <ChevronDown className={clsx("h-3.5 w-3.5 transition", closed ? "-rotate-90" : "rotate-0", collapsed ? "lg:hidden" : "")} />
                </button>
                <div className={clsx("grid gap-1.5", closed ? "hidden" : "")}>
                  {group.items.map((item) => {
                    const active = item.key === activeKey;
                    const content = <><span
                          className={clsx("mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full transition", collapsed ? "lg:hidden" : "")}
                          style={{
                            background: active ? "var(--accent)" : "var(--text-soft)",
                            boxShadow: active ? "0 0 18px color-mix(in srgb, var(--accent) 72%, transparent)" : "none"
                          }}
                        /><span className={clsx("min-w-0", collapsed ? "lg:hidden" : "") }><span className="block truncate font-semibold">{item.label}</span>{item.description ? <span className="mt-1 block truncate text-xs opacity-75">{item.description}</span> : null}</span></>;
                    return item.href ? <Link key={item.key} href={item.href} onClick={() => setMobileOpen(false)} className={clsx("dashboard-os-nav-item pressable hover-lift", active ? "is-active" : "is-idle")} title={collapsed ? item.label : undefined}>{content}</Link> : (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelect(item.key)}
                        className={clsx("dashboard-os-nav-item pressable hover-lift", active ? "is-active" : "is-idle")}
                        title={collapsed ? item.label : undefined}
                      >
                        {content}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className={clsx("dashboard-nav-controls mt-2 shrink-0 justify-end gap-1", collapsed ? "hidden" : "flex")} aria-label="Navigation scroll controls">
          <button type="button" onClick={() => scrollNavigation(-1)} disabled={!navScroll.canUp} aria-label="Scroll navigation up"><ChevronUp className="h-4 w-4" /></button>
          <button type="button" onClick={() => scrollNavigation(1)} disabled={!navScroll.canDown} aria-label="Scroll navigation down"><ChevronDown className="h-4 w-4" /></button>
        </div>
      </aside>

      <div className="grid gap-6">
        <div className="dashboard-os-topbar">
          {!(compactOverview && isOverview) ? <div className="dashboard-os-search">
            <Search className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            <input
              aria-label="Search dashboard"
              value={effectiveSearch}
              onChange={(event) => onSearchChange ? onSearchChange(event.target.value) : setLocalSearch(event.target.value)}
              placeholder={searchPlaceholder}
            />
            <Command className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          </div> : <div />}
          <div className="flex items-center gap-2">
            {workspaceAction}
            {quickActions && isOverview ? <div className="hidden items-center gap-2 xl:flex">{quickActions}</div> : null}
            <button type="button" className="dashboard-os-icon-button" aria-label={notificationCount ? `Notifications, ${notificationCount} unread` : "Notifications"} onClick={onNotificationsClick} disabled={!onNotificationsClick}>
              <Bell className="h-4 w-4" />
              {notificationCount > 0 ? <span /> : null}
            </button>
          </div>
        </div>

        {!(compactOverview && isOverview) ? <section className="dashboard-os-hero">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--accent)" }}>{activeGroup?.label ?? eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-5xl">{isOverview ? title : activeItem?.label}</h1>
            <div className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>{isOverview ? (overviewSubtitle ?? subtitle) : activeItem?.description}</div>
            {quickActions && isOverview ? <div className="mt-5 flex flex-wrap gap-2 xl:hidden">{quickActions}</div> : null}
          </div>
        </section> : null}
        

        {children}
      </div>
    </div>
  );
}

// vercel trigger

// vercel trigger 2

// vercel trigger 4
// vercel trigger 7

// vercel trigger 11

// vercel trigger 12

// vercel trigger 14
