import {
  AnalyticsCountryStat, AnalyticsInsight, AnalyticsMetric, AnalyticsPlatformStat,
  AnalyticsReleaseRow, AnalyticsSummary, AnalyticsWindow, AnalyticsWindowSeries,
  Release, UserRole
} from "@/lib/types";

export const analyticsWindows: AnalyticsWindow[] = ["7d", "30d", "all"];
const positions: Record<string, { x: number; y: number }> = { India: { x: 71, y: 54 }, USA: { x: 18, y: 31 }, "United Kingdom": { x: 45, y: 24 }, Canada: { x: 16, y: 18 }, Australia: { x: 88, y: 77 }, Brazil: { x: 31, y: 67 }, Germany: { x: 48, y: 26 }, France: { x: 46, y: 28 }, Indonesia: { x: 83, y: 66 }, UAE: { x: 62, y: 41 }, Nigeria: { x: 52, y: 54 } };

/** Preserves persisted analytics only. This function intentionally never creates estimates. */
export function ensureReleaseAnalytics(release: Release) { return release; }
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const money = (value: number) => Math.round(value * 100) / 100;
const emptySeries = (label: string): AnalyticsWindowSeries => ({ label, streams: [], revenue: [] });
function growth(points: Array<{ value: number }>, size: number) { if (points.length < size * 2) return 0; const recent = sum(points.slice(-size).map(p => p.value)); const prior = sum(points.slice(-size * 2, -size).map(p => p.value)); return prior > 0 ? ((recent - prior) / prior) * 100 : 0; }
function label(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`; }

export function buildAnalyticsSummary(releases: Release[], role: UserRole, provenance?: { dataSource: string | null; statementPeriod: string | null; importedAt: string | null }): AnalyticsSummary {
  const verified = releases.filter(release => release.analytics != null);
  const streamDays = new Map<string, number>(); const revenueDays = new Map<string, number>(); const countries = new Map<string, number>(); const platforms = new Map<string, number>();
  for (const release of verified) {
    const data = release.analytics!;
    data.daily_streams.forEach(p => streamDays.set(p.date, (streamDays.get(p.date) ?? 0) + p.value));
    data.daily_revenue.forEach(p => revenueDays.set(p.date, money((revenueDays.get(p.date) ?? 0) + p.value)));
    Object.entries(data.countries).forEach(([key, value]) => countries.set(key, (countries.get(key) ?? 0) + value));
    Object.entries(data.platforms).forEach(([key, value]) => platforms.set(key, (platforms.get(key) ?? 0) + value));
  }
  const dates = [...new Set([...streamDays.keys(), ...revenueDays.keys()])].sort();
  const streams = dates.map(date => ({ date, value: streamDays.get(date) ?? 0 })); const revenue = dates.map(date => ({ date, value: revenueDays.get(date) ?? 0 }));
  const totalStreams = sum(verified.map(r => r.analytics!.streams_total)); const totalRevenue = money(sum(verified.map(r => r.analytics!.revenue_total)));
  const countryBreakdown: AnalyticsCountryStat[] = [...countries.entries()].sort((a,b) => b[1]-a[1]).slice(0,8).map(([country, value]) => ({ country, streams: value, percent: totalStreams ? value / totalStreams * 100 : 0, ...(positions[country] ?? { x: 50, y: 50 }) }));
  const platformBreakdown: AnalyticsPlatformStat[] = [...platforms.entries()].sort((a,b) => b[1]-a[1]).map(([platform, value]) => ({ platform, streams: value, revenue: 0, percent: totalStreams ? value / totalStreams * 100 : 0 }));
  const releaseRows: AnalyticsReleaseRow[] = verified.map(release => ({ id: release.id, trackName: release.trackName, streams: release.analytics!.streams_total, revenue: release.analytics!.revenue_total, topCountry: Object.entries(release.analytics!.countries).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? "—", status: release.status, statusLabel: release.status.replace(/_/g," "), updatedAt: release.createdAt })).sort((a,b)=>b.streams-a.streams);
  const weekly = growth(streams, 7); const monthly = growth(streams, 30); const hasData = verified.length > 0;
  const metrics: AnalyticsMetric[] = [{ label: "Total Streams", value: totalStreams, format: "number", detail: `${verified.length} verified release${verified.length === 1 ? "" : "s"}` }, { label: "Total Revenue", value: totalRevenue, format: "currency", detail: "Provider-reported only" }, { label: "Active Releases", value: verified.length, format: "number", detail: "With verified analytics" }, { label: "Growth %", value: weekly, format: "percent", detail: `30d ${label(monthly)}` }];
  const insights: AnalyticsInsight[] = hasData ? [] : [{ title: "No verified data yet", body: "HYMN has not received verified analytics for this catalogue and period.", tone: "warning" }];
  return { state: hasData ? "verified" : "empty", emptyReason: hasData ? undefined : "no_verified_data", dataSource: provenance?.dataSource ?? null, statementPeriod: provenance?.statementPeriod ?? null, importedAt: provenance?.importedAt ?? null, isVerified: hasData, role, headline: hasData ? "Verified catalogue performance" : "No verified analytics available", updatedAt: provenance?.importedAt ?? new Date().toISOString(), metrics, growth: { weekly, monthly, weeklyLabel: label(weekly), monthlyLabel: label(monthly) }, series: hasData ? { "7d": { label: "Last 7 days", streams: streams.slice(-7), revenue: revenue.slice(-7) }, "30d": { label: "Last 30 days", streams: streams.slice(-30), revenue: revenue.slice(-30) }, all: { label: "All time", streams, revenue } } : { "7d": emptySeries("Last 7 days"), "30d": emptySeries("Last 30 days"), all: emptySeries("All time") }, countryBreakdown, platformBreakdown, revenueBreakdown: platformBreakdown, insights, releaseRows, selectedCountry: countryBreakdown[0]?.country ?? "" };
}
// vercel trigger 9
