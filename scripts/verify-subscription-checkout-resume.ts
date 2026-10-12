import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync(".cache", { recursive: true });
  process.env.RAZORPAY_PLAN_HALF_YEARLY = "plan_half_fixture";
  await build({ entryPoints: ["lib/subscription-billing.ts"], outfile: ".cache/subscription-resume.cjs", bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "subscription-fixture", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/(prisma|razorpay|growth|growth-partners)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.endsWith("prisma") ? "exports.prisma=globalThis.subscriptionResume.db;" : args.path.endsWith("razorpay") ? "exports.razorpay=globalThis.subscriptionResume.provider;" : "exports.recordGrowthEvent=exports.qualifyPartnerPayment=()=>{throw new Error('No payment or growth mutation expected')};" }));
  } }] });
  const state: any = { status: "created", providerStatus: "created", providerPlan: "plan_half_fixture", creates: 0 };
  (globalThis as any).subscriptionResume = {
    db: {
      subscription: { findUnique: async () => ({ id: 7, userId: 18, plan: "half_yearly", razorpaySubscriptionId: "sub_fixture", status: state.status }), upsert: async () => { throw new Error("Retry must not overwrite a subscription"); } },
      subscriptionPlanVersion: { upsert: async () => ({ id: 3, razorpayPlanId: "plan_half_fixture", amount: 69900, currency: "INR" }) }
    },
    provider: { plans: { fetch: async () => ({ item: { amount: 69900, currency: "INR" }, period: "monthly", interval: 6 }) }, subscriptions: {
      fetch: async () => ({ id: "sub_fixture", plan_id: state.providerPlan, status: state.providerStatus }),
      create: async () => { state.creates++; throw new Error("Retry must not create another mandate"); }
    } }
  };
  const modulePath = "../.cache/subscription-resume.cjs";
  const { createProviderSubscription } = await import(modulePath);
  for (const status of ["created", "authenticated"]) {
    state.status = state.providerStatus = status;
    const result = await createProviderSubscription(18, "half_yearly");
    assert.equal(result.provider.id, "sub_fixture"); assert.equal(state.creates, 0);
  }
  state.providerStatus = "active";
  await assert.rejects(createProviderSubscription(18, "half_yearly"), /active or pending/);
  state.providerStatus = "created"; state.providerPlan = "plan_other";
  await assert.rejects(createProviderSubscription(18, "half_yearly"), /active or pending/);
  state.status = "active"; state.providerPlan = "plan_half_fixture";
  await assert.rejects(createProviderSubscription(18, "half_yearly"), /active or pending/);
  assert.equal(state.creates, 0);
  console.log("PASS cancelled subscription checkout resumes the same mandate; active and mismatched plans remain protected");
}
void main();
