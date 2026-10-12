import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { build } from "esbuild";
async function main() {
  mkdirSync(".cache", { recursive: true });
  const state = globalThis as typeof globalThis & { payoutFixture: { auth: unknown; calls: unknown[] } };
  for (const [file, name] of [["app/api/referrals/payouts/route.ts", "user"], ["app/api/admin/referral-payouts/route.ts", "admin"]]) {
    await build({ entryPoints: [file], outfile: `.cache/referral-payout-${name}.cjs`, bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "access-adapters", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(access|referral-commissions)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.endsWith("access") ? `exports.requireUser=async()=>globalThis.payoutFixture.auth;exports.requireRecentAdminPermission=async permission=>{globalThis.payoutFixture.calls.push(permission);return globalThis.payoutFixture.auth}` : `exports.requestReferralPayout=async userId=>{globalThis.payoutFixture.calls.push(userId);return {id:1}};exports.reviewReferralPayout=async(id,actor,body)=>{globalThis.payoutFixture.calls.push({id,actor,body});return {id,status:'PAID'}}` }));
    } }] });
  }
  const user = await import("../.cache/referral-payout-user.cjs"), admin = await import("../.cache/referral-payout-admin.cjs");
  state.payoutFixture = { auth: { error: new Response("Unauthorized", { status: 401 }) }, calls: [] };
  assert.equal((await user.POST()).status, 401); assert.deepEqual(state.payoutFixture.calls, []);
  state.payoutFixture = { auth: { user: { id: 18 } }, calls: [] };
  assert.equal((await user.POST()).status, 201); assert.deepEqual(state.payoutFixture.calls, [18], "Payout owner is taken from the authenticated account, never the request.");
  const request = (body: unknown) => new Request("http://localhost/api/admin/referral-payouts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const body = { id: 1, action: "paid", note: "Fixture verified", reference: "fixture-reference" };
  state.payoutFixture = { auth: { error: new Response("Forbidden", { status: 403 }) }, calls: [] };
  assert.equal((await admin.POST(request(body))).status, 403); assert.deepEqual(state.payoutFixture.calls, ["payouts.review"]);
  state.payoutFixture = { auth: { sub: 99 }, calls: [] };
  assert.equal((await admin.POST(request({ ...body, note: "" }))).status, 400); assert.deepEqual(state.payoutFixture.calls, ["payouts.review"]);
  assert.equal((await admin.POST(request(body))).status, 200);
  assert.deepEqual(state.payoutFixture.calls[2], { id: 1, actor: 99, body });
  console.log("PASS referral payout API ownership, recent administrator permission gate and input validation; no bank transfers.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
