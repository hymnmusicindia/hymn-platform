import {
  AnalyticsCountryStat,
  AnalyticsInsight,
  AnalyticsMetric,
  AnalyticsPoint,
  AnalyticsPlatformStat,
  AnalyticsReleaseRow,
  AnalyticsSummary,
  AnalyticsWindow,
  AnalyticsWindowSeries,
  Release,
  ReleaseAnalytics,
  ReleaseStatus,
  UserRole
} from "@/lib/types";

export const analyticsWindows: AnalyticsWindow[] = ["7d", "30d", "all"];

const analyticsCountryPositions: Record<string, { x: number; y: number }> = {
  India: { x: 71, y: 54 },
  USA: { x: 18, y: 31 },
  "United Kingdom": { x: 45, y: 24 },
  Canada: { x: 16, y: 18 },
  Australia: { x: 88, y: 77 },
  Brazil: { x: 31, y: 67 },
  Germany: { x: 48, y: 26 },
  France: { x: 46, y: 28 },
  Indonesia: { x: 83, y: 66 },
  UAE: { x: 62, y: 41 },
  Nigeria: { x: 52, y: 54 }
};

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967295;
  };
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function formatStatusLabel(status: ReleaseStatus) {
  return status.replace(/_/g, " ");
}

function getRandomisedCountryWeights(release: Release, rng: () => number) {
  const language = (release.language || "").toLowerCase();
  const indianAudience = ["hindi", "punjabi", "bhojpuri", "marathi", "tamil", "telugu", "malayalam", "kannada"].some((entry) => language.includes(entry));
  const countryWeights: Array<[string, number]> = [
    ["India", indianAudience ? 5.8 + rng() * 1.5 : 4.2 + rng() * 1.2],
    ["USA", 3.4 + rng() * 1.1],
    ["United Kingdom", 2.3 + rng() * 0.8],
    ["Canada", 1.9 + rng() * 0.6],
    ["Australia", 1.7 + rng() * 0.5],
    ["UAE", indianAudience ? 2.0 + rng() * 0.6 : 1.2 + rng() * 0.4],
    ["Germany", 1.1 + rng() * 0.4],
    ["Brazil", 1.0 + rng() * 0.4],
    ["Indonesia", 1.0 + rng() * 0.4],
    ["Nigeria", 0.9 + rng() * 0.3]
  ];

  const total = countryWeights.reduce((sum, [, weight]) => sum + weight, 0);
  return countryWeights.map(([country, weight]) => [country, weight / total] as const);
}

function buildReleaseDailySeries(release: Release) {
  const seed = `${release.id}:${release.trackName}:${release.artistName}:${release.createdAt}`;
  const rng = seededRandom(seed);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - 119);

  const seriesLength = 120;
  const dailyStreams: AnalyticsPoint[] = [];
  const dailyRevenue: AnalyticsPoint[] = [];
  let streamsTotal = 0;
  let revenueTotal = 0;

  const releaseMomentum = release.status === "live" ? 1.25 : release.status === "approved" ? 1.1 : release.status === "under_review" ? 0.95 : 0.84;
  const titleMomentum = clamp(0.92 + (release.trackName.length % 7) * 0.03, 0.9, 1.15);
  const languageMomentum = ["hindi", "punjabi", "bhojpuri", "marathi", "tamil", "telugu", "malayalam", "kannada"].some((entry) => (release.language || "").toLowerCase().includes(entry)) ? 1.12 : 1;
  const base = 220 + release.id * 90 + Math.round(rng() * 180);

  for (let index = 0; index < seriesLength; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    const progress = index / (seriesLength - 1);
    const dayOfWeek = date.getDay();
    const weekdayBoost = dayOfWeek === 0 || dayOfWeek === 6 ? 0.88 : 1 + (dayOfWeek >= 3 ? 0.08 : 0.03);
    const trend = 0.62 + progress * 0.92;
    const wave = 0.9 + Math.sin(index / 5.2 + rng() * 1.2) * 0.09 + Math.cos(index / 11.5 + rng() * 1.7) * 0.05;
    const jitter = 0.9 + rng() * 0.2;
    const streams = Math.max(12, Math.round(base * trend * wave * jitter * weekdayBoost * releaseMomentum * titleMomentum * languageMomentum));
    const payoutRate = 0.0038 + rng() * 0.0017;
    const revenue = roundCurrency(streams * payoutRate);

    dailyStreams.push({ date: toDateKey(date), value: streams });
    dailyRevenue.push({ date: toDateKey(date), value: revenue });
    streamsTotal += streams;
    revenueTotal += revenue;
  }

  const basePlatformShares = {
    spotify: clamp(0.52 + rng() * 0.12 + (languageMomentum > 1 ? 0.03 : 0), 0.48, 0.7),
    apple: clamp(0.18 + rng() * 0.08, 0.14, 0.3),
    youtube: 0
  };
  basePlatformShares.youtube = Math.max(0.1, 1 - basePlatformShares.spotify - basePlatformShares.apple);
  const platformTotal = basePlatformShares.spotify + basePlatformShares.apple + basePlatformShares.youtube;
  const normalizedPlatformShares = {
    spotify: basePlatformShares.spotify / platformTotal,
    apple: basePlatformShares.apple / platformTotal,
    youtube: basePlatformShares.youtube / platformTotal
  };

  const platformStreams = {
    spotify: Math.round(streamsTotal * normalizedPlatformShares.spotify),
    apple: Math.round(streamsTotal * normalizedPlatformShares.apple),
    youtube: Math.max(0, streamsTotal - Math.round(streamsTotal * normalizedPlatformShares.spotify) - Math.round(streamsTotal * normalizedPlatformShares.apple))
  };
  const streamDiff = streamsTotal - (platformStreams.spotify + platformStreams.apple + platformStreams.youtube);
  if (streamDiff !== 0) {
    platformStreams.spotify += streamDiff;
  }

  const countryWeights = getRandomisedCountryWeights(release, rng);
  const countryEntries = countryWeights.map(([country, weight]) => [country, Math.max(1, Math.round(streamsTotal * weight))] as const);
  const countryDiff = streamsTotal - countryEntries.reduce((sum, [, value]) => sum + value, 0);
  if (countryEntries.length > 0 && countryDiff !== 0) {
    countryEntries[0] = [countryEntries[0][0], countryEntries[0][1] + countryDiff];
  }

  return {
    streams_total: streamsTotal,
    revenue_total: roundCurrency(revenueTotal),
    platforms: platformStreams,
    countries: Object.fromEntries(countryEntries),
    daily_streams: dailyStreams,
    daily_revenue: dailyRevenue
  } satisfies ReleaseAnalytics;
}

export function ensureReleaseAnalytics(release: Release) {
  const analytics = release.analytics ?? buildReleaseDailySeries(release);
  return analytics === release.analytics ? release : { ...release, analytics };
}

function sumPoints(points: AnalyticsPoint[]) {
  return points.reduce((sum, point) => sum + point.value, 0);
}

function aggregateTimeSeries(releases: Release[]) {
  const streamMap = new Map<string, number>();
  const revenueMap = new Map<string, number>();

  for (const release of releases) {
    if (!release.analytics) continue;
    for (const point of release.analytics.daily_streams) {
      streamMap.set(point.date, (streamMap.get(point.date) ?? 0) + point.value);
    }
    for (const point of release.analytics.daily_revenue) {
      revenueMap.set(point.date, roundCurrency((revenueMap.get(point.date) ?? 0) + point.value));
    }
  }

  const dates = Array.from(new Set([...streamMap.keys(), ...revenueMap.keys()])).sort((left, right) => left.localeCompare(right));
  const streams = dates.map((date) => ({ date, value: streamMap.get(date) ?? 0 })).filter((point) => point.value > 0);
  const revenue = dates.map((date) => ({ date, value: roundCurrency(revenueMap.get(date) ?? 0) })).filter((point) => point.value > 0);
  return { streams, revenue };
}

function windowSeries(label: string, streams: AnalyticsPoint[], revenue: AnalyticsPoint[], size: number) {
  if (size <= 0) {
    return { label, streams, revenue };
  }
  return {
    label,
    streams: streams.length > size ? streams.slice(-size) : streams,
    revenue: revenue.length > size ? revenue.slice(-size) : revenue
  };
}

function getGrowth(points: AnalyticsPoint[], size: number) {
  if (points.length < size * 2 || size <= 0) return 0;
  const recent = sumPoints(points.slice(-size));
  const previous = sumPoints(points.slice(-size * 2, -size));
  if (previous <= 0) return recent > 0 ? 100 : 0;
  return ((recent - previous) / previous) * 100;
}

function formatMetricValue(metric: AnalyticsMetric) {
  if (metric.format === "currency") {
    return `Rs ${metric.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  if (metric.format === "percent") {
    return formatPercent(metric.value);
  }
  return metric.value.toLocaleString("en-IN");
}

function topCountry(countries: Record<string, number>) {
  const entries = Object.entries(countries).sort((left, right) => right[1] - left[1]);
  return entries[0]?.[0] ?? "India";
}

function buildCountryBreakdown(releases: Release[]) {
  const totals = new Map<string, number>();
  for (const release of releases) {
    if (!release.analytics) continue;
    for (const [country, value] of Object.entries(release.analytics.countries)) {
      totals.set(country, (totals.get(country) ?? 0) + value);
    }
  }

  const totalStreams = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([country, streams]) => {
      const position = analyticsCountryPositions[country] ?? { x: 50, y: 50 };
      return {
        country,
        streams,
        percent: totalStreams > 0 ? (streams / totalStreams) * 100 : 0,
        x: position.x,
        y: position.y
      } satisfies AnalyticsCountryStat;
    });
}

function buildPlatformBreakdown(releases: Release[]) {
  const totals = { spotify: 0, apple: 0, youtube: 0 };
  for (const release of releases) {
    if (!release.analytics) continue;
    totals.spotify += release.analytics.platforms.spotify;
    totals.apple += release.analytics.platforms.apple;
    totals.youtube += release.analytics.platforms.youtube;
  }

  const totalStreams = totals.spotify + totals.apple + totals.youtube;
  const rates = {
    spotify: 0.0042,
    apple: 0.0051,
    youtube: 0.0031
  };

  return [
    {
      platform: "Spotify",
      streams: totals.spotify,
      revenue: roundCurrency(totals.spotify * rates.spotify),
      percent: totalStreams > 0 ? (totals.spotify / totalStreams) * 100 : 0
    },
    {
      platform: "Apple Music",
      streams: totals.apple,
      revenue: roundCurrency(totals.apple * rates.apple),
      percent: totalStreams > 0 ? (totals.apple / totalStreams) * 100 : 0
    },
    {
      platform: "YouTube",
      streams: totals.youtube,
      revenue: roundCurrency(totals.youtube * rates.youtube),
      percent: totalStreams > 0 ? (totals.youtube / totalStreams) * 100 : 0
    }
  ] satisfies AnalyticsPlatformStat[];
}

function buildReleaseRows(releases: Release[]) {
  return [...releases]
    .map((release) => {
      const analytics = release.analytics;
      const topCountryName = analytics ? topCountry(analytics.countries) : "India";
      return {
        id: release.id,
        trackName: release.trackName,
        streams: analytics?.streams_total ?? 0,
        revenue: analytics?.revenue_total ?? 0,
        topCountry: topCountryName,
        status: release.status,
        statusLabel: formatStatusLabel(release.status),
        updatedAt: release.createdAt
      } satisfies AnalyticsReleaseRow;
    })
    .sort((left, right) => right.streams - left.streams || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function buildInsights(releases: Release[], growth: { weekly: number; monthly: number }, countryBreakdown: AnalyticsCountryStat[], platformBreakdown: AnalyticsPlatformStat[]) {
  if (!releases.length) {
    return [
      {
        title: "No release data yet",
        body: "Publish your first release to start tracking streams, revenue, and audience reach.",
        tone: "warning"
      }
    ] satisfies AnalyticsInsight[];
  }

  const sortedReleases = [...releases].sort((left, right) => right.analytics!.streams_total - left.analytics!.streams_total);
  const latestRelease = [...releases].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
  const strongestCountry = countryBreakdown[0]?.country ?? "India";
  const strongestPlatform = platformBreakdown[0];
  const averageStreams = sortedReleases.reduce((sum, release) => sum + (release.analytics?.streams_total ?? 0), 0) / sortedReleases.length;

  const releaseInsight = latestRelease && averageStreams > 0
    ? latestRelease.analytics!.streams_total >= averageStreams
      ? `Your latest release is performing above your catalog average by ${formatPercent(((latestRelease.analytics!.streams_total - averageStreams) / averageStreams) * 100)}.`
      : `Your latest release is below your catalog average. A stronger launch push could close the gap.`
    : `Your latest release gives you a benchmark for future drops.`;

  return [
    {
      title: "Momentum",
      body: growth.weekly >= 0 ? `Your streams increased by ${formatPercent(growth.weekly)} this week.` : `Your streams dipped by ${formatPercent(Math.abs(growth.weekly))} this week.`,
      tone: growth.weekly >= 0 ? "success" : "warning"
    },
    {
      title: "Audience",
      body: `${strongestCountry} is your strongest audience right now.`,
      tone: "neutral"
    },
    {
      title: "Release signal",
      body: releaseInsight + (strongestPlatform ? ` Spotify is leading with ${strongestPlatform.percent.toFixed(0)}% of total streams.` : ""),
      tone: "success"
    }
  ] satisfies AnalyticsInsight[];
}

function buildEmptySeries(label: string): AnalyticsWindowSeries {
  return { label, streams: [], revenue: [] };
}

export function buildAnalyticsSummary(releases: Release[], role: UserRole): AnalyticsSummary {
  const normalizedReleases = releases.map((release) => ensureReleaseAnalytics(release));
  const aggregated = aggregateTimeSeries(normalizedReleases);
  const weeklyGrowth = getGrowth(aggregated.streams, 7);
  const monthlyGrowth = getGrowth(aggregated.streams, 30);
  const countryBreakdown = buildCountryBreakdown(normalizedReleases);
  const platformBreakdown = buildPlatformBreakdown(normalizedReleases);
  const releaseRows = buildReleaseRows(normalizedReleases);
  const totalStreams = normalizedReleases.reduce((sum, release) => sum + (release.analytics?.streams_total ?? 0), 0);
  const totalRevenue = roundCurrency(normalizedReleases.reduce((sum, release) => sum + (release.analytics?.revenue_total ?? 0), 0));
  const activeReleases = normalizedReleases.filter((release) => release.status !== "rejected").length;
  const selectedCountry = countryBreakdown[0]?.country ?? "India";
  const headline = normalizedReleases.length === 0
    ? "Publish your first release to unlock streams, revenue, country reach, and release momentum."
    : role === "admin"
      ? "Platform-wide release performance across every artist in one clean view."
      : "Your release performance and audience reach at a glance.";

  const metrics: AnalyticsMetric[] = [
    {
      label: "Total Streams",
      value: totalStreams,
      format: "number",
      detail: `${normalizedReleases.length} release${normalizedReleases.length === 1 ? "" : "s"}`
    },
    {
      label: "Total Revenue",
      value: totalRevenue,
      format: "currency",
      detail: "Streaming payouts only"
    },
    {
      label: "Active Releases",
      value: activeReleases,
      format: "number",
      detail: activeReleases > 0 ? "Releases in motion" : "Nothing active yet"
    },
    {
      label: "Growth %",
      value: weeklyGrowth,
      format: "percent",
      detail: `30d ${formatPercent(monthlyGrowth)}`
    }
  ];

  const topMetricDetail = metrics.map((metric) => metric.detail).join(" · ");

  const summary: AnalyticsSummary = {
    role,
    headline,
    updatedAt: new Date().toISOString(),
    metrics: metrics.map((metric) => ({ ...metric, detail: metric.detail || topMetricDetail })),
    growth: {
      weekly: weeklyGrowth,
      monthly: monthlyGrowth,
      weeklyLabel: formatPercent(weeklyGrowth),
      monthlyLabel: formatPercent(monthlyGrowth)
    },
    series: {
      "7d": windowSeries("Last 7 days", aggregated.streams, aggregated.revenue, 7),
      "30d": windowSeries("Last 30 days", aggregated.streams, aggregated.revenue, 30),
      all: { label: "All time", streams: aggregated.streams, revenue: aggregated.revenue }
    },
    countryBreakdown,
    platformBreakdown,
    revenueBreakdown: platformBreakdown.map((platform) => ({ ...platform, revenue: roundCurrency(platform.revenue), percent: platform.percent })),
    insights: buildInsights(normalizedReleases, { weekly: weeklyGrowth, monthly: monthlyGrowth }, countryBreakdown, platformBreakdown),
    releaseRows,
    selectedCountry
  };

  if (!normalizedReleases.length) {
    summary.series = {
      "7d": buildEmptySeries("Last 7 days"),
      "30d": buildEmptySeries("Last 30 days"),
      all: buildEmptySeries("All time")
    };
  }

  return summary;
}