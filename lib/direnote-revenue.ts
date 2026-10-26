import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { importRoyaltyStatementAtomic, type MatchedRoyaltyImportRow, type UnmatchedRoyaltyImportRow } from "@/lib/royalty-import";
import { royaltyEconomicFingerprint } from "@/lib/royalty-fingerprint";

type ObjectRecord = Record<string, unknown>;
const object = (value: unknown): ObjectRecord => value && typeof value === "object" ? value as ObjectRecord : {};
const string = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const identifier = (value: unknown) => string(value).replace(/[\s-]+/g, "").toUpperCase();
const month = (value: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(string(value)) ? new Date(`${string(value)}-01T00:00:00.000Z`) : null;
const numeric = (value: unknown) => (typeof value === "number" || typeof value === "string" && value.trim() !== "") ? Number(value) : NaN;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export { royaltyEconomicFingerprint } from "@/lib/royalty-fingerprint";

export type DireNoteNormalizedRevenue = {
  reportingMonth: Date; salesMonth: Date | null; platform: string; country: string | null; salesType: string | null;
  quantity: number; currency: string; netRevenue: number; isrc: string; upc: string | null; originalValues: Prisma.InputJsonValue;
};

/** Normalizes the documented `revenue_by_month[].breakdown[]` response without losing source dimensions. */
export function normalizeDireNoteRevenueReport(report: unknown): DireNoteNormalizedRevenue[] {
  const root = object(report); const track = object(root.track); const isrc = identifier(track.isrc);
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc) || !Array.isArray(root.revenue_by_month)) throw new Error("Revenue report is missing its recording identity or monthly breakdown.");
  const rows: DireNoteNormalizedRevenue[] = [];
  for (const monthly of Array.isArray(root.revenue_by_month) ? root.revenue_by_month : []) {
    const summary = object(monthly); const reportingMonth = month(summary.reporting_month); const salesMonth = month(summary.sales_month);
    if (!reportingMonth || summary.sales_month != null && !salesMonth || !Array.isArray(summary.breakdown)) throw new Error("Revenue report contains an invalid month or missing breakdown.");
    for (const item of Array.isArray(summary.breakdown) ? summary.breakdown : []) {
      const breakdown = object(item); const netRevenue = numeric(breakdown.revenue); const quantity = numeric(breakdown.quantity);
      if (!Number.isFinite(netRevenue) || !Number.isSafeInteger(quantity) || !/^[A-Z]{3}$/.test(string(breakdown.currency).toUpperCase())) throw new Error("Revenue report contains invalid financial values or currency.");
      rows.push({ reportingMonth, salesMonth, platform: string(breakdown.platform) || "Unknown", country: string(breakdown.country_region) || null, salesType: string(breakdown.sales_type) || null, quantity: Math.trunc(quantity), currency: string(breakdown.currency).toUpperCase() || "USD", netRevenue, isrc, upc: identifier(track.upc) || null, originalValues: json({ track, reporting_month: string(summary.reporting_month), sales_month: string(summary.sales_month), month_revenue: summary.month_revenue ?? null, month_quantity: summary.month_quantity ?? null, breakdown }) });
    }
  }
  return rows;
}

export async function importDireNoteRevenueReport(report: unknown, actorId: number) {
  const rows = normalizeDireNoteRevenueReport(report);
  if (!rows.length) return { imported: 0, unmatched: 0, duplicatesIgnored: 0, recordsRetrieved: 0 };
  const isrcs = [...new Set(rows.map(row => row.isrc))];
  const tracks = await prisma.track.findMany({ where: { isrc: { in: isrcs } }, include: { release: true } });
  const grouped = new Map<string, DireNoteNormalizedRevenue[]>();
  for (const row of rows) { const key = `${row.reportingMonth.toISOString()}:${row.currency}`; grouped.set(key, [...(grouped.get(key) ?? []), row]); }
  const results = [];
  for (const [groupKey, group] of grouped) {
    const matched: MatchedRoyaltyImportRow[] = []; const unmatched: UnmatchedRoyaltyImportRow[] = [];
    for (const [index, row] of group.entries()) {
      const sourceKey = royaltyEconomicFingerprint(row);
      const candidates = tracks.filter(track => identifier(track.isrc) === row.isrc && (!row.upc || identifier(track.release.upc) === row.upc));
      const track = candidates.length === 1 ? candidates[0] : null;
      if (!track) { unmatched.push({ sourceKey, sourceLineNumber: index + 1, statementMonth: row.reportingMonth, isrc: row.isrc, upc: row.upc, rawData: json({ ...object(row.originalValues), platform: row.platform, territory: row.country, gross_revenue: row.netRevenue, service_fee: 0, net_revenue: row.netRevenue, streams: /stream/i.test(row.salesType ?? "") ? row.quantity : null, downloads: /download/i.test(row.salesType ?? "") ? row.quantity : null }) }); continue; }
      matched.push({ sourceKey, releaseId: track.releaseId, trackId: track.id, userId: track.release.userId, isrc: row.isrc, upc: row.upc, sourceLineNumber: index + 1, statementMonth: row.reportingMonth, salesMonth: row.salesMonth, salesType: row.salesType, platform: row.platform, territory: row.country, grossRevenue: row.netRevenue, serviceFee: 0, netRevenue: row.netRevenue, quantity: row.quantity, streams: /stream/i.test(row.salesType ?? "") ? row.quantity : null, downloads: /download/i.test(row.salesType ?? "") ? row.quantity : null, originalValues: row.originalValues });
    }
    const checksum = hash({ source: "direnote-api-v2.3", groupKey, rows: group.map(row => row.originalValues) });
    try { results.push(await importRoyaltyStatementAtomic({ provider: "DireNote API v2.3", currency: group[0].currency, periodStart: group[0].reportingMonth, periodEnd: new Date(Date.UTC(group[0].reportingMonth.getUTCFullYear(), group[0].reportingMonth.getUTCMonth() + 1, 0)), checksum, originalFileName: `direnote-api-${group[0].reportingMonth.toISOString().slice(0, 7)}.json`, actorId, matched, unmatched })); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && /file_checksum|fileChecksum/.test(String(error.meta?.target))) results.push({ imported: 0, unmatched: 0, duplicatesIgnored: group.length, duplicate: true });
      else throw error;
    }
  }
  return { recordsRetrieved: rows.length, imported: results.reduce((total, result) => total + result.imported, 0), unmatched: results.reduce((total, result) => total + result.unmatched, 0), duplicatesIgnored: results.reduce((total, result) => total + result.duplicatesIgnored, 0), results };
}
