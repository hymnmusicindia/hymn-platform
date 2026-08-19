"use client";

import { Bell, ChevronDown, Command, Menu, PanelLeftClose, PanelLeftOpen, Search, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { useMemo, useState } from "react";

type DashboardNavItem<T extends string> = {
  key: T;
  label: string;
  description?: string;
  group?: string;
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
  navItems,
  navGroups,
  activeKey,
  onSelect,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search workspace...",
  quickActions,
  workspaceAction,
  children
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  navItems: DashboardNavItem<T>[];
  navGroups?: DashboardNavGroup<T>[];
  activeKey: T;
  onSelect: (key: T) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  quickActions?: React.ReactNode;
  workspaceAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set());

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
  const activeItem = useMemo(() => flatItems.find((item) => item.key === activeKey), [activeKey, flatItems]);
  const activeGroup = useMemo(() => groups.find((group) => group.items.some((item) => item.key === activeKey)), [activeKey, groups]);

  function handleSelect(key: T) {
    onSelect(key);
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

  const activeIndex = Math.max(flatItems.findIndex((item) => item.key === activeKey), 0);
  const progress = Math.max(16, ((activeIndex + 1) / Math.max(flatItems.length, 1)) * 100);
  const isOverview = activeKey === "overview";

  return (
    <div className="dashboard-os-shell lg:grid-cols-[var(--dashboard-sidebar-width,312px),minmax(0,1fr)]">
      <div className="dashboard-os-mobile-head lg:hidden">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{title}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{activeItem?.label}</p>
        </div>
        <button type="button" className="btn-outline pressable" onClick={() => setMobileOpen(true)}>
          <Menu className="h-4 w-4" />
          Menu
        </button>
      </div>

      <div
        className={clsx(
          "dashboard-backdrop fixed inset-0 z-40 transition-opacity duration-300 md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        className={clsx(
          "dashboard-os-sidebar fixed inset-y-0 left-0 z-50 flex w-[min(88vw,340px)] flex-col p-4 shadow-2xl transition-transform duration-300 md:sticky md:top-24 md:z-10 md:h-[calc(100vh-7rem)] md:w-full lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          collapsed ? "md:max-w-[96px]" : "md:max-w-[312px]"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b pb-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className={clsx("min-w-0", collapsed ? "md:hidden" : "") }>
            <div className="mb-5 flex items-center gap-3">
              <img src="/assets/hymnlogowhite.png" alt="HYMN" className="h-8 w-auto object-contain" />
              <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ background: "var(--bg-soft)", color: "var(--accent)" }}>{eyebrow}</span>
            </div>
            <h2 className="text-2xl font-semibold leading-tight" style={{ color: "var(--text)" }}>{title}</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="pressable inline-flex h-11 w-11 items-center justify-center rounded-xl border md:hidden" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }} onClick={() => setMobileOpen(false)}>
              <X className="h-4 w-4" />
            </button>
            <button type="button" className="pressable hidden h-11 w-11 items-center justify-center rounded-xl border md:inline-flex" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }} onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 overflow-y-auto pr-1">
          {groups.map((group) => {
            const groupActive = group.items.some((item) => item.key === activeKey);
            const closed = closedGroups.has(group.label) && !groupActive;
            return (
              <div key={group.label} className="dashboard-os-nav-group">
                <button
                  type="button"
                  className={clsx("dashboard-os-group-toggle", collapsed ? "md:justify-center" : "")}
                  onClick={() => toggleGroup(group.label)}
                  title={collapsed ? group.label : undefined}
                >
                  <span className={clsx(collapsed ? "md:hidden" : "")}>
                    <span>{group.label}</span>
                    {group.description ? <small>{group.description}</small> : null}
                  </span>
                  <ChevronDown className={clsx("h-3.5 w-3.5 transition", closed ? "-rotate-90" : "rotate-0", collapsed ? "md:hidden" : "")} />
                  <span className={clsx("hidden h-2.5 w-2.5 rounded-full md:block", collapsed ? "" : "md:hidden")} style={{ background: groupActive ? "var(--accent)" : "var(--text-soft)" }} />
                </button>
                <div className={clsx("grid gap-1.5", closed ? "hidden" : "")}>
                  {group.items.map((item) => {
                    const active = item.key === activeKey;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelect(item.key)}
                        className={clsx("dashboard-os-nav-item pressable hover-lift", active ? "is-active" : "is-idle")}
                        title={collapsed ? item.label : undefined}
                      >
                        <span
                          className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full transition"
                          style={{
                            background: active ? "var(--accent)" : "var(--text-soft)",
                            boxShadow: active ? "0 0 18px color-mix(in srgb, var(--accent) 72%, transparent)" : "none"
                          }}
                        />
                        <span className={clsx("min-w-0", collapsed ? "md:hidden" : "") }>
                          <span className="block truncate font-semibold">{item.label}</span>
                          {item.description ? <span className="mt-1 block truncate text-xs opacity-75">{item.description}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <div className="grid gap-6">
        <div className="dashboard-os-topbar">
          <div className="dashboard-os-search">
            <Search className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            <input
              aria-label="Search dashboard"
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
            />
            <Command className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          </div>
          <div className="flex items-center gap-2">
            {workspaceAction}
            {quickActions && isOverview ? <div className="hidden items-center gap-2 xl:flex">{quickActions}</div> : null}
            <button type="button" className="dashboard-os-icon-button" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              <span />
            </button>
            <div className="dashboard-os-role-chip">
              <Sparkles className="h-3.5 w-3.5" />
              {activeItem?.label ?? "Overview"}
            </div>
          </div>
        </div>

        <section className="dashboard-os-hero">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--accent)" }}>{activeGroup?.label ?? eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-5xl">{isOverview ? title : activeItem?.label}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>{isOverview ? subtitle : activeItem?.description}</p>
            {quickActions && isOverview ? <div className="mt-5 flex flex-wrap gap-2 xl:hidden">{quickActions}</div> : null}
          </div>
          {isOverview ? <div className="dashboard-os-stage">
            <p className="text-xs uppercase tracking-[0.24em]" style={{ color: "var(--text-muted)" }}>Current module</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{activeItem?.label}</p>
            {activeItem?.description ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{activeItem.description}</p> : null}
            <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <span className="block h-full rounded-full" style={{ width: `${progress}%`, background: "var(--accent)" }} />
            </div>
          </div> : null}
        </section>
        

        {children}
      </div>
    </div>
  );
}

// vercel trigger

// vercel trigger 2

// vercel trigger 4
