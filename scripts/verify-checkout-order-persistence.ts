import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync(".cache", { recursive: true });
  await build({ entryPoints: ["lib/checkout-order-persistence.ts"], outfile: ".cache/checkout-order-persistence.cjs", bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "database-fixture", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/prisma$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "exports.prisma={ $transaction:(callback,options)=>globalThis.checkoutFixture.transaction(callback,options) };" }));
  } }] });
  const modulePath = "../.cache/checkout-order-persistence.cjs";
  const { persistCheckoutOrder } = await import(modulePath);
  const globalState = globalThis as typeof globalThis & { checkoutFixture: any };
  let committed = false;
  let status = "PUBLISHED";
  let reserveCount = 1;
  let writes = 0;
  const calls: string[] = [];
  globalState.checkoutFixture = { transaction: async (callback: any, options: any) => {
    assert.equal(options.maxWait, 5000);
    assert.equal(options.timeout, 20000, "Cloud DB latency must not use Prisma's five-second default");
    committed = false;
    const tx = {
      storedAsset:{findMany:async()=>[]},
      user:{findUniqueOrThrow:async()=>({id:18,name:"Buyer",email:"buyer@example.test",artistCards:[{artistName:"Unconfirmed saved artist"}]})},
      beat: {
        updateMany: async (query: any) => {
          if (query.data.status === "PUBLISHED") {
            assert.deepEqual(query.where.id.in, [5], "Cleanup only touches this cart, never the whole catalogue");
            calls.push("cleanup"); return { count: 0 };
          }
          calls.push("reserve"); return { count: reserveCount };
        },
        findMany: async () => [{ id: 5, status,title:"Beat",user:{name:"Producer"},sampleDeclaration:"NO_UNCONTROLLED_SAMPLES",generalStreamingLimit:25000,generalVideoLimit:1,generalMaxCommercialReleases:1 }]
      },
      auditLog: { create: async () => { calls.push("audit"); } },
      checkoutOrder: { create: async (query: any) => {
        assert.equal(query.include, undefined, "No nested buyer/producer/file hydration before commit");
        assert.deepEqual(query.select, { id: true });
        assert.equal(Number(query.data.finalAmount), 120);
        assert.equal(query.data.razorpayOrderId, "order_fixture");
        assert.equal(query.data.items.create[0].licenseTermsSnapshot.version,'2026-10-29');
        assert.equal(query.data.items.create[0].licenseTermsSnapshot.buyer.artistName,'Confirmed artist');
        assert.equal(query.data.items.create[0].licenseTermsSnapshot.buyer.legalName,'Confirmed Buyer');
        assert.equal(query.data.items.create[0].licenseTermsSnapshot.buyer.phone,'+91 9876543210');
        assert.ok(query.data.items.create[0].licenseTermsSnapshot.buyer.acceptedTermsAt);
        assert.ok(query.data.items.create[0].licenseTermsSnapshot.clauses.length>8);
        if(query.data.items.create[0].licenseType!=='exclusive')assert.equal(query.data.items.create[0].licenseTermsSnapshot.rights.streamingLimit,25000);
        writes++; calls.push("write"); return { id: 42 };
      } }
    };
    const result = await callback(tx); committed = true; return result;
  } };
  const input = { buyerDetails:{legalName:"Confirmed Buyer",artistName:"Confirmed artist",phone:"+91 9876543210",acceptedTerms:true as const}, userId: 18, amount: 120, finalAmount: 120, razorpayOrderId: "order_fixture", paymentStatus: "created", items: [{ beatId: 5, licenseType: "mp3", price: 120 }] };
  await assert.rejects(persistCheckoutOrder({...input,buyerDetails:{...input.buyerDetails,artistName:""}}), /artist name/);
  assert.equal(await persistCheckoutOrder(input), 42); assert(committed);
  assert.deepEqual(calls, ["cleanup", "write"]);
  status = "EXCLUSIVE_RESERVED";
  await assert.rejects(persistCheckoutOrder(input), /temporarily unavailable/);
  assert.equal(committed, false); assert.equal(writes, 1, "Unavailable beats cannot create orders");
  status = "PUBLISHED"; reserveCount = 0;
  const exclusive = { ...input, items: [{ ...input.items[0], licenseType: "exclusive" }] };
  await assert.rejects(persistCheckoutOrder(exclusive), /no longer available/);
  assert.equal(committed, false); assert.equal(writes, 1, "Losing an exclusive reservation cannot create an order");
  reserveCount = 1; calls.length = 0;
  assert.equal(await persistCheckoutOrder(exclusive), 42); assert(committed);
  assert.deepEqual(calls, ["cleanup", "reserve", "audit", "write"]);
  console.log("PASS scoped cleanup, bounded transaction, post-commit hydration boundary and exclusive reservation gates; no live writes or charges");
}
void main();
