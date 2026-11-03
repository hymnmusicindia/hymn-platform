import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PDFDocument } from 'pdf-lib';
import { labelArtistQuote, labelExtrasForAmount } from '../lib/label-artist-pricing';

async function main() {
  for (const [n, addon, discount] of [[0, 0, 0], [1, 25000, 0], [7, 175000, 0], [8, 190000, 10000], [500, 11875000, 625000]]) {
    const q = labelArtistQuote(n); assert.equal(q.addon, addon); assert.equal(q.discount, discount); assert.equal(q.total, 199900 + addon); assert.equal(labelExtrasForAmount(q.total), n);
  }
  for (const bad of [-1, .5, NaN, Infinity, 501, Number.MAX_SAFE_INTEGER]) assert.throws(() => labelArtistQuote(bad));
  assert.throws(() => labelExtrasForAmount(199901));
  mkdirSync('.cache', { recursive: true });
  await build({ entryPoints: ['lib/email/subscription-receipts.ts', 'lib/subscription-artist-slots.ts'], outdir: '.cache/label-tests', bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'isolated-label', setup(b) {
    b.onResolve({ filter: /^(server-only|@\/lib\/prisma|\.\/email-client|\.\/email-templates)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'server-only' ? '' : args.path.endsWith('/prisma') ? 'export const prisma={};' : args.path.endsWith('email-client') ? "export const getEmailConfig=()=>({enabled:true,from:'HYMN <test@fixture.invalid>',appUrl:'https://fixture.invalid'});export const getEmailClient=()=>{throw Error('Real SMTP prohibited')};" : 'export const emailLayout=x=>x.body;export const emailText=x=>x.body;', loader: 'js' }));
  } }] });
  const require = createRequire(import.meta.url);
  const { queueSubscriptionReceipt, deliverSubscriptionReceipts, receiptAttachment } = require(resolve('.cache/label-tests/email/subscription-receipts.js'));
  const { subscriptionArtistCapacity } = require(resolve('.cache/label-tests/subscription-artist-slots.js'));
  const now = new Date();
  const payment: any = { id: 22, subscriptionId: 11, status: 'captured', amount: 199900, currency: 'INR', razorpayPaymentId: 'pay_fixture', planSnapshot: 'yearly_plus', createdAt: now, billingPeriodStart: now, billingPeriodEnd: new Date(now.getTime() + 365 * 86400000), subscription: { id: 11, userId: 77, plan: 'yearly_plus', planName: 'Yearly+ / Label', user: { email: 'customer@fixture.invalid' }, planVersion: { amount: 199900, product: 'yearly_plus' } } };
  const grants: any[] = [{ metadata: { slots: 4 } }, { metadata: { slots: 1, paidMinor: 25000, receiptPaymentId: 22, reference: 'OFFLINE-FIXTURE', validUntil: new Date(now.getTime() + 365 * 86400000).toISOString() } }];
  const rows: any[] = [];
  const matches = (r: any, w: any) => (!w.id || r.id === w.id) && (!w.eventKey || r.eventKey === w.eventKey) && (!w.status || r.status === w.status) && (!w.template || r.template === w.template) && (!w.payload || r.payload.claimedAt < w.payload.lt);
  const db: any = {
    subscriptionPayment: { findUniqueOrThrow: async () => payment, findUnique: async () => payment },
    subscriptionPlanVersion: { findUnique: async () => payment.subscription.planVersion },
    auditLog: { findMany: async () => grants },
    emailLog: {
      findUnique: async ({ where }: any) => rows.find(r => matches(r, where)) || null,
      findMany: async ({ where }: any) => rows.filter(r => matches(r, where)).map(r => ({ ...r })),
      upsert: async ({ where, create }: any) => { let r = rows.find(r => matches(r, where)); if (!r) { r = { id: rows.length + 1, retryCount: 0, ...create }; rows.push(r); } return r; },
      updateMany: async ({ where, data }: any) => { let count = 0; for (const r of rows) if (matches(r, where)) { Object.assign(r, data); count++; } return { count }; },
      update: async ({ where, data }: any) => { const r = rows.find(r => matches(r, where)); assert.ok(r); Object.assign(r, data); return r; }
    }
  };
  const job = await queueSubscriptionReceipt(payment.id, db);
  assert.equal(job.payload.total, 224900); assert.equal(job.payload.gatewayPaid, 199900); assert.equal(job.payload.offlinePaid, 25000); assert.equal(job.payload.artists, 20); assert.equal(job.payload.freeArtists, 4);
  assert.equal((await queueSubscriptionReceipt(payment.id, db)).id, job.id); assert.equal(rows.length, 1);
  const attachment = await receiptAttachment(job.payload); assert.equal((await PDFDocument.load(attachment.content)).getPageCount(), 1);
  writeFileSync('.cache/label-tests/receipt-preview.pdf', attachment.content);
  await assert.rejects(receiptAttachment({ ...job.payload, sha256: '0'.repeat(64) }));
  await assert.rejects(receiptAttachment({ ...job.payload, total: 1 }));
  assert.equal(await subscriptionArtistCapacity({ id: 11, plan: 'yearly_plus', planVersionId: 1 }, now, db), 20);
  assert.equal(await subscriptionArtistCapacity({ id: 11, plan: 'yearly_plus', planVersionId: 1 }, new Date(now.getTime() + 366 * 86400000), db), 19);
  assert.equal(await subscriptionArtistCapacity({ id: 11, plan: 'yearly', planVersionId: 1 }, now, db), 7);
  let sends = 0; const send = async (input: any) => { assert.equal(input.attachments[0].contentType, 'application/pdf'); sends++; return { data: { id: 'smtp-fixture' }, error: null }; };
  await Promise.all([deliverSubscriptionReceipts(job.id, send, db, now), deliverSubscriptionReceipts(job.id, send, db, now)]);
  assert.equal(sends, 1); assert.equal(job.status, 'sent');
  job.status = 'pending'; payment.subscription.user.email = 'changed@fixture.invalid';
  await deliverSubscriptionReceipts(job.id, send, db, now); assert.equal(job.status, 'review'); assert.equal(sends, 1);
  payment.subscription.user.email = 'customer@fixture.invalid'; job.status = 'pending';
  await deliverSubscriptionReceipts(job.id, async () => { throw Object.assign(Error('no connection'), { code: 'ECONNREFUSED' }); }, db, now); assert.equal(job.status, 'pending'); assert.equal(job.retryCount, 1);
  await deliverSubscriptionReceipts(job.id, send, db, now); assert.equal(sends, 1, 'backoff must prevent immediate retries');
  job.payload.nextAttemptAt = undefined;
  await deliverSubscriptionReceipts(job.id, async () => { throw Error('uncertain outcome'); }, db, now); assert.equal(job.status, 'review');
  payment.status = 'failed'; rows.length = 0; assert.equal(await queueSubscriptionReceipt(payment.id, db), null);
  payment.status = 'captured'; payment.amount = 199901; await assert.rejects(queueSubscriptionReceipt(payment.id, db));
  console.log('Label pricing boundaries, discount threshold, verified capacity, expiring offline slots, receipt reconciliation, PDF integrity, duplicate sends, recipient changes, backoff and uncertain SMTP outcomes passed. No real mail or payments.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
