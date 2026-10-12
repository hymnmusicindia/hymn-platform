import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync(".cache", { recursive: true });
  await build({ entryPoints: ["app/api/checkout/create-order/route.ts"], outfile: ".cache/checkout-create-order.cjs", bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "checkout-fixture", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\// }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      exports.getSession=async()=>({sub:18,email:'buyer@example.com'});
      exports.checkoutCreateOrderSchema={parse:value=>value};
      exports.buildCheckoutQuote=async()=>({finalAmount:120,originalPrice:120,couponDiscount:0,referralBenefitApplied:0,referralCreditsApplied:0});
      exports.quoteToOrderItems=()=>[{beatId:5,licenseType:'mp3',price:120}];
      exports.razorpay={orders:{create:async()=>{globalThis.createOrderFixture.calls.push('provider-order');return {id:'order_fixture'}}}};
      exports.createOrder=async()=>{globalThis.createOrderFixture.calls.push('persist');if(globalThis.createOrderFixture.failure)throw globalThis.createOrderFixture.failure;};
      exports.SubscriptionPlanConfigurationError=class extends Error{};
      exports.subscriptionCheckoutUnavailable='Unavailable';
      exports.isSubscriptionProduct=()=>false;
      exports.createProviderSubscription=()=>{throw new Error('Unexpected subscription')};
      exports.completeCheckoutOrder=exports.createBeatPurchase=exports.createNotification=exports.generateBeatLicense=exports.sendBeatEmailEvent=()=>{throw new Error('Unpaid orders must never fulfil')};
      exports.prisma={};exports.emailAppUrl=value=>value;
    ` }));
  } }] });
  const modulePath = "../.cache/checkout-create-order.cjs";
  const { POST } = await import(modulePath);
  const state = globalThis as typeof globalThis & { createOrderFixture: any };
  const request = () => POST(new Request("http://localhost/api/checkout/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ type: "beat", beatId: 5, licenseType: "mp3" }] }) }));
  for (const code of ["P2028", "P2024", "P1001", "P1002", "P1017"]) {
    state.createOrderFixture = { calls: [], failure: Object.assign(new Error("Transaction API error: private database details"), { code }) };
    const response = await request(); const data = await response.json();
    assert.equal(response.status, 503); assert.equal(data.code, "CHECKOUT_TEMPORARILY_UNAVAILABLE");
    assert(!data.error.includes("Transaction API")); assert.equal(data.orderId, undefined);
    assert.deepEqual(state.createOrderFixture.calls, ["provider-order", "persist"], "No payment checkout or fulfilment before persistence succeeds");
  }
  state.createOrderFixture = { calls: [], failure: null };
  const response = await request(); const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.orderId, "order_fixture"); assert.equal(data.amount, 12000);
  assert.deepEqual(state.createOrderFixture.calls, ["provider-order", "persist"]);
  console.log("PASS transient database failures return safe retry messages; Razorpay checkout starts only after order persistence; no live charges");
}
void main();
