import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { getIncomeSummary } from '../lib/income-summary';
import { getIncomeHistory } from '../lib/income-history';
import { getPayoutSummary } from '../lib/payout';
import { incomeComposition, incomeSlicePath, incomeWithdrawalBlock, INCOME_SOURCE_KEYS } from '../lib/income-explorer';

async function main() {
  assert.equal(new URL(process.env.DATABASE_URL!).hostname, '127.0.0.1', 'This test requires a disposable local database');
  const users = await Promise.all(['owner', 'outsider'].map(name => prisma.user.create({ data: { googleId: `income-${name}`, email: `income-${name}@fixture.invalid`, name, role: 'CUSTOMER', status: 'ACTIVE' } })));
  const [owner, outsider] = users;
  await prisma.artistPayoutBalance.create({ data: { userId: owner.id, lifetimeEarnings: 10000, availableBalance: 9000 } });
  for (const user of users) {
    await prisma.walletTransaction.createMany({ data: Array.from({ length: 25 }, (_, index) => ({ userId: user.id, type: 'studio_service_credit', amount: 200, direction: 'credit', referenceType: 'fixture', referenceId: String(index), balanceAfter: 5000, note: 'PRIVATE NOTE NEVER RETURNED' })) });
    await prisma.walletTransaction.create({ data: { userId: user.id, type: 'studio_service_reversal', amount: -100, direction: 'debit', referenceType: 'fixture', referenceId: 'reversal', balanceAfter: 4900 } });
    await prisma.walletTransaction.create({ data: { userId: user.id, type: 'beat_sale_credit', amount: 2000, referenceType: 'fixture', referenceId: 'beat', balanceAfter: 6900 } });
    await prisma.payoutRequest.create({ data: { userId: user.id, sourceType: 'studio', amount: 1000, serviceFee: 20, netAmount: 980, method: 'UPI', status: 'REQUESTED', upiId: 'PRIVATE@BANK' } });
  }
  let summary = await getIncomeSummary(owner.id);
  const studio = summary.sources.find(row => row.key === 'studio')!;
  assert.equal(studio.earned, 4900); assert.equal(studio.available, 3900); assert.equal(studio.held, 1000);
  assert(summary.sources.filter(row => row.route === 'wallet').every(row => row.requestPending));
  assert.equal(summary.sources.find(row => row.key === 'artist_royalty')!.earned, 3100);
  assert.equal(summary.sources.reduce((sum, row) => sum + row.earned, 0), 10000);
  assert.equal(summary.reconciliationRequired, false);
  assert.match(incomeWithdrawalBlock(studio, false)!, /already in progress/);
  const first = await getIncomeHistory(owner.id, 'studio');
  assert.equal(first.entries.length, 20); assert.equal(first.entries[0].amount, -100);
  assert.equal(first.withdrawals.length, 1); assert.equal(first.withdrawals[0].amount, 1000);
  const second = await getIncomeHistory(owner.id, 'studio', first.nextCursor!);
  assert.equal(second.entries.length, 6); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.entries, ...second.entries].map(row => row.id)).size, 26);
  const outsiderRows = await prisma.walletTransaction.findMany({ where: { userId: outsider.id }, select: { id: true } });
  assert(!first.entries.some(row => outsiderRows.some(other => other.id === row.id)));
  assert(!JSON.stringify(first).includes('PRIVATE'));
  assert.equal((await getIncomeHistory(owner.id, 'producer_beat_sales')).entries.length, 1);
  for (const source of ['referral', 'curator', 'other', 'artist_royalty'] as const) assert.equal((await getIncomeHistory(owner.id, source)).entries.length, 0);
  // Independent commission and review ledgers never inflate the royalty wallet.
  const old = new Date(Date.now() - 30 * 86400000);
  const referral = await prisma.referral.create({ data: { userId: owner.id, referredUserId: outsider.id, referralCode: 'fixture', signupEmail: outsider.email, status: 'ACCEPTED', createdAt: old } });
  for (const [status, amount] of [['AVAILABLE', 200000], ['HELD', 50000], ['EXCLUDED', 90000]] as const) await prisma.referralCommission.create({ data: { referralId: referral.id, paymentId: status, sourceType: 'fixture', sourceId: status, category: 'fixture', paidMinor: amount, baseMinor: amount, rateBps: 10000, originalMinor: amount, netMinor: amount, status, eligibleAt: old, capturedAt: new Date(old.getTime() + 86400000) } });
  const listing = await prisma.playlistReviewListing.create({ data: { ownerId: owner.id, slug: 'income-fixture', name: 'Private curator', playlistUrl: 'https://fixture.invalid/playlist', description: 'Fixture', genres: 'Pop', feeMinor: 50000 } });
  for (const [index, payoutStatus] of ['HELD', 'FROZEN', 'PAID', 'NOT_EARNED'].entries()) await prisma.playlistReviewRequest.create({ data: { listingId: listing.id, customerId: outsider.id, requestKey: `income-${index}`, trackTitle: 'PRIVATE CUSTOMER TITLE', artistName: 'PRIVATE ARTIST', trackUrl: 'https://fixture.invalid/track', pitch: 'PRIVATE', amountMinor: 50000, termsVersion: 'fixture', status: 'SHORTLISTED', payoutStatus, reviewedAt: old } });
  const independent = await getIncomeSummary(owner.id);
  const commissions = independent.sources.find(row => row.key === 'referral')!;
  assert.equal(commissions.earned, 2500); assert.equal(commissions.available, 2000); assert.equal(commissions.held, 500);
  assert.equal(incomeWithdrawalBlock(commissions, false), null, 'Held commission must not block cleared commission');
  const reviews = independent.sources.find(row => row.key === 'curator')!;
  assert.equal(reviews.earned, 1500); assert.equal(reviews.available, 500); assert.equal(reviews.held, 500); assert.equal(reviews.paid, 500);
  assert.equal(independent.sources.find(row => row.key === 'artist_royalty')!.earned, 3100);
  assert.equal((await getIncomeHistory(owner.id, 'referral')).entries.find(row => row.status === 'EXCLUDED')!.amount, 0);
  assert.equal((await getIncomeHistory(outsider.id, 'referral')).entries.length, 0);
  const curatorHistory = await getIncomeHistory(owner.id, 'curator');
  assert.equal(curatorHistory.entries.length, 3); assert(!JSON.stringify(curatorHistory).includes('PRIVATE'));
  assert.equal((await getIncomeHistory(outsider.id, 'curator')).entries.length, 0);
  const all = incomeComposition(summary.sources, new Set(INCOME_SOURCE_KEYS));
  const onlyStudio = incomeComposition(summary.sources, new Set(['studio']));
  assert.equal(all.netTotal, 10000); assert.equal(onlyStudio.slices[0].share, .49);
  assert.equal(onlyStudio.hiddenShare, .51);
  assert.equal(incomeComposition(summary.sources, new Set()).selectedTotal, 0);
  assert(!incomeSlicePath(0, 1).includes('NaN'));
  await prisma.payoutRequest.updateMany({ where: { userId: owner.id }, data: { status: 'REJECTED' } });
  summary = await getIncomeSummary(owner.id);
  assert.equal(summary.sources.find(row => row.key === 'studio')!.available, 4900);
  assert.equal(incomeWithdrawalBlock(summary.sources.find(row => row.key === 'studio')!, false), null);
  await prisma.payoutRequest.createMany({ data: [
    { userId: owner.id, sourceType: 'studio', amount: 1000, serviceFee: 20, netAmount: 980, method: 'UPI', status: 'PAID', paidAt: new Date() },
    { userId: owner.id, sourceType: 'artist_royalty', amount: 300, serviceFee: 6, netAmount: 294, method: 'UPI', status: 'PAID', paidAt: new Date() },
    { userId: owner.id, sourceType: 'artist_royalty', amount: 200, serviceFee: 4, netAmount: 196, method: 'UPI', status: 'UNDER_REVIEW' },
  ] });
  const distribution = await getPayoutSummary(owner.id);
  assert.equal(distribution.currentMonthPaidAmount, 294);
  assert.equal(distribution.currentQuarterPaid, 294);
  assert.equal(distribution.currentQuarterPending, 200);
  assert.equal(distribution.totalEarnings, 3100);
  await prisma.payoutRequest.create({ data: { userId: owner.id, sourceType: 'mixed', amount: 100, serviceFee: 2, netAmount: 98, method: 'UPI', status: 'PAID' } });
  summary = await getIncomeSummary(owner.id);
  assert(summary.reconciliationRequired);
  assert(summary.sources.filter(row => row.route === 'wallet').every(row => row.available === 0));
  console.log('Income database checks passed: real ledger totals, reversals, holds, source separation, ownership, private-field exclusion, pagination and reconciliation locks');
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
