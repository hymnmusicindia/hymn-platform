import assert from "node:assert/strict";
import { buildAnalyticsSummary, ensureReleaseAnalytics } from "../lib/analytics";
import type { Release } from "../lib/types";

const release = { id: 1, userId: 1, trackName: "Unreported", artistName: "Artist", status: "live", createdAt: new Date().toISOString() } as Release;
assert.equal(ensureReleaseAnalytics(release).analytics, undefined);
const summary = buildAnalyticsSummary([release], "customer");
assert.equal(summary.state, "empty");
assert.equal(summary.isVerified, false);
assert.equal(summary.metrics.find(metric => metric.label === "Total Streams")?.value, 0);
assert.deepEqual(summary.countryBreakdown, []);
assert.deepEqual(summary.platformBreakdown, []);
assert.deepEqual(summary.series.all.streams, []);
assert.equal(summary.emptyReason, "no_verified_data");

const persisted = {
  ...release,
  analytics: {
    streams_total: 0,
    revenue_total: 0,
    platforms: { Spotify: 0 },
    countries: { India: 0 },
    daily_streams: [{ date: "2026-07-01", value: 0 }],
    daily_revenue: [{ date: "2026-07-01", value: 0 }]
  }
} as Release;
const verified = buildAnalyticsSummary([persisted], "customer", {
  dataSource: "provider_statement",
  statementPeriod: "2026-07",
  importedAt: "2026-07-20T00:00:00.000Z"
});
assert.equal(verified.state, "verified");
assert.equal(verified.metrics[0]?.value, 0);
assert.equal(verified.dataSource, "provider_statement");
assert.equal(verified.series.all.streams[0]?.value, 0);
console.log("Analytics domain verification passed: empty datasets remain empty.");
// vercel trigger 9
