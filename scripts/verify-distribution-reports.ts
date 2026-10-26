import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { normalizeDireNoteRevenueReport } from "../lib/direnote-revenue";
import { getDireNoteTrackRevenue } from "../lib/direnote-service";

assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\/direnote_virtual/);
const isrc = "INHYM2600999";
const report = { success: true, track: { isrc, upc: "012345678905" }, revenue_by_month: [{ reporting_month: "2026-08", sales_month: "2026-06", breakdown: [{ platform: "Spotify", country_region: "US", sales_type: "Stream", quantity: 10, currency: "USD", revenue: 1.25 }] }] };
const originalFetch = globalThis.fetch;
async function main() {
  assert.equal(normalizeDireNoteRevenueReport(report).length, 1);
  for (const field of ["revenue", "quantity"]) for (const invalid of [null, "", true, "invalid"]) {
    const bad = structuredClone(report); Object.assign(bad.revenue_by_month[0].breakdown[0], { [field]: invalid });
    assert.throws(() => normalizeDireNoteRevenueReport(bad), /financial/);
  }
  const badMonth = structuredClone(report); badMonth.revenue_by_month[0].reporting_month = "2026-13";
  assert.throws(() => normalizeDireNoteRevenueReport(badMonth), /month/);
  assert.throws(() => normalizeDireNoteRevenueReport({ success: true }), /identity/);
  const actor = await prisma.user.create({ data: { googleId: "report-audit-admin", name: "Report audit", email: "report-audit@example.test", role: "ADMIN", status: "ACTIVE" } });
  const release = await prisma.release.create({ data: { userId: actor.id, title: "Report audit", artistName: "Fixture", genre: "Pop", releaseType: "single", upc: report.track.upc, releaseDate: new Date(), tracks: { create: { title: "Report audit", primaryArtist: "Fixture", trackNumber: 1, isrc } } } });
  let response: unknown = report;
  globalThis.fetch = async () => Response.json(response);
  await getDireNoteTrackRevenue(isrc, actor.id, false);
  assert.equal(await prisma.direNoteLog.count({ where: { action: "revenue_report", success: true } }), 0, "Preview must not suppress scheduled import");
  response = { ...report, track: { isrc: "INHYM2600998" } };
  await assert.rejects(getDireNoteTrackRevenue(isrc, actor.id, true), /does not match/);
  assert.equal(await prisma.royaltyLineItem.count(), 0);
  response = { ...report, revenue_by_month: [{ ...report.revenue_by_month[0], reporting_month: "2026-13" }] };
  await assert.rejects(getDireNoteTrackRevenue(isrc, actor.id, true), /month/);
  assert.equal(await prisma.direNoteLog.count({ where: { action: "revenue_report", success: true } }), 0, "Import failure must remain retryable");
  response = report;
  assert.equal((await getDireNoteTrackRevenue(isrc, actor.id, true)).ingestion?.imported, 1);
  await getDireNoteTrackRevenue(isrc, actor.id, true);
  assert.equal(await prisma.royaltyLineItem.count({ where: { releaseId: release.id } }), 1, "Replay must not credit royalties twice");
  const balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: actor.id } });
  assert.equal(balance.availableBalance.toString(), "1.25");
  assert.equal(balance.currency, "USD");
  const foreignCurrency = structuredClone(report); foreignCurrency.revenue_by_month[0].breakdown[0].currency = "INR";
  response = foreignCurrency;
  await assert.rejects(getDireNoteTrackRevenue(isrc, actor.id, true), /balance currency/);
  assert.equal(await prisma.royaltyLineItem.count({ where: { releaseId: release.id } }), 1, "Currency mismatch must roll back the entire statement");
  assert.equal((await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: actor.id } })).availableBalance.toString(), "1.25");
  globalThis.fetch = async () => new Response("Slow down", { status: 429, headers: { "retry-after": "120" } });
  await assert.rejects(getDireNoteTrackRevenue(isrc, actor.id, true));
  await assert.rejects(getDireNoteTrackRevenue(isrc, actor.id, true), /Retry-After/);
  console.log("PASS distribution reports: strict normalization, preview/import separation, recording binding, failed-import retry evidence, real ledger/balance credits, replay protection and shared 429 cooldown.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { globalThis.fetch = originalFetch; await prisma.$disconnect(); });
