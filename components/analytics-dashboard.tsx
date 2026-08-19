"use client";

import type { ReactNode } from "react";
import { BarChart3, Database, Globe, Headphones, Music, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/hymn-ui";

type AnalyticsRow = {
  platform?: string | null;
  country?: string | null;
  streams?: number | null;
  saves?: number | null;
  revenueCents?: number | null;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  dataSource?: string | null;
  isVerified?: boolean | null;
};

function MetricTile({ label, value, icon: Icon, detail }: { label: string; value: string; icon: LucideIcon; detail: string }) {
  return <article className="metric-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div><Icon className="h-5 w-5" aria-hidden="true" style={{ color: "var(--accent)" }} /></div><p className="mt-3 text-xs" style={{ color: "var(--text-soft)" }}>{detail}</p></article>;
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="surface-card"><h2 className="text-xl font-semibold">{title}</h2>{description ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{description}</p> : null}<div className="mt-5">{children}</div></section>;
}

function grouped(rows: AnalyticsRow[], key: "platform" | "country") {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = row[key]?.trim() || "Not supplied";
    totals.set(label, (totals.get(label) ?? 0) + Math.max(0, row.streams ?? 0));
  }
  return [...totals.entries()].sort((left, right) => right[1] - left[1]);
}

function formatDate(value?: string | Date | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function AnalyticsDashboard({ analytics = [] }: { userName?: string; analytics?: AnalyticsRow[] }) {
  const verified = analytics.filter((row) => row.isVerified === true);
  if (verified.length === 0) {
    return <EmptyState title="Verified analytics will appear here" description="HYMN has not received verified reporting for this catalogue yet. Estimates, proxy listener counts and invented demographics are not shown." action={{ label: "Open full analytics", href: "/analytics" }} />;
  }

  const totalStreams = verified.reduce((sum, row) => sum + Math.max(0, row.streams ?? 0), 0);
  const totalSaves = verified.reduce((sum, row) => sum + Math.max(0, row.saves ?? 0), 0);
  const totalRevenue = verified.reduce((sum, row) => sum + Math.max(0, row.revenueCents ?? 0), 0) / 100;
  const platforms = grouped(verified, "platform");
  const countries = grouped(verified, "country").slice(0, 5);
  const sources = [...new Set(verified.map((row) => row.dataSource?.trim()).filter(Boolean))] as string[];
  const starts = verified.map((row) => row.periodStart ? new Date(row.periodStart).getTime() : Number.NaN).filter(Number.isFinite);
  const ends = verified.map((row) => row.periodEnd ? new Date(row.periodEnd).getTime() : Number.NaN).filter(Number.isFinite);
  const coverage = starts.length && ends.length ? `${formatDate(new Date(Math.min(...starts)))} – ${formatDate(new Date(Math.max(...ends)))}` : "Reporting period not supplied";

  return <div className="grid gap-6">
    <div className="grid gap-4 sm:grid-cols-3">
      <MetricTile label="Verified streams" value={totalStreams.toLocaleString("en-IN")} icon={Headphones} detail={coverage} />
      <MetricTile label="Verified saves" value={totalSaves.toLocaleString("en-IN")} icon={Music} detail="Reported saves only" />
      <MetricTile label="Reported revenue" value={new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(totalRevenue)} icon={BarChart3} detail="From verified rows" />
    </div>

    <Panel title="Reporting provenance" description="Every value below comes from verified imported reporting rows.">
      <div className="flex items-start gap-3 text-sm" style={{ color: "var(--text-muted)" }}><Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>Sources: {sources.length ? sources.join(", ") : "Not supplied"}. Coverage: {coverage}. Distinct-listener and demographic data are unavailable, so they are omitted.</p></div>
    </Panel>

    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Platforms" description="Verified streams grouped by reported platform.">
        <div className="grid gap-3">{platforms.map(([label, value]) => <div className="summary-card" key={label}><span>{label}</span><strong>{value.toLocaleString("en-IN")}</strong></div>)}</div>
      </Panel>
      <Panel title="Top countries" description="Verified streams grouped by reported country.">
        <div className="grid gap-3">{countries.map(([label, value]) => <div className="summary-card" key={label}><span className="flex items-center gap-2"><Globe className="h-4 w-4" aria-hidden="true" />{label}</span><strong>{value.toLocaleString("en-IN")}</strong></div>)}</div>
      </Panel>
    </div>
  </div>;
}

// vercel trigger 11
