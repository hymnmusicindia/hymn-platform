export const INCOME_MINIMUM_INR = { referral: 1500, studio: 3000, curator: 1500, producer_beat_sales: 3000, other: 3000 } as const;
export const WALLET_SOURCES = ["artist_royalty", "studio", "producer_beat_sales", "other"] as const;
export type WalletSource = typeof WALLET_SOURCES[number];

// Separate net credits from cash withdrawals. Reversals use either sign convention
// in the legacy wallet, so direction is authoritative.
export function walletIncomeBalances(lifetime: number, available: number, ledger: { type:string; amount:number; direction:string }[], requests: { sourceType:string; amount:number; status:string }[]) {
  const totals: Record<WalletSource, number> = { artist_royalty:0, studio:0, producer_beat_sales:0, other:0 };
  for (const row of ledger) {
    const source: WalletSource | null = row.type.startsWith("studio_service_") ? "studio" : row.type.startsWith("beat_sale_") ? "producer_beat_sales" : row.type === "manual_adjustment" ? "other" : null;
    if (source) totals[source] += (row.direction === "debit" ? -1 : 1) * Math.abs(row.amount);
  }
  totals.artist_royalty = lifetime - totals.studio - totals.producer_beat_sales - totals.other;
  const spendable = {...totals};
  let legacy = 0;
  for(const request of requests) {
    if(["REJECTED","FAILED","CANCELLED"].includes(request.status)) continue;
    if((WALLET_SOURCES as readonly string[]).includes(request.sourceType)) spendable[request.sourceType as WalletSource] -= request.amount;
    else legacy += request.amount;
  }
  // Legacy mixed withdrawals have no attribution. Reserve against all sources
  // conservatively rather than invent a historical allocation.
  const unresolved = legacy > 0 || Object.values(spendable).some(value => value < -.01);
  for(const source of WALLET_SOURCES) spendable[source] = unresolved ? 0 : Math.max(0, Math.min(spendable[source], available));
  return { totals, spendable, unresolved };
}
