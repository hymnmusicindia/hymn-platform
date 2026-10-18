import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync(".cache", { recursive: true });
  await build({ entryPoints: ["lib/payment-reconciliation.ts"], outfile: ".cache/payment-reconciliation-boundaries.cjs", bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "reconciliation-fixture", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/(db|prisma|task-queue|audit-log|beat-license|payment-webhooks|studio-payment-recovery)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      exports.listAllOrders=async()=>[];
      exports.recoverStudioPayments=async()=>({ issues: [] });
      exports.prisma=globalThis.reconciliationFixture;
      exports.createAdminTaskOnce=async task=>globalThis.reconciliationTasks.push(task);
      exports.resolveAdminTask=exports.logAuditEvent=exports.confirmDistributionPayment=exports.confirmCheckoutPayment=async()=>{};
      exports.generateBeatLicense=()=>{throw new Error('No beat fulfilment expected')};
    ` }));
  } }] });
  const globalState = globalThis as any;
  globalState.reconciliationTasks = [];
  globalState.reconciliationFixture = {
    distributionOrder: { findMany: async () => [
      { id: 1, userId: 18, plan: "one_time", amount: 499, creditsUsed: 0, releaseId: null, razorpayOrderId: "order_missing_release", razorpayPaymentId: "pay_1" },
      { id: 2, userId: 18, plan: "half_yearly", amount: 0, creditsUsed: 0, releaseId: 42, razorpayOrderId: "sub_entitlement_18_1", razorpayPaymentId: "entitlement" },
      { id: 3, userId: 18, plan: "half_yearly", amount: 999, creditsUsed: 0, releaseId: 42, razorpayOrderId: "order_legacy", razorpayPaymentId: "pay_3" },
      // Plan-covered: nothing charged, linked release later archived (no paid release).
      { id: 4, userId: 18, plan: "half_yearly", amount: 0, creditsUsed: 0, releaseId: 77, razorpayOrderId: "sub_entitlement_18_4", razorpayPaymentId: "subscription_4" },
      // Paid entirely with credits: still value received, so still checked.
      { id: 5, userId: 18, plan: "one_time", amount: 0, creditsUsed: 499, releaseId: 77, razorpayOrderId: "order_credits", razorpayPaymentId: null }
    ] },
    release: { findFirst: async (query: any) => query.where.id === 42 ? { id: 42 } : typeof query.where.id !== "number" ? { id: 99 } : null },
    subscription: { findFirst: async () => null, upsert: async () => { throw new Error("Release orders must never grant recurring subscriptions"); } }
  };
  const modulePath = "../.cache/payment-reconciliation-boundaries.cjs";
  const { reconcilePayments } = await import(modulePath);
  const result = await reconcilePayments();
  assert.equal(result.issues.length, 3);
  assert(result.issues.some((issue: any) => issue.key === "payment:distribution:1"), "An unrelated paid release cannot hide an unfulfilled order");
  assert(result.issues.some((issue: any) => issue.key === "payment:subscription:3" && !issue.autoRepaired), "Legacy recurring access needs provider evidence");
  assert(!result.issues.some((issue: any) => issue.key === "payment:subscription:2"), "Subscription-covered releases are not recurring subscription payments");
  assert(!result.issues.some((issue: any) => issue.key === "payment:distribution:4"), "A plan-covered order with no charge is not an unfulfilled payment");
  assert(result.issues.some((issue: any) => issue.key === "payment:distribution:5"), "An order paid with credits must still be linked to a fulfilled release");
  console.log("PASS exact release linkage and reconciliation cannot revive subscriptions from release entitlements or legacy order rows");
}
void main();
