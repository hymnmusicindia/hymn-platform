import 'server-only';
import { prisma } from './prisma';
import type { IncomeHistory, IncomeHistoryEntry, IncomeSourceKey } from './income-explorer';

/** Cursor pages are always scoped to the signed-in beneficiary. No bank data,
 * customer identities, provider credentials or internal notes are returned. */
export async function getIncomeHistory(userId: number, source: IncomeSourceKey, before?: number): Promise<IncomeHistory> {
  const cursor = before ? { id: { lt: before } } : {};
  const pageSize = 20;
  let entries: IncomeHistoryEntry[];
  let withdrawals: IncomeHistoryEntry[] = [];
  if (source === 'referral') {
    const [rows, payouts] = await Promise.all([
      prisma.referralCommission.findMany({ where: { referral: { userId }, ...cursor }, orderBy: { id: 'desc' }, take: pageSize + 1, select: { id: true, capturedAt: true, netMinor: true, status: true } }),
      prisma.referralCommissionPayout.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 5, select: { id: true, createdAt: true, amountMinor: true, status: true } }),
    ]);
    entries = rows.map(row => ({ id: row.id, date: row.capturedAt.toISOString(), label: row.status === 'EXCLUDED' ? 'Excluded commission' : 'Referral commission, after adjustments', amount: row.status === 'EXCLUDED' ? 0 : row.netMinor / 100, status: row.status }));
    withdrawals = payouts.map(row => ({ id: row.id, date: row.createdAt.toISOString(), label: `Withdrawal #${row.id}`, amount: row.amountMinor / 100, status: row.status }));
  } else if (source === 'curator') {
    const rows = await prisma.playlistReviewRequest.findMany({ where: { listing: { ownerId: userId, isHymn: false }, payoutStatus: { in: ['HELD', 'PAID', 'FROZEN'] }, ...cursor }, orderBy: { id: 'desc' }, take: pageSize + 1, select: { id: true, reviewedAt: true, createdAt: true, amountMinor: true, payoutStatus: true } });
    entries = rows.map(row => ({ id: row.id, date: (row.reviewedAt ?? row.createdAt).toISOString(), label: 'Playlist review', amount: row.amountMinor / 100, status: row.payoutStatus }));
  } else {
    const type = source === 'studio' ? { startsWith: 'studio_service_' } : source === 'producer_beat_sales' ? { startsWith: 'beat_sale_' } : source === 'other' ? { equals: 'manual_adjustment' } : { in: ['royalty_credit', 'royalty_adjustment', 'earning_credit', 'payout_reversal'] };
    const [rows, payouts] = await Promise.all([
      prisma.walletTransaction.findMany({ where: { userId, currency: 'INR', type, ...cursor }, orderBy: { id: 'desc' }, take: pageSize + 1, select: { id: true, effectiveAt: true, amount: true, direction: true, availabilityStatus: true } }),
      prisma.payoutRequest.findMany({ where: { userId, sourceType: source }, orderBy: { id: 'desc' }, take: 5, select: { id: true, requestedAt: true, amount: true, status: true } }),
    ]);
    entries = rows.map(row => ({ id: row.id, date: row.effectiveAt.toISOString(), label: row.direction === 'debit' ? 'Refund / reversal' : 'Earning credit', amount: (row.direction === 'debit' ? -1 : 1) * Math.abs(Number(row.amount)), status: row.availabilityStatus }));
    withdrawals = payouts.map(row => ({ id: row.id, date: row.requestedAt.toISOString(), label: `Withdrawal #${row.id}`, amount: Number(row.amount), status: row.status }));
  }
  const hasMore = entries.length > pageSize;
  const page = entries.slice(0, pageSize);
  return { source, entries: page, withdrawals, nextCursor: hasMore ? page.at(-1)!.id : null };
}
