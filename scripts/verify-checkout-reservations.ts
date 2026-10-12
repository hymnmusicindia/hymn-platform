import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync(".cache", { recursive: true });
  await build({ entryPoints: ["lib/checkout-reservations.ts"], outfile: ".cache/checkout-reservations.cjs", bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "reservation-fixture", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/(prisma|razorpay)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.endsWith("prisma") ? "exports.prisma=globalThis.reservationFixture.db" : "exports.razorpay=globalThis.reservationFixture.provider" }));
  } }] });
  const state: any = { paymentStatus: "created", owner: 18, held: 1, payments: [], paid: 0, writes: 0, audits: 0, cancelCount: 1, providerFails: false };
  const tx = {
    checkoutOrder: { updateMany: async (query: any) => {
      assert.equal(query.where.paymentStatus, "created"); assert.equal(query.where.userId, 18);
      state.writes++; return { count: state.cancelCount };
    } },
    beat: { updateMany: async (query: any) => {
      assert.deepEqual(query.where, { exclusiveReservationOrderId: "order_fixture", exclusiveReservedByUserId: 18, status: "EXCLUSIVE_RESERVED" });
      assert.equal(query.data.status, "PUBLISHED"); state.writes++; return { count: 1 };
    } },
    auditLog: { create: async () => { state.audits++; } }
  };
  (globalThis as any).reservationFixture = {
    db: { checkoutOrder: { findUnique: async () => ({ id: 7, userId: state.owner, paymentStatus: state.paymentStatus }) }, beat: { count: async () => state.held }, $transaction: async (callback: any) => callback(tx) },
    provider: { orders: {
      fetch: async () => { if (state.providerFails) throw new Error("Offline"); return { status: state.paid ? "paid" : "created", amount_paid: state.paid }; },
      fetchPayments: async () => ({ items: state.payments })
    } }
  };
  const modulePath = "../.cache/checkout-reservations.cjs";
  const { releaseCheckoutReservation } = await import(modulePath);
  state.owner = 19; await assert.rejects(releaseCheckoutReservation(18, "order_fixture"), /not found/); assert.equal(state.writes, 0); state.owner = 18;
  state.paymentStatus = "paid"; assert.equal((await releaseCheckoutReservation(18, "order_fixture")).released, false); state.paymentStatus = "created";
  for (const status of ["created", "authorized", "captured", "refunded"]) {
    state.payments = [{ status }]; assert.equal((await releaseCheckoutReservation(18, "order_fixture")).released, false);
    assert.equal(state.writes, 0, "Payment attempts still processing must retain exclusive protection");
  }
  state.payments = []; state.paid = 250000; assert.equal((await releaseCheckoutReservation(18, "order_fixture")).released, false); assert.equal(state.writes, 0); state.paid = 0;
  state.providerFails = true; await assert.rejects(releaseCheckoutReservation(18, "order_fixture"), /Offline/); assert.equal(state.writes, 0); state.providerFails = false;
  state.cancelCount = 0; assert.equal((await releaseCheckoutReservation(18, "order_fixture")).released, false); assert.equal(state.audits, 0, "Concurrent fulfilment prevents releasing inventory");
  state.cancelCount = 1; state.writes = 0;
  assert.equal((await releaseCheckoutReservation(18, "order_fixture")).released, true); assert.equal(state.writes, 2); assert.equal(state.audits, 1);
  state.payments = [{ status: "failed" }]; assert.equal((await releaseCheckoutReservation(18, "order_fixture")).released, true);
  console.log("PASS reservation ownership, captured/authorized/pending payment protection, provider failure, concurrent fulfilment and unpaid cancellation; no live writes or charges");
}
void main();
