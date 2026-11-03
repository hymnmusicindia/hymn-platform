import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { registerReferralForNewUser } from '../lib/referrals';
import { accrueReferralCommission, clearedReferralMinor, refreshReferralCommission } from '../lib/referral-commissions';
async function main() {
  assert.match(process.env.DATABASE_URL || '', /127\.0\.0\.1:55452\/referral_fixture/, 'Isolated fixture only.');
  const start = new Date(Date.now() - 60000);
  await prisma.referralProgram.update({ where: { id: 1 }, data: { netRevenueEffectiveAt: start, netNetworkEffectiveAt: start } });
  const chain: User[] = [];
  for (let n = 0; n < 9; n++) {
    const key = randomUUID(); const user = await prisma.user.create({ data: { name: `Net network ${n}`, email: `${key}@fixture.invalid`, googleId: key, referralCode: key.replaceAll('-', '').slice(0, 18) } });
    if (n) await prisma.$transaction(tx => registerReferralForNewUser(tx, { referredUserId: user.id, referredEmail: user.email, referralCode: chain[n - 1].referralCode }));
    chain.push(user);
  }
  const buyer = chain[8];
  async function purchase(key: string) {
    const order = await prisma.distributionOrder.create({ data: { userId: buyer.id, plan: 'one_time', amount: 1000, razorpayOrderId: `order_${key}`, razorpayPaymentId: `pay_${key}`, paymentStatus: 'paid' } });
    await prisma.acquisitionRevenueEvidence.create({ data: { sourceType: 'distribution_order', sourceId: String(order.id), customerId: buyer.id, paymentId: `pay_${key}`, recognisedRevenueMinor: 100000, eligibleNetRevenueMinor: 50000, status: 'RECONCILED', reviewedAt: new Date() } });
    return order;
  }
  const order = await purchase('net_network_fixture');
  await prisma.$transaction(tx => accrueReferralCommission(tx, 'distribution_order', order.id));
  await prisma.$transaction(tx => accrueReferralCommission(tx, 'distribution_order', order.id));
  let rows = await prisma.referralCommission.findMany({ where: { paymentId: order.razorpayPaymentId! }, orderBy: { level: 'asc' } });
  assert.equal(rows.length, 7); assert.deepEqual(rows.map(r => r.netMinor), [1000, 100, 50, 50, 50, 50, 50]);
  assert.ok(rows.every(r => r.policyVersion === 3)); assert.equal(rows.reduce((n, r) => n + r.netMinor, 0), 1350, 'Total is 2.7% of verified net, not gross spend.');
  assert.deepEqual(rows.map(r => r.rateBps), [200, 1000, 500, 500, 500, 500, 500]);
  await prisma.referralCommission.updateMany({ where: { paymentId: order.razorpayPaymentId! }, data: { eligibleAt: new Date(Date.now() - 1000) } });
  await prisma.$transaction(tx => refreshReferralCommission(tx, order.razorpayPaymentId!));
  assert.equal(await prisma.$transaction(tx => clearedReferralMinor(tx, chain[1].id)), 50);
  await prisma.user.update({ where: { id: chain[4].id }, data: { status: 'SUSPENDED' } });
  assert.equal(await prisma.$transaction(tx => clearedReferralMinor(tx, chain[1].id)), 0, 'An inactive middle node cannot be bypassed.');
  await prisma.user.update({ where: { id: chain[4].id }, data: { status: 'ACTIVE' } });
  await prisma.acquisitionRevenueEvidence.update({ where: { paymentId: order.razorpayPaymentId! }, data: { status: 'ADJUSTMENT_REQUIRED' } });
  await prisma.$transaction(tx => refreshReferralCommission(tx, order.razorpayPaymentId!));
  rows = await prisma.referralCommission.findMany({ where: { paymentId: order.razorpayPaymentId! } }); assert.ok(rows.every(r => r.status === 'HELD'));
  await prisma.acquisitionRevenueEvidence.update({ where: { paymentId: order.razorpayPaymentId! }, data: { eligibleNetRevenueMinor: 25000, status: 'RECONCILED' } });
  await prisma.$transaction(tx => refreshReferralCommission(tx, order.razorpayPaymentId!));
  rows = await prisma.referralCommission.findMany({ where: { paymentId: order.razorpayPaymentId! }, orderBy: { level: 'asc' } }); assert.deepEqual(rows.map(r => r.netMinor), [500, 50, 25, 25, 25, 25, 25]);
  assert.ok((await prisma.referralCommissionAdjustment.count({ where: { commissionId: { in: rows.map(r => r.id) } } })) >= 7);
  await prisma.paymentWebhookEvent.create({ data: { providerEventId: 'net_full_refund', payloadHash: 'net_full_refund_fixture', eventType: 'refund.processed', paymentId: order.razorpayPaymentId, signatureValid: true, amountMinor: 100000, payloadRedacted: { entity: { id: 'rfnd_net_full' } }, processingState: 'processed' } });
  await prisma.$transaction(tx => refreshReferralCommission(tx, order.razorpayPaymentId!));
  rows = await prisma.referralCommission.findMany({ where: { paymentId: order.razorpayPaymentId! } }); assert.ok(rows.every(r => r.netMinor === 0 && r.status === 'REVERSED'), 'A full refund cannot leave network rewards payable.');
  // A future activation does not retrofit an already-captured net-policy payment.
  await prisma.referralProgram.update({ where: { id: 1 }, data: { netNetworkEffectiveAt: new Date(Date.now() + 60000) } });
  const earlier = await purchase('net_network_before_activation'); await prisma.$transaction(tx => accrueReferralCommission(tx, 'distribution_order', earlier.id));
  rows = await prisma.referralCommission.findMany({ where: { paymentId: earlier.razorpayPaymentId! } }); assert.equal(rows.length, 1); assert.equal(rows[0].policyVersion, 2); assert.equal(rows[0].netMinor, 1000);
  await prisma.referralProgram.update({ where: { id: 1 }, data: { netNetworkEffectiveAt: start } });
  await prisma.$transaction(tx => accrueReferralCommission(tx, 'distribution_order', earlier.id)); assert.equal(await prisma.referralCommission.count({ where: { paymentId: earlier.razorpayPaymentId! } }), 1, 'Replays cannot retrofit a frozen direct-only allocation.');
  console.log('PASS net-network financial integration: prospective activation, seven frozen levels, 2.7% cap, replay, whole-path withdrawal, reconciliation holds, proportional adjustments and full refunds. No real customer, mail or gateway used.');
}
main().finally(() => prisma.$disconnect());
