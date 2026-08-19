"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Globe2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { analyticsWindows } from "@/lib/analytics";
import { AnalyticsCountryStat, AnalyticsPoint, AnalyticsPlatformStat, AnalyticsReleaseRow, AnalyticsSummary, AnalyticsWindow } from "@/lib/types";

const WINDOW_LABELS: Record<AnalyticsWindow, string> = { "7d": "7 days", "30d": "30 days", all: "All time" };
const PLATFORM_COLORS: Record<string, string> = { Spotify: "#22c55e", "Apple Music": "#e879f9", YouTube: "#60a5fa" };

function formatNumber(value: number) { return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value); }
function formatCurrency(value: number) { return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(value))}`; }
function formatPercent(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`; }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function formatDateTime(value: string) { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function getY(point: AnalyticsPoint, maxValue: number, height: number, padding: number) { const inner = height - padding * 2; return padding + inner - (point.value / Math.max(maxValue, 1)) * inner; }
function buildPath(points: AnalyticsPoint[], width: number, height: number, padding: number) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${width / 2} ${height - padding}`;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  return points.map((point, index) => {
    const x = padding + (index / (points.length - 1)) * innerWidth;
    const y = padding + innerHeight - (point.value / maxValue) * innerHeight;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function AnimatedValue({ value, kind }: { value: number; kind: "number" | "currency" | "percent" }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = previous.current;
    const to = value;
    const start = performance.now();
    const duration = 550;
    if (raf.current) cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) raf.current = requestAnimationFrame(tick); else previous.current = to;
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value]);

  if (kind === "currency") return <>{formatCurrency(display)}</>;
  if (kind === "percent") return <>{formatPercent(display)}</>;
  return <>{formatNumber(display)}</>;
}

function MetricCard({ label, value, kind, detail }: { label: string; value: number; kind: "number" | "currency" | "percent"; detail: string }) {
  return <div className="metric-card"><p className="text-xs uppercase tracking-[0.24em]" style={{ color: "var(--text-soft)" }}>{label}</p><div className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--text)" }}><AnimatedValue value={value} kind={kind} /></div><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{detail}</p></div>;
}

function Chart({ points, kind, accent = "var(--accent)", height = 260 }: { points: AnalyticsPoint[]; kind: "number" | "currency"; accent?: string; height?: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const width = 920;
  const padding = 24;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const path = buildPath(points, width, height, padding);
  const area = points.length > 1 ? `${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z` : "";
  const activePoint = hoverIndex === null ? null : points[hoverIndex] ?? null;
  const activeX = hoverIndex === null || points.length < 2 ? null : padding + (hoverIndex / (points.length - 1)) * (width - padding * 2);
  const activeY = activePoint ? getY(activePoint, maxValue, height, padding) : null;

  function update(clientX: number) {
    if (!ref.current || points.length === 0) return;
    const rect = ref.current.getBoundingClientRect();
    const ratio = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
    setHoverIndex(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  }

  return <div ref={ref} className="relative" onMouseMove={(event) => update(event.clientX)} onMouseLeave={() => setHoverIndex(null)} onTouchMove={(event) => update(event.touches[0]?.clientX ?? 0)}>{points.length === 0 ? <div className="flex h-[260px] items-center justify-center rounded-[1.5rem] border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-sm" style={{ color: "var(--text-muted)" }}>No time-series data yet.</p></div> : <><svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full overflow-visible"><defs><linearGradient id="analyticsFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity="0.26" /><stop offset="100%" stopColor={accent} stopOpacity="0.02" /></linearGradient></defs>{[0.2, 0.4, 0.6, 0.8].map((ratio) => <line key={ratio} x1={padding} x2={width - padding} y1={padding + (height - padding * 2) * ratio} y2={padding + (height - padding * 2) * ratio} stroke="var(--border)" strokeDasharray="6 8" strokeOpacity="0.45" />)}{area ? <path d={area} fill="url(#analyticsFill)" /> : null}{path ? <path d={path} fill="none" stroke={accent} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /> : null}{points.map((point, index) => { const x = padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2); const y = getY(point, maxValue, height, padding); return <circle key={`${point.date}-${index}`} cx={x} cy={y} r={hoverIndex === index ? 5.5 : 3.2} fill={accent} opacity={hoverIndex === null || hoverIndex === index ? 1 : 0.5} />; })}{activeX !== null && activeY !== null ? <g><line x1={activeX} x2={activeX} y1={padding} y2={height - padding} stroke="var(--border-strong)" strokeDasharray="4 6" /><circle cx={activeX} cy={activeY} r={7} fill={accent} /><circle cx={activeX} cy={activeY} r={12} fill={accent} opacity="0.18" /></g> : null}</svg>{activePoint && activeX !== null && activeY !== null ? <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-2xl border px-3 py-2 text-xs shadow-lg" style={{ left: `${(activeX / width) * 100}%`, top: `${(activeY / height) * 100}%`, borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text)" }}><p className="font-semibold">{formatDate(activePoint.date)}</p><p className="mt-1" style={{ color: "var(--text-muted)" }}>{kind === "currency" ? formatCurrency(activePoint.value) : formatNumber(activePoint.value)}</p></div> : null}</>}</div>;
}

function CountryMap({ countries, selectedCountry, onSelect }: { countries: AnalyticsCountryStat[]; selectedCountry: string; onSelect: (country: string) => void }) {
  const active = countries.find((country) => country.country === selectedCountry) ?? countries[0] ?? null;
  return <div className="surface-card p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Streams by country</h2></div><div className="rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>Top 5 countries</div></div><div className="relative mt-5 overflow-hidden rounded-[1.75rem] border" style={{ borderColor: "var(--border)", background: "linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, transparent), var(--bg-soft))" }}><div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 24%), radial-gradient(circle at 72% 28%, color-mix(in srgb, var(--money) 12%, transparent), transparent 22%)` }} /><div className="absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(color-mix(in srgb, var(--border) 60%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--border) 60%, transparent) 1px, transparent 1px)", backgroundSize: "44px 44px" }} /><div className="relative min-h-[340px] p-5 sm:p-6"><div className="absolute inset-x-8 bottom-6 top-8 rounded-[2rem] border border-dashed" style={{ borderColor: "color-mix(in srgb, var(--border) 65%, transparent)" }} />{countries.map((country) => { const activeNode = country.country === selectedCountry; return <button key={country.country} type="button" onClick={() => onSelect(country.country)} className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition" style={{ left: `${country.x}%`, top: `${country.y}%` }} title={`${country.country} — ${formatNumber(country.streams)} streams`}><span className="absolute inset-0 rounded-full blur-xl transition-opacity" style={{ background: activeNode ? "var(--accent-soft)" : "color-mix(in srgb, var(--money) 26%, transparent)", opacity: activeNode ? 0.55 : 0.2 }} /><span className="relative flex h-4 w-4 items-center justify-center rounded-full border-2" style={{ borderColor: activeNode ? "var(--accent)" : "var(--money)", background: activeNode ? "var(--accent)" : "var(--money)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: activeNode ? "var(--accent-foreground)" : "var(--money-foreground)" }} /></span></button>; })}</div></div><div className="mt-5 grid gap-4 lg:grid-cols-[1fr,0.9fr]"><div className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Selected country</p><div className="mt-3 flex items-end justify-between gap-4"><div><h3 className="text-xl font-semibold" style={{ color: "var(--text)" }}>{active?.country ?? "India"}</h3><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{active ? `${formatNumber(active.streams)} streams` : "No country data available"}</p></div><p className="text-2xl font-semibold" style={{ color: "var(--accent)" }}>{active ? active.percent.toFixed(0) : 0}%</p></div></div><div className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Top audience</p><div className="mt-3 space-y-3">{countries.slice(0, 5).map((country) => <button key={country.country} type="button" onClick={() => onSelect(country.country)} className="flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition hover:-translate-y-0.5" style={{ borderColor: country.country === selectedCountry ? "var(--border-strong)" : "var(--border)", background: country.country === selectedCountry ? "var(--accent-soft)" : "var(--card)" }}><span className="inline-flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: "var(--border)" }}><Globe2 className="h-4 w-4" /></span><span className="flex-1"><span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{country.country}</span><span className="block text-xs" style={{ color: "var(--text-muted)" }}>{formatNumber(country.streams)} streams</span></span><span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{country.percent.toFixed(0)}%</span></button>)}</div></div></div></div>;
}

function PlatformBreakdown({ platforms }: { platforms: AnalyticsPlatformStat[] }) {
  return <div className="surface-card p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Where you are winning</h2></div><TrendingUp className="h-5 w-5" style={{ color: "var(--text-soft)" }} /></div><div className="mt-5 space-y-4">{platforms.map((platform) => <div key={platform.platform} className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{platform.platform}</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{formatNumber(platform.streams)} streams</p></div><p className="text-lg font-semibold" style={{ color: PLATFORM_COLORS[platform.platform] ?? "var(--accent)" }}>{platform.percent.toFixed(0)}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--card-strong)" }}><div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(platform.percent, 4)}%`, background: PLATFORM_COLORS[platform.platform] ?? "var(--accent)" }} /></div></div>)}</div></div>;
}

function RevenueSection({ summary, windowKey, points }: { summary: AnalyticsSummary; windowKey: AnalyticsWindow; points: AnalyticsPoint[] }) {
  return <div className="surface-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Revenue over time</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Streaming payout signal based on your release history.</p></div><div className="rounded-[1.5rem] border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Total revenue</p><p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{formatCurrency(summary.metrics[1]?.value ?? 0)}</p></div></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr,0.65fr]"><div className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{WINDOW_LABELS[windowKey]} revenue</p><p className="text-sm" style={{ color: "var(--text-muted)" }}>{points.length} points</p></div><Chart points={points} kind="currency" accent="var(--money)" height={250} /></div><div className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Revenue by platform</p><div className="mt-4 space-y-4">{summary.revenueBreakdown.map((platform) => <div key={platform.platform}><div className="flex items-center justify-between gap-3 text-sm"><span style={{ color: "var(--text)" }}>{platform.platform}</span><span style={{ color: "var(--text-muted)" }}>{formatCurrency(platform.revenue)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--card-strong)" }}><div className="h-full rounded-full" style={{ width: `${Math.max(platform.percent, 4)}%`, background: PLATFORM_COLORS[platform.platform] ?? "var(--money)" }} /></div></div>)}</div></div></div></div>;
}

function InsightCard({ insight }: { insight: AnalyticsSummary["insights"][number] }) {
  const tone = insight.tone === "success" ? { border: "color-mix(in srgb, var(--success) 35%, var(--border))", background: "color-mix(in srgb, var(--success) 12%, var(--card))", icon: ArrowUpRight } : insight.tone === "warning" ? { border: "color-mix(in srgb, var(--money) 35%, var(--border))", background: "color-mix(in srgb, var(--money) 10%, var(--card))", icon: RefreshCw } : { border: "color-mix(in srgb, var(--border-strong) 55%, var(--border))", background: "var(--bg-soft)", icon: Sparkles };
  const Icon = tone.icon;
  return <div className="rounded-[1.5rem] border p-4" style={{ borderColor: tone.border, background: tone.background }}><div className="flex items-start gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: "var(--border)" }}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{insight.title}</p><p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{insight.body}</p></div></div></div>;
}

function ReleaseTable({ releases, selectedReleaseId, onSelect }: { releases: AnalyticsReleaseRow[]; selectedReleaseId: number | null; onSelect: (id: number) => void }) {
  const selected = releases.find((release) => release.id === selectedReleaseId) ?? releases[0] ?? null;
  return <div className="surface-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Release performance table</h2></div><p className="text-sm" style={{ color: "var(--text-muted)" }}>Sorted by streams</p></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr,0.75fr]"><div className="overflow-x-auto overflow-y-hidden rounded-[1.5rem] border" style={{ borderColor: "var(--border)" }}><div className="grid min-w-[640px] grid-cols-[1.6fr,0.7fr,0.7fr,0.9fr,0.7fr] gap-3 border-b px-4 py-3 text-xs uppercase tracking-[0.2em]" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-soft)" }}><span>Track Name</span><span>Streams</span><span>Revenue</span><span>Top Country</span><span>Status</span></div><div>{releases.length === 0 ? <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>No release performance data yet.</div> : releases.map((release) => { const active = release.id === selectedReleaseId; return <button key={release.id} type="button" onClick={() => onSelect(release.id)} className="grid min-w-[640px] w-full grid-cols-[1.6fr,0.7fr,0.7fr,0.9fr,0.7fr] gap-3 px-4 py-4 text-left transition" style={{ background: active ? "var(--accent-soft)" : "transparent", borderTop: "1px solid var(--border)" }}><span><span className="block font-semibold" style={{ color: "var(--text)" }}>{release.trackName}</span><span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{formatDateTime(release.updatedAt)}</span></span><span style={{ color: "var(--text)" }}>{formatNumber(release.streams)}</span><span style={{ color: "var(--text)" }}>{formatCurrency(release.revenue)}</span><span style={{ color: "var(--text)" }}>{release.topCountry}</span><span><span className="status-pill" style={{ borderColor: "var(--border)", color: "var(--text)" }}>{release.statusLabel}</span></span></button>; })}</div></div><div className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{selected ? <div><p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Selected release</p><h3 className="mt-3 text-xl font-semibold" style={{ color: "var(--text)" }}>{selected.trackName}</h3><div className="mt-4 space-y-3">{[["Streams", formatNumber(selected.streams)], ["Revenue", formatCurrency(selected.revenue)], ["Top country", selected.topCountry], ["Status", selected.statusLabel]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}><p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>{label}</p><p className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>{value}</p></div>)}</div></div> : <div className="flex min-h-[260px] items-center justify-center text-center"><p className="text-sm" style={{ color: "var(--text-muted)" }}>Select a release to see more detail.</p></div>}</div></div></div>;
}

export function AnalyticsOverview({ summary }: { summary: AnalyticsSummary }) {
  const [data, setData] = useState(summary);
  const [windowKey, setWindowKey] = useState<AnalyticsWindow>("30d");
  const [selectedCountry, setSelectedCountry] = useState(summary.selectedCountry || summary.countryBreakdown[0]?.country || "India");
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(summary.releaseRows[0]?.id ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setData(summary);
    setSelectedCountry(summary.selectedCountry || summary.countryBreakdown[0]?.country || "India");
    setSelectedReleaseId((current) => summary.releaseRows.some((release) => release.id === current) ? current : summary.releaseRows[0]?.id ?? null);
  }, [summary]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      setIsRefreshing(true);
      try {
        const response = await fetch("/api/analytics", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { summary?: AnalyticsSummary };
        if (active && payload.summary) {
          setData(payload.summary);
          setSelectedCountry((current) => payload.summary?.countryBreakdown.some((country) => country.country === current) ? current : payload.summary?.selectedCountry || payload.summary?.countryBreakdown[0]?.country || current);
          setSelectedReleaseId((current) => payload.summary?.releaseRows.some((release) => release.id === current) ? current : payload.summary?.releaseRows[0]?.id ?? null);
        }
      } catch {
        // Keep the current dashboard data on network errors.
      } finally {
        if (active) setIsRefreshing(false);
      }
    }

    refresh();
    const interval = window.setInterval(refresh, 30000);
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const currentSeries = data.series[windowKey] ?? data.series["30d"];
  const selectedRelease = data.releaseRows.find((release) => release.id === selectedReleaseId) ?? data.releaseRows[0] ?? null;
  const topCountry = data.countryBreakdown[0];

  return <div className="grid gap-6 xl:gap-8"><section className="surface-card relative overflow-hidden p-6 sm:p-8"><div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "color-mix(in srgb, var(--accent) 11%, transparent)" }} /><div className="pointer-events-none absolute -bottom-20 left-6 h-48 w-48 rounded-full blur-3xl" style={{ background: "color-mix(in srgb, var(--money) 12%, transparent)" }} /><div className="relative flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--text)" }}>{data.headline}</h1><p className="mt-4 max-w-2xl text-base leading-7" style={{ color: "var(--text-muted)" }}>Understand your performance in five seconds: what is working, what is not, and where the next release should go.</p></div><div className="rounded-[1.5rem] border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}><RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />Live refresh</div><p className="mt-2 text-sm font-medium" style={{ color: "var(--text)" }}>{formatDateTime(data.updatedAt)}</p></div></div><div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{data.metrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} kind={metric.format} detail={metric.detail} />)}</div></section>

<section className="surface-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Streams over time</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Spot the shape of your catalog growth at a glance.</p></div><div className="flex flex-wrap gap-2 rounded-full border p-1" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{analyticsWindows.map((window) => <button key={window} type="button" onClick={() => setWindowKey(window)} className="rounded-full px-4 py-2 text-sm font-medium transition" style={{ background: windowKey === window ? "var(--accent)" : "transparent", color: windowKey === window ? "var(--accent-foreground)" : "var(--text)" }}>{WINDOW_LABELS[window]}</button>)}</div></div><div className="mt-5 rounded-[1.5rem] border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><Chart points={currentSeries.streams} kind="number" /></div><div className="mt-5 grid gap-4 sm:grid-cols-3"><div className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}><p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Weekly growth</p><p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{formatPercent(data.growth.weekly)}</p></div><div className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}><p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Monthly growth</p><p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{formatPercent(data.growth.monthly)}</p></div><div className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}><p className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Active releases</p><p className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{formatNumber(data.metrics[2]?.value ?? 0)}</p></div></div></section>

<div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]"><CountryMap countries={data.countryBreakdown} selectedCountry={selectedCountry} onSelect={setSelectedCountry} /><PlatformBreakdown platforms={data.platformBreakdown} /></div>

<RevenueSection summary={data} windowKey={windowKey} points={currentSeries.revenue} />

<section className="surface-card p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>What the data is telling you</h2></div><Sparkles className="h-5 w-5" style={{ color: "var(--text-soft)" }} /></div><div className="mt-5 grid gap-4 lg:grid-cols-3">{data.insights.map((insight) => <InsightCard key={insight.title} insight={insight} />)}</div></section>

<ReleaseTable releases={data.releaseRows} selectedReleaseId={selectedReleaseId} onSelect={setSelectedReleaseId} />

<section className="surface-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>What is happening now</h2></div><div className="text-sm" style={{ color: "var(--text-muted)" }}>{topCountry ? `${topCountry.country} leads with ${formatNumber(topCountry.streams)} streams` : "No country data yet"}</div></div>{selectedRelease ? <div className="mt-5 grid gap-4 lg:grid-cols-4">{[["Track", selectedRelease.trackName], ["Streams", formatNumber(selectedRelease.streams)], ["Revenue", formatCurrency(selectedRelease.revenue)], ["Status", selectedRelease.statusLabel]].map(([label, value]) => <div key={String(label)} className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>{label}</p><p className="mt-2 text-base font-semibold" style={{ color: "var(--text)" }}>{value}</p></div>)}</div> : <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>No release selected yet.</p>}</section></div>;
}

// vercel trigger 2
