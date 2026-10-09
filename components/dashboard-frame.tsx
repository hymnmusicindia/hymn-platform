"use client";

import { Bell, ChevronDown, ChevronUp, Command, Menu, PanelLeftClose, PanelLeftOpen, Search, X, Plus, Disc3, TrendingUp, Wallet, Music2, Headphones, Settings, Users, LifeBuoy, Store, LayoutGrid, Upload, Crown } from "lucide-react";
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
  const [newOpen, setNewOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!newOpen) return;
    function dismiss(event: MouseEvent) { if (!newMenuRef.current?.contains(event.target as Node)) setNewOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setNewOpen(false); }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
  }, [newOpen]);
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
    <div data-collapsed={collapsed} className="hymn-portal-frame dashboard-os-shell lg:grid-cols-[var(--dashboard-sidebar-width,236px),minmax(0,1fr)]" style={{ "--dashboard-sidebar-width": collapsed ? "76px" : "236px" } as React.CSSProperties}>
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

        <div className="portal-create" ref={newMenuRef}>
          <button type="button" className="portal-new-button" aria-expanded={newOpen} aria-controls="portal-create-menu" onClick={() => setNewOpen(value => !value)}><Plus size={18} /><span>New</span></button>
          {newOpen ? <div id="portal-create-menu" className="portal-create-menu"><div className="portal-create-heading">Create something new<button type="button" aria-label="Close create menu" onClick={() => setNewOpen(false)}><X size={18} /></button></div><div className="portal-create-grid">{[
            { href: "/distribution/start", icon: Disc3, title: "Music release", copy: "Get your music ready for worldwide distribution." },
            { href: "/beat-store", icon: Store, title: "Find a beat", copy: "Explore sounds for your next release." },
            { href: "/studio", icon: Headphones, title: "Mixing / Mastering", copy: "Give your music a professional finish." },
            { href: "/managed-services", icon: TrendingUp, title: "Artist services", copy: "Explore support for your next project." }
          ].map(action => <Link key={action.href} href={action.href} onClick={() => { setNewOpen(false); setMobileOpen(false); }}><action.icon /><span><strong>{action.title}</strong><small>{action.copy}</small></span></Link>)}</div></div> : null}
        </div>

        <div ref={navScrollRef} onScroll={updateNavScroll} className="dashboard-nav-scroll mt-4 min-h-0 flex-1 content-start gap-3 overflow-x-hidden overflow-y-auto pr-1 grid">
          {visibleGroups.map((group) => {
            const groupActive = group.items.some((item) => item.key === activeKey);
            const closed = closedGroups.has(group.label) && !groupActive;
            return (
              <div key={group.label} className="dashboard-os-nav-group">
                <button
                  type="button"
                  className={clsx("dashboard-os-group-toggle", collapsed ? "lg:justify-center" : "")}
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={!closed}
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
                    const Icon = /release|catalog/.test(item.key) ? Disc3 : /analytics|sales/.test(item.key) ? TrendingUp : /earning|payout/.test(item.key) ? Wallet : /upload/.test(item.key) ? Upload : /studio|mix|master/.test(item.key) ? Headphones : /store|purchase/.test(item.key) ? Store : /setting|profile|account/.test(item.key) ? Settings : /collaborator|referral/.test(item.key) ? Users : /support|help/.test(item.key) ? LifeBuoy : item.key === "overview" ? LayoutGrid : Music2;
                    const content = <><Icon className="portal-nav-icon" /><span className={clsx("min-w-0", collapsed ? "lg:hidden" : "")}><span className="block truncate font-semibold">{item.label}</span></span></>;
                    return item.href ? <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)} className={clsx("dashboard-os-nav-item pressable hover-lift", active ? "is-active" : "is-idle")} title={collapsed ? item.label : undefined}>{content}</Link> : (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelect(item.key)}
                        className={clsx("dashboard-os-nav-item pressable hover-lift", active ? "is-active" : "is-idle")}
                        aria-current={active ? "page" : undefined}
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

      <div className="portal-workspace grid gap-6">
        <div className="dashboard-os-topbar">
          <span className="portal-section-label">{activeGroup?.label ?? "Workspace"}</span>
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
            <Link href="/distribution" className="portal-upgrade"><Crown size={16} /> Plans</Link>
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
        

        <div className="portal-page-content">{children}</div>
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
