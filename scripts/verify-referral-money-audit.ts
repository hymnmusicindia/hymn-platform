import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { registerReferralForNewUser } from '../lib/referrals';
import { accrueReferralCommission, clearedReferralMinor, refreshReferralCommission, requestReferralPayout, reviewReferralPayout } from '../lib/referral-commissions';
import { receiveRazorpayEvent, processRazorpayEvent } from '../lib/payment-webhooks';
import { createOrder, completeCheckoutOrder } from '../lib/db';
import { acquisitionMutation } from '../lib/team/acquisition';
import { assertBeatPayoutClear } from '../lib/beat-payout-guard';
import { reconcileReferralQualifications } from '../lib/referral-reconciliation';

async function main() {
  assert.match(process.env.DATABASE_URL || '', /127\.0\.0\.1:55452\/referral_fixture(?:\?|$)/, 'Local disposable database only.');
  const start = new Date(Date.now() - 60000);
  await prisma.referralProgram.upsert({ where: { id: 1 }, create: { id: 1, effectiveAt: start }, update: { effectiveAt: start, netRevenueEffectiveAt: start, netNetworkEffectiveAt: start } });
  await prisma.referralProgram.update({ where: { id: 1 }, data: { netRevenueEffectiveAt: start, netNetworkEffectiveAt: start } });
  const failures: string[] = [];
  async function check(name: string, run: () => Promise<void>) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failures.push(name); console.error(`FAIL ${name}`, error); }
  }
  const account = (email?: string) => { const key = randomUUID(); return prisma.user.create({ data: { email: email || `${key}@fixture.invalid`, googleId: key, name: 'Financial fixture', referralCode: key.replaceAll('-', '').slice(0, 18) } }); };
  async function purchase(version: 1 | 2 | 3 = 3, netMinor = 10000000) {
    const owner = await account(), buyer = await account();
    await prisma.$transaction(tx => registerReferralForNewUser(tx, { referredUserId: buyer.id, referredEmail: buyer.email, referralCode: owner.referralCode }));
    const key = randomUUID();
    const order = await prisma.distributionOrder.create({ data: { userId: buyer.id, plan: 'one_time', amount: 100000, paymentStatus: 'paid', razorpayOrderId: `order_${key}`, razorpayPaymentId: `pay_${key}` } });
    const evidence = await prisma.acquisitionRevenueEvidence.create({ data: { sourceType: 'distribution_order', sourceId: String(order.id), customerId: buyer.id, paymentId: order.razorpayPaymentId!, recognisedRevenueMinor: 10000000, eligibleNetRevenueMinor: netMinor, status: 'RECONCILED', reviewedAt: new Date() } });
    await prisma.$transaction(tx => accrueReferralCommission(tx, 'distribution_order', order.id));
    await prisma.referralCommission.updateMany({ where: { paymentId: order.razorpayPaymentId! }, data: { policyVersion: version, eligibleAt: new Date(Date.now() - 1000) } });
    await prisma.$transaction(tx => refreshReferralCommission(tx, order.razorpayPaymentId!));
    return { owner, buyer, order, evidence, paymentId: order.razorpayPaymentId! };
  }
  async function event(paymentId: string, type: string, amount: number | null, refundId: string) {
    const key = randomUUID();
    await prisma.paymentWebhookEvent.create({ data: { providerEventId: key, payloadHash: key, paymentId, eventType: type, amountMinor: amount, signatureValid: true, processingState: 'processed', payloadRedacted: { entity: { id: refundId } } } });
    await prisma.$transaction(tx => refreshReferralCommission(tx, paymentId));
  }
  const cleared = (id: number) => prisma.$transaction(tx => clearedReferralMinor(tx, id));
  const credential = (userId: number) => prisma.payoutCredential.create({ data: { userId, method: 'UPI', status: 'verified', legalName: 'Fixture only', upiIdMasked: 'fi***@fixture', upiIdEncrypted: 'fixture-encrypted' } });
  await check('reconciled earnings cannot be withdrawn after evidence is put on hold', async () => {
    const p = await purchase(); assert.equal(await cleared(p.owner.id), 200000);
    await prisma.acquisitionRevenueEvidence.update({ where: { id: p.evidence.id }, data: { status: 'ADJUSTMENT_REQUIRED' } });
    assert.equal(await cleared(p.owner.id), 0);
    await credential(p.owner.id); await assert.rejects(requestReferralPayout(p.owner.id), /At least/);
  });
  await check('withdrawal minimum and hold date are exact, with no rounding into eligibility', async () => {
    const below = await purchase(3, 7499950); await credential(below.owner.id);
    assert.equal(await cleared(below.owner.id), 149999);
    await assert.rejects(requestReferralPayout(below.owner.id), /At least/);
    const exact = await purchase(3, 7500000); await credential(exact.owner.id);
    await prisma.referralCommission.updateMany({ where: { paymentId: exact.paymentId }, data: { eligibleAt: new Date(Date.now() + 60000), status: 'AVAILABLE' } });
    assert.equal(await cleared(exact.owner.id), 0, 'A cached status must not bypass the hold timestamp.');
    await prisma.referralCommission.updateMany({ where: { paymentId: exact.paymentId }, data: { eligibleAt: new Date(Date.now() - 1000) } });
    const payout = await requestReferralPayout(exact.owner.id); assert.equal(payout.amount, 1500);
    await reviewReferralPayout(payout.id, null, { action: 'reject', note: 'Fixture releases threshold reservation' });
  });
  await check('changed net evidence cannot spend stale commission before refresh', async () => {
    const p = await purchase();
    await prisma.acquisitionRevenueEvidence.update({ where: { id: p.evidence.id }, data: { eligibleNetRevenueMinor: 10000 } });
    assert.equal(await cleared(p.owner.id), 0);
    await prisma.$transaction(tx => refreshReferralCommission(tx, p.paymentId)); assert.equal(await cleared(p.owner.id), 200);
  });
  await check('failed refunds release holds and delayed creation events cannot reopen them', async () => {
    const p = await purchase(1); const ref = randomUUID();
    await event(p.paymentId, 'refund.created', 1000000, ref); assert.equal(await cleared(p.owner.id), 0);
    await event(p.paymentId, 'refund.failed', 1000000, ref); assert.equal(await cleared(p.owner.id), 200000);
    await event(p.paymentId, 'refund.created', 1000000, ref); assert.equal(await cleared(p.owner.id), 200000);
  });
  await check('full refunds reverse direct-only net-policy commissions too', async () => {
    const p = await purchase(2);
    await event(p.paymentId, 'refund.processed', 10000000, randomUUID());
    const row = await prisma.referralCommission.findFirstOrThrow({ where: { paymentId: p.paymentId } });
    assert.equal(row.netMinor, 0); assert.equal(row.status, 'REVERSED');
  });
  await check('a verified refund cannot be cleared with stale net evidence', async () => {
    const p = await purchase();
    await event(p.paymentId, 'refund.processed', 1000000, randomUUID());
    assert.equal(await cleared(p.owner.id), 0, 'Evidence must account for the processed refund before money clears.');
  });
  await check('delayed dispute openings cannot undo a terminal provider outcome', async () => {
    const p = await purchase(), disputeId = randomUUID();
    for (const type of ['payment.dispute.created', 'payment.dispute.won', 'payment.dispute.created']) {
      const payload = { id: randomUUID(), event: type, payload: { dispute: { entity: { id: disputeId, payment_id: p.paymentId, amount: 10000000, currency: 'INR' } } } };
      const stored = await receiveRazorpayEvent(Buffer.from(JSON.stringify(payload)), payload); await processRazorpayEvent(stored.id);
    }
    assert.equal((await prisma.distributionOrder.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus, 'paid');
    const unresolved = { id: randomUUID(), event: 'payment.dispute.created', payload: { dispute: { entity: { id: randomUUID(), payment_id: p.paymentId, amount: 10000000, currency: 'INR' } } } };
    const stored = await receiveRazorpayEvent(Buffer.from(JSON.stringify(unresolved)), unresolved); await processRazorpayEvent(stored.id);
    assert.equal((await prisma.distributionOrder.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus, 'disputed');
    assert.equal(await cleared(p.owner.id), 0);
  });
  await check('Gmail aliases cannot create self-referral rewards', async () => {
    const prefix = randomUUID().replaceAll('-', '');
    const owner = await account(`${prefix}@gmail.com`), alias = await account(`${prefix}+music@googlemail.com`);
    await assert.rejects(prisma.$transaction(tx => registerReferralForNewUser(tx, { referredUserId: alias.id, referredEmail: alias.email, referralCode: owner.referralCode })), /own referral/);
    assert.equal(await prisma.referral.count({ where: { referredUserId: alias.id } }), 0);
  });
  await check('unreconciled payments cannot starve later eligible payments in batch recovery', async () => {
    const p = await purchase(), key = randomUUID();
    await prisma.distributionOrder.createMany({ data: Array.from({ length: 101 }, (_, n) => ({ userId: p.buyer.id, plan: 'one_time', amount: 100, razorpayOrderId: `order_${key}_${n}`, razorpayPaymentId: `pay_${key}_${n}`, paymentStatus: 'paid' })) });
    const orders = await prisma.distributionOrder.findMany({ where: { razorpayOrderId: { startsWith: `order_${key}_` } }, orderBy: { id: 'asc' } });
    await prisma.acquisitionRevenueEvidence.createMany({ data: orders.map((order, n) => ({ sourceType: 'distribution_order', sourceId: String(order.id), customerId: p.buyer.id, paymentId: order.razorpayPaymentId!, recognisedRevenueMinor: 10000, eligibleNetRevenueMinor: n === 100 ? 10000 : null, status: n === 100 ? 'RECONCILED' : 'RECONCILIATION_REQUIRED' })) });
    await reconcileReferralQualifications(Date.now() + 20000);
    assert.equal(await prisma.referralCommission.count({ where: { paymentId: orders[100].razorpayPaymentId! } }), 1);
    assert.equal(await prisma.referralCommission.count({ where: { paymentId: { in: orders.slice(0, 100).map(order => order.razorpayPaymentId!) } } }), 0, 'Waiting for evidence must never produce a gross-based reward.');
  });
  await check('payment collection recovers a failed refund and recognises cumulative full refunds', async () => {
    const p = await purchase();
    async function observe(type: string, refund: string, amount: number) {
      const payload = { id: randomUUID(), event: type, payload: { refund: { entity: { id: refund, payment_id: p.paymentId, amount, currency: 'INR' } } } };
      const stored = await receiveRazorpayEvent(Buffer.from(JSON.stringify(payload)), payload); await processRazorpayEvent(stored.id);
    }
    const failed = randomUUID(); await observe('refund.created', failed, 1000); await observe('refund.failed', failed, 1000);
    assert.equal((await prisma.distributionOrder.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus, 'paid');
    await observe('refund.created', failed, 1000);
    assert.equal((await prisma.distributionOrder.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus, 'paid');
    const half = randomUUID(); await observe('refund.processed', half, 5000000); await observe('refund.processed', half, 5000000);
    assert.equal((await prisma.distributionOrder.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus, 'partial_refund_review');
    await observe('refund.processed', randomUUID(), 5000000);
    assert.equal((await prisma.distributionOrder.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus, 'refunded');
    assert.equal(await cleared(p.owner.id), 0);
  });
  await check('partially refunded payments can reconcile their retained net revenue', async () => {
    const p = await purchase(); const admin = await account();
    const workspace = await prisma.teamWorkspace.create({ data: { name: `Money audit ${randomUUID()}` } });
    const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Financial fixture admin', owner: true, permissions: ['acquisition.admin'] } });
    const member = await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: admin.id, roleId: role.id }, include: { role: true } });
    const refundId = randomUUID();
    async function observe(type: string) {
      const payload = { id: randomUUID(), event: type, payload: { refund: { entity: { id: refundId, payment_id: p.paymentId, amount: 1000000, currency: 'INR' } } } };
      const stored = await receiveRazorpayEvent(Buffer.from(JSON.stringify(payload)), payload); await processRazorpayEvent(stored.id);
    }
    await observe('refund.processed');
    await prisma.$transaction(tx => acquisitionMutation(tx, member, 'acquisition-evidence-review', { id: p.evidence.id, applicableTaxesMinor: 0, refundsChargebacksMinor: 1000000, directPassThroughCostsMinor: 0, providerFeeMinor: 0, taxEvidence: ['fixture credit note'], costEvidence: ['fixture settlement'], adjustmentReference: randomUUID(), reason: 'Fixture verified partial refund and retained revenue' }));
    assert.equal(await cleared(p.owner.id), 180000);
    await observe('refund.processed'); await observe('refund.created');
    assert.equal((await prisma.acquisitionRevenueEvidence.findUniqueOrThrow({ where: { id: p.evidence.id } })).status, 'RECONCILED', 'Duplicate and delayed refund events cannot reopen a settled reconciliation.');
    assert.equal(await cleared(p.owner.id), 180000);
  });
  await check('cumulative full beat refunds revoke access and reverse seller credit once', async () => {
    const seller = await account(), buyer = await account(), key = randomUUID();
    const upload = await prisma.upload.create({ data: { userId: seller.id, kind: 'AUDIO', storageKey: `fixture/${key}`, fileName: 'beat.mp3', mimeType: 'audio/mpeg', sizeBytes: 1 } });
    const beat = await prisma.beat.create({ data: { userId: seller.id, title: 'Refund fixture', bpm: 100, genre: 'test', mood: 'test', keySignature: 'C', priceCents: 10000, generalPriceCents: 10000, status: 'PUBLISHED', audioUploadId: upload.id } });
    const order = await createOrder({ userId: buyer.id, productId: 'beatstore', originalPrice: 100, finalAmount: 100, amount: 100, paymentStatus: 'created', razorpayOrderId: `order_${key}`, items: [{ beatId: beat.id, licenseType: 'general', price: 100 }] });
    await completeCheckoutOrder(order!.razorpayOrderId, `pay_${key}`);
    for (let n = 0; n < 3; n++) {
      const payload = { id: randomUUID(), event: 'refund.processed', payload: { refund: { entity: { id: `rfnd_${key}_${Math.min(n, 1)}`, payment_id: `pay_${key}`, amount: 5000, currency: 'INR' } } } };
      const stored = await receiveRazorpayEvent(Buffer.from(JSON.stringify(payload)), payload); await processRazorpayEvent(stored.id);
      if (n === 0) await assert.rejects(prisma.$transaction(tx => assertBeatPayoutClear(tx, seller.id)), /refund or dispute review/);
    }
    assert.equal((await prisma.checkoutOrder.findUniqueOrThrow({ where: { id: order!.id } })).paymentStatus, 'refunded');
    assert.equal((await prisma.beatPurchase.findFirstOrThrow({ where: { paymentId: `pay_${key}` } })).hasAccess, false);
    const sale = await prisma.beatSale.findFirstOrThrow({ where: { orderId: order!.id } });
    assert.equal(await prisma.walletTransaction.count({ where: { idempotencyKey: `beat-sale:${sale.id}:reversal:refunded` } }), 1);
    assert.equal(Number((await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: seller.id } })).availableBalance), 0);
    await prisma.$transaction(tx => assertBeatPayoutClear(tx, seller.id));
  });
  await check('payout reservation, duplicate review, unique bank reference and refund recovery', async () => {
    const p = await purchase(); await credential(p.owner.id);
    const requests = await Promise.allSettled([requestReferralPayout(p.owner.id), requestReferralPayout(p.owner.id)]);
    assert.equal(requests.filter(r => r.status === 'fulfilled').length, 1);
    const request = (requests.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<{ id: number }>).value;
    const reference = randomUUID();
    const reviews = await Promise.allSettled([reviewReferralPayout(request.id, null, { action: 'paid', note: 'Fixture bank record', reference }), reviewReferralPayout(request.id, null, { action: 'paid', note: 'Fixture duplicate', reference })]);
    assert.equal(reviews.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(await prisma.referralCommissionPayout.count({ where: { userId: p.owner.id, status: 'PAID' } }), 1);
    const other = await purchase(); await credential(other.owner.id); const second = await requestReferralPayout(other.owner.id);
    await assert.rejects(reviewReferralPayout(second.id, null, { action: 'paid', note: 'Fixture duplicate bank reference', reference }));
    assert.equal((await prisma.referralCommissionPayout.findUniqueOrThrow({ where: { id: second.id } })).status, 'REQUESTED');
    await event(other.paymentId, 'refund.processed', 10000000, randomUUID());
    await assert.rejects(reviewReferralPayout(second.id, null, { action: 'paid', note: 'Fixture stale reservation', reference: randomUUID() }), /Refunds or holds/);
    await reviewReferralPayout(second.id, null, { action: 'reject', note: 'Fixture refund changed balance' });
    await event(p.paymentId, 'payment.dispute.lost', 10000000, randomUUID());
    await assert.rejects(requestReferralPayout(p.owner.id), /At least/);
  });
  assert.deepEqual(failures, [], 'Financial edge-case regressions must all pass.');
  console.log('PASS referral money audit. Disposable records only; no real charges, transfers or email.');
}
main().finally(() => prisma.$disconnect());
