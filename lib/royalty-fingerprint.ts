import { createHash } from "node:crypto";

const identifier = (value: string | null | undefined) => (value ?? "").replace(/[\s-]+/g, "").toUpperCase();

/** A provider-neutral economic-event identity shared by API and CSV imports. */
export function royaltyEconomicFingerprint(input: { reportingMonth: Date; salesMonth?: Date | null; isrc?: string | null; upc?: string | null; platform: string; country?: string | null; salesType?: string | null; quantity: number; currency: string; netRevenue: number }) {
  const normalized = { reportingMonth: input.reportingMonth.toISOString().slice(0, 7), salesMonth: input.salesMonth?.toISOString().slice(0, 7) ?? null, isrc: identifier(input.isrc), upc: identifier(input.upc), platform: input.platform.trim().toLowerCase(), country: (input.country ?? "").trim().toUpperCase(), salesType: (input.salesType ?? "").trim().toLowerCase(), quantity: Math.trunc(input.quantity), currency: input.currency.trim().toUpperCase(), netRevenue: Number(input.netRevenue).toFixed(6) };
  return `royalty-event:${createHash("sha256").update(JSON.stringify(normalized)).digest("hex")}`;
}
