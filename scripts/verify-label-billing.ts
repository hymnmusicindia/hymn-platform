import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
async function main() {
  const versions: any[] = [], audits: any[] = [], subscriptions: any[] = [];
  const plans = new Map<string, any>(), mandates = new Map<string, any>(); let planCreates = 0, mandateCreates = 0;
  const db: any = {
    $transaction: async (fn: any) => fn(db), $queryRaw: async () => [],
    subscriptionPlanVersion: {
      findFirst: async ({ where }: any) => versions.find(v => v.product === where.product && v.amount === where.amount),
      create: async ({ data }: any) => { const row = { id: versions.length + 1, ...data }; versions.push(row); return row; }
    },
    subscription: {
      findUnique: async ({ where }: any) => subscriptions.find(s => s.userId === where.userId),
      upsert: async ({ where, create, update }: any) => { let s = subscriptions.find(s => s.userId === where.userId); if (s) Object.assign(s, update); else { s = { id: subscriptions.length + 1, ...create }; subscriptions.push(s); } return s; }
    },
    auditLog: { findFirst: async ({ where }: any) => audits.find(a => (!where.requestId || a.requestId === where.requestId) && (!where.entity || a.entity === where.entity) && (!where.entityId || a.entityId === where.entityId) && (typeof where.action === 'string' ? a.action === where.action : where.action.in.includes(a.action))), create: async ({ data }: any) => { audits.push(data); return data; } }
  };
  const gateway = {
    plans: { create: async (input: any) => { planCreates++; const row = { id: `plan_fixture_${planCreates}`, ...input }; plans.set(row.id, row); return row; }, fetch: async (id: string) => plans.get(id) },
    subscriptions: { create: async (input: any) => { mandateCreates++; const row = { id: `sub_fixture_${mandateCreates}`, status: 'created', ...input }; mandates.set(row.id, row); return row; }, fetch: async (id: string) => mandates.get(id) }
  };
  (globalThis as any).__labelDb = db; (globalThis as any).__labelGateway = gateway;
  mkdirSync('.cache', { recursive: true });
  await build({ entryPoints: ['lib/subscription-billing.ts'], outfile: '.cache/label-billing-test.cjs', bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'isolated-label-billing', setup(b) {
    b.onResolve({ filter: /^(server-only|@\/lib\/(prisma|razorpay|growth|growth-partners|referral-reward-policy|acquisition-revenue)|\.\/email\/subscription-receipts)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'server-only' ? '' : a.path.endsWith('/prisma') ? 'export const prisma=globalThis.__labelDb;' : a.path.endsWith('/razorpay') ? 'export const razorpay=globalThis.__labelGateway;' : 'export const queueSubscriptionReceipt=()=>{};export const qualifyRecurringReferral=()=>{};export const qualifyPartnerPayment=()=>{};export const recordGrowthEvent=()=>{};export const recordVerifiedAcquisitionRevenue=()=>{};', loader: 'js' }));
  } }] });
  const { createProviderSubscription: create } = createRequire(import.meta.url)(resolve('.cache/label-billing-test.cjs'));
  const first = await create(1, 'yearly_plus', 1);
  assert.equal(first.version.amount, 224900); assert.equal(first.local.artistLimit, 16);
  const variant = plans.get(first.version.razorpayPlanId); assert.equal(variant.period, 'monthly'); assert.equal(variant.interval, 12); assert.equal(variant.item.currency, 'INR'); assert.equal(variant.notes.hymn_extra_artists, '1');
  assert.equal((await create(1, 'yearly_plus', 1)).provider.id, first.provider.id); assert.equal(planCreates, 1); assert.equal(mandateCreates, 1);
  const eight = await create(2, 'yearly_plus', 8); assert.equal(eight.version.amount, 389900); assert.equal(eight.local.artistLimit, 23);
  const count = mandateCreates;
  await assert.rejects(create(1, 'yearly_plus', 8), /active or pending/); assert.equal(mandateCreates, count);
  for (const bad of [-1, .5, 501, NaN]) await assert.rejects(create(3, 'yearly_plus', bad));
  await assert.rejects(create(3, 'yearly', 1), /require Yearly/);
  variant.item.amount = 1; await assert.rejects(create(3, 'yearly_plus', 1), /expected/); assert.equal(mandateCreates, count);
  console.log('Annual extra-slot provider pricing, 12-month cadence, discount, persisted capacity, pending checkout reuse, duplicate mandate prevention and invalid/tampered pricing passed. No gateway or database calls.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
