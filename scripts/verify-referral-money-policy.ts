import assert from 'node:assert/strict';
import { paymentRefundState, paymentDisputeState } from '../lib/payment-refund-state';
import { commissionMinor, remainingCommissionMinor, netReferralAmounts, REFERRAL_NET_NETWORK_RATES_BPS } from '../lib/referral-commission-policy';
const refund = (eventType: string, id: string, amountMinor: number | null) => ({ eventType, amountMinor, payloadRedacted: { entity: { id } } });
function permutations<T>(values: T[]): T[][] { return values.length ? values.flatMap((v, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [v, ...rest])) : [[]]; }
for (const events of permutations([refund('refund.created', 'a', 500), refund('refund.failed', 'a', 500), refund('refund.processed', 'b', 200), refund('refund.processed', 'b', 200)])) {
  const state = paymentRefundState(events); assert.equal(state.totalMinor, 200); assert.equal(state.pending.size, 0); assert.equal(state.unknown, false);
}
for (const events of permutations([refund('refund.failed', 'a', 500), refund('refund.processed', 'a', 500), refund('refund.created', 'a', 500)])) {
  const state = paymentRefundState(events); assert.equal(state.totalMinor, 500); assert.equal(state.pending.size, 0);
}
for (const invalid of [refund('refund.processed', '', 1), refund('refund.processed', 'a', null), refund('refund.processed', 'a', -1), refund('refund.processed', 'a', 0.5)]) assert.equal(paymentRefundState([invalid]).unknown, true);
assert.equal(paymentDisputeState([refund('payment.dispute.won', 'old', 10), refund('payment.dispute.created', 'new', 10)]), 'payment.dispute.created', 'A prior resolved dispute cannot clear a different open dispute.');
for (const events of permutations([refund('payment.dispute.created', 'a', 10), refund('payment.dispute.won', 'a', 10)])) assert.equal(paymentDisputeState(events), 'payment.dispute.won');
for (const events of permutations([refund('payment.dispute.won', 'a', 10), refund('payment.dispute.lost', 'a', 10)])) assert.equal(paymentDisputeState(events), 'payment.dispute.lost');
for (const invalid of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => remainingCommissionMinor(invalid, 100, 0));
  assert.throws(() => remainingCommissionMinor(100, invalid, 0));
  assert.throws(() => remainingCommissionMinor(100, 100, invalid));
  assert.throws(() => netReferralAmounts(invalid, 0, 200, REFERRAL_NET_NETWORK_RATES_BPS));
}
assert.equal(remainingCommissionMinor(100, 0, 0), 0); assert.equal(remainingCommissionMinor(100, 1000, 1001), 0);
for (let base = 0; base <= 1000000; base += 17) {
  const allocations = netReferralAmounts(base, base, 200, REFERRAL_NET_NETWORK_RATES_BPS);
  assert.equal(allocations[0], commissionMinor(base, 200));
  assert.ok(allocations.every(n => Number.isSafeInteger(n) && n >= 0));
  assert.ok(allocations.reduce((sum, n) => sum + n, 0) <= commissionMinor(base, 270));
  assert.ok(remainingCommissionMinor(allocations[0], base || 1, Math.floor(base / 2)) <= allocations[0]);
}
console.log('PASS financial policy: 58,824 rounding/cap scenarios, refund event permutations, duplicate IDs, terminal precedence, malformed events and invalid money inputs.');
