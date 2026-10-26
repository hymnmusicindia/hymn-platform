import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { NextRequest } from "next/server";

async function main() {
  mkdirSync(".cache", { recursive: true });
  process.env.NODE_ENV = "production";
  for (const name of ["NEXT_PUBLIC_APP_URL", "APP_URL", "PUBLIC_SITE_URL", "NEXT_PUBLIC_SITE_URL"]) delete process.env[name];
  const state = globalThis as typeof globalThis & { referralFixture: { allowed: boolean; session?: unknown; user: unknown; partner: unknown; visits: number; queries: unknown[] } };
  for (const [entry, name] of [["app/join/route.ts", "join"], ["app/api/referrals/track/route.ts", "track"]]) {
    await build({ entryPoints: [entry], outfile: `.cache/referral-${name}.cjs`, bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "referral-adapters", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(prisma|referrals|growth-partners|rate-limit|session)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.endsWith("session") ? `exports.getSession=async()=>globalThis.referralFixture.session||null;` : args.path.endsWith("prisma") ? `exports.prisma={user:{findFirst:async q=>{globalThis.referralFixture.queries.push(q);return globalThis.referralFixture.user}},growthPartner:{findUnique:async()=>globalThis.referralFixture.partner},referralVisit:{create:async()=>{globalThis.referralFixture.visits++}}}` : args.path.endsWith("referrals") ? `exports.normalizeReferralCode=v=>v?.trim().toUpperCase().replace(/[^A-Z0-9]/g,'')||'';exports.REFERRAL_ATTRIBUTION_COOKIE='hymn_referral_attribution';exports.REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS=2592000;` : args.path.endsWith("growth-partners") ? `exports.PARTNER_COOKIE='hymn_partner_attribution'` : `exports.requestIdentity=()=> 'fixture';exports.consumeRateLimit=async()=>({allowed:globalThis.referralFixture.allowed});` }));
    } }] });
  }
  const { GET } = await import("../.cache/referral-join.cjs");
  const { POST } = await import("../.cache/referral-track.cjs");
  const reset = () => { state.referralFixture = { allowed: true, user: { id: 18, referralCode: "ADITYA1234" }, partner: null, visits: 0, queries: [] }; };
  const join = (code: string) => GET(new NextRequest(`http://0.0.0.0:3000/join?ref=${encodeURIComponent(code)}`));
  const track = (origin = "https://hymnmusic.fun", code = " aditya1234 ") => POST(new Request("http://0.0.0.0:3000/api/referrals/track", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ referralCode: code }) }));
  reset(); let response = await join(" aditya1234 ");
  assert.equal(response.headers.get("location"), "https://hymnmusic.fun/login?mode=signup&ref=ADITYA1234");
  assert.equal(response.cookies.get("hymn_referral_attribution")?.value, "ADITYA1234");
  assert.match(response.headers.get("set-cookie") || "", /HttpOnly/); assert.match(response.headers.get("set-cookie") || "", /Secure/);
  assert.equal(state.referralFixture.visits, 1);
  reset(); state.referralFixture.session={role:'USER'};response=await join('ADITYA1234');
  assert.match(response.headers.get('location')||'',/hymnmusic\.fun\/\?ref=ADITYA1234/);
  assert.equal(response.cookies.get('hymn_referral_attribution')?.value,'ADITYA1234');
  reset(); response = await track(); assert.equal(response.status, 200);
  assert.equal(response.cookies.get("hymn_referral_attribution")?.value, "ADITYA1234");
  assert.equal(response.cookies.get("hymn_partner_attribution")?.value, "");
  assert.deepEqual(state.referralFixture.queries[0], { where: { referralCode: { equals: "ADITYA1234", mode: "insensitive" }, status: "ACTIVE" }, select: { referralCode: true } });
  reset(); assert.equal((await track("https://attacker.invalid")).status, 403); assert.equal(state.referralFixture.queries.length, 0);
  reset(); state.referralFixture.user = null; response = await join("BADCODE");
  assert.equal(response.headers.get("location"), "https://hymnmusic.fun/login?mode=signup&referralError=invalid"); assert.equal(response.cookies.get("hymn_referral_attribution")?.value, "");
  assert.equal((await track()).status, 404);
  reset(); state.referralFixture.user = null; state.referralFixture.partner = { status: "approved" }; response = await join("PARTNER123");
  assert.equal(response.headers.get("location"), "https://hymnmusic.fun/login?mode=signup"); assert.equal(response.cookies.get("hymn_partner_attribution")?.value, "PARTNER123");
  reset(); state.referralFixture.allowed = false; assert.equal((await join("ADITYA1234")).status, 429); assert.equal((await track()).status, 429);
  console.log("PASS referral redirects behind Hostinger, attribution cookies, manual codes, partner switching, invalid codes, rate limits and cross-site rejection; no production writes.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
