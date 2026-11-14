export const INCOME_SOURCE_KEYS = ['artist_royalty', 'studio', 'producer_beat_sales', 'other', 'referral', 'curator'] as const;
export type IncomeSourceKey = typeof INCOME_SOURCE_KEYS[number];
export type IncomeSource = { key: IncomeSourceKey; label: string; earned: number; available: number; held: number; paid: number; minimum: number; currency: 'INR' | 'USD'; route: 'wallet' | 'referral' | 'curator'; requestPending?: boolean };
export type IncomeSummary = { sources: IncomeSource[]; checkoutCredit: number; reconciliationRequired: boolean };
export type IncomeHistoryEntry = { id: number; date: string; label: string; amount: number; status: string };
export type IncomeHistory = { source: IncomeSourceKey; entries: IncomeHistoryEntry[]; withdrawals: IncomeHistoryEntry[]; nextCursor: number | null };
export const SOURCE_COLORS: Record<IncomeSourceKey, string> = { artist_royalty: '#98baff', studio: '#a6dfc5', producer_beat_sales: '#c4b0f4', other: '#f4bf87', referral: '#ef9cac', curator: '#82d4e0' };
export const incomeMoney = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
export const finiteMoney = (value: number) => Number.isFinite(value) ? value : 0;
export function incomeComposition(sources: IncomeSource[], selected: ReadonlySet<IncomeSourceKey>) {
  const positiveTotal = sources.reduce((sum, source) => sum + Math.max(0, finiteMoney(source.earned)), 0);
  const netTotal = sources.reduce((sum, source) => sum + finiteMoney(source.earned), 0);
  let offset = 0;
  const slices = sources.filter(source => selected.has(source.key) && source.earned > 0 && Number.isFinite(source.earned)).map(source => {
    const share = positiveTotal > 0 ? source.earned / positiveTotal : 0;
    const slice = { ...source, share, offset }; offset += share;
    return slice;
  });
  return { slices, positiveTotal, netTotal, selectedTotal: slices.reduce((sum, source) => sum + source.earned, 0), hiddenShare: Math.max(0, 1 - offset), adjustments: netTotal - positiveTotal };
}
/** Real annular paths keep each clickable area inside its own visible slice. */
export function incomeSlicePath(offset: number, share: number, active = false) {
  const outer = active ? 106 : 103, inner = active ? 72 : 75;
  const point = (radius: number, turn: number) => `${120 + radius * Math.cos(turn * Math.PI * 2 - Math.PI / 2)},${120 + radius * Math.sin(turn * Math.PI * 2 - Math.PI / 2)}`;
  if (share >= 1 - 1e-12) return `M${point(outer, 0)} A${outer},${outer} 0 1 1 ${point(outer, .5)} A${outer},${outer} 0 1 1 ${point(outer, 1)} L${point(inner, 1)} A${inner},${inner} 0 1 0 ${point(inner, .5)} A${inner},${inner} 0 1 0 ${point(inner, 0)} Z`;
  return `M${point(outer, offset)} A${outer},${outer} 0 ${share > .5 ? 1 : 0} 1 ${point(outer, offset + share)} L${point(inner, offset + share)} A${inner},${inner} 0 ${share > .5 ? 1 : 0} 0 ${point(inner, offset)} Z`;
}
export function incomeWithdrawalBlock(source: IncomeSource, reconciliation: boolean) {
  if (source.key === 'artist_royalty') return 'Use the distribution payout workspace below for payout windows and currency checks.';
  if (source.route === 'curator') return 'HYMN finance settles cleared reviews after the seven-day dispute hold.';
  if (source.route === 'wallet' && reconciliation) return 'Finance reconciliation is required before this wallet can be withdrawn.';
  if (source.requestPending) return 'A withdrawal is already in progress. Track it before requesting again.';
  if (!Number.isFinite(source.available) || source.available <= 0) return 'No cleared balance is available yet.';
  if (source.available < source.minimum) return `${incomeMoney(source.minimum - source.available)} more to reach the withdrawal minimum.`;
  return null;
}
