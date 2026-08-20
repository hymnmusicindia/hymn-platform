"use client";

import { Bell, Command, Menu, PanelLeftClose, PanelLeftOpen, Search, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { useMemo, useState } from "react";

type DashboardNavItem<T extends string> = {
  key: T;
  label: string;
  description?: string;
};

export function DashboardFrame<T extends string>({
  eyebrow,
  title,
  subtitle,
  navItems,
  activeKey,
  onSelect,
  children
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  navItems: DashboardNavItem<T>[];
  activeKey: T;
  onSelect: (key: T) => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const activeItem = useMemo(() => navItems.find((item) => item.key === activeKey), [activeKey, navItems]);

  function handleSelect(key: T) {
    onSelect(key);
    setMobileOpen(false);
  }

  const activeIndex = Math.max(navItems.findIndex((item) => item.key === activeKey), 0);

  return (
    <div className="dashboard-os-shell lg:grid-cols-[var(--dashboard-sidebar-width,292px),minmax(0,1fr)]">
      <div className="dashboard-os-mobile-head lg:hidden">
        <div>
          <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{title}</h1>
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
          collapsed ? "md:max-w-[96px]" : "md:max-w-[292px]"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b pb-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className={clsx("min-w-0", collapsed ? "md:hidden" : "") }>
            <div className="mb-5 flex items-center gap-3">
              <img src="/assets/hymnlogowhite.png" alt="HYMN" className="h-8 w-auto object-contain" />
              <span className="rounded-full border border-white/[0.06] bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#59dfe0]">OS</span>
            </div>
            <span className="eyebrow mb-3">{eyebrow}</span>
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

        <div className="mt-4 grid gap-2 overflow-y-auto pr-1">
          {navItems.map((item) => {
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
      </aside>

      <div className="grid gap-6">
        <div className="dashboard-os-topbar">
          <div className="dashboard-os-search">
            <Search className="h-4 w-4 text-[#8f97aa]" />
            <input aria-label="Search dashboard" placeholder="Search releases, artists, payouts, catalog..." />
            <Command className="h-4 w-4 text-[#8f97aa]" />
          </div>
          <div className="flex items-center gap-2">
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
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#59dfe0]">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#f4f7fb] sm:text-5xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#8f97aa]">{subtitle}</p>
          </div>
          <div className="dashboard-os-stage">
            <p className="text-xs uppercase tracking-[0.24em] text-[#8f97aa]">Current workspace</p>
            <p className="mt-2 text-2xl font-semibold text-[#f4f7fb]">{activeItem?.label}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="block h-full rounded-full bg-[#59dfe0]" style={{ width: `${Math.max(16, ((activeIndex + 1) / navItems.length) * 100)}%` }} />
            </div>
          </div>
        </section>

        {children}
      </div>
    </div>
  );
}
