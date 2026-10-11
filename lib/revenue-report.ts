export type RevenueChannel = "Subscriptions" | "Distribution" | "Beat Store" | "Studio" | "Royalty fees" | "Payout fees";
export type RevenueEntry = {
  id: string; channel: RevenueChannel; date: string; receipt: number; hymn: number | null;
  currency: string; reference: string; customer: string; evidence: "gateway" | "merchant_confirmation" | "ledger";
};
export const revenueChannels: RevenueChannel[] = ["Subscriptions", "Distribution", "Beat Store", "Studio", "Royalty fees", "Payout fees"];

/** Amounts are INR rupees. Gross collections and the platform's share are different measures. */
export function summarizeRevenue(entries: RevenueEntry[]) {
  const inr = entries.filter(row => row.currency === "INR");
  const channels = revenueChannels.map(channel => ({ channel, receipts: inr.filter(row => row.channel === channel).reduce((sum, row) => sum + row.receipt, 0), hymn: inr.filter(row => row.channel === channel).reduce((sum, row) => sum + (row.hymn ?? 0), 0) }));
  return {
    receipts: inr.reduce((sum, row) => sum + row.receipt, 0),
    hymn: inr.reduce((sum, row) => sum + (row.hymn ?? 0), 0),
    merchantConfirmed: inr.filter(row => row.evidence === "merchant_confirmation").reduce((sum, row) => sum + row.receipt, 0),
    unallocated: inr.filter(row => row.hymn === null).reduce((sum, row) => sum + row.receipt, 0),
    channels, otherCurrencies: [...new Set(entries.filter(row => row.currency !== "INR").map(row => row.currency))]
  };
}

export function monthlyRevenue(entries: RevenueEntry[]) {
  const months = new Map<string, { month: string; receipts: number; hymn: number }>();
  for (const row of entries.filter(row => row.currency === "INR")) {
    // ISO keys keep months in chronological order across years.
    const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", timeZone: "Asia/Kolkata" }).formatToParts(new Date(row.date));
    const key = `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}`;
    const current = months.get(key) ?? { month: key, receipts: 0, hymn: 0 };
    current.receipts += row.receipt; current.hymn += row.hymn ?? 0; months.set(key, current);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
