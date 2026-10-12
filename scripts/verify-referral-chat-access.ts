import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { referralJson } from "../lib/referral-request";

async function main() {
  process.env.NODE_ENV = "production"; process.env.NEXT_PUBLIC_APP_URL = "https://hymnmusic.fun";
  const fixture = { signedIn: false, participant: true, allowed: true, sends: 0 };
  (globalThis as typeof globalThis & { __referralAccess: typeof fixture }).__referralAccess = fixture;
  await build({ entryPoints: ["app/api/referrals/conversations/[id]/route.ts"], outfile: ".cache/referral-chat-access.cjs", bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "access-fixture", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/(access|prisma|referral-chat|rate-limit)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.endsWith("access") ? `import {NextResponse} from 'next/server';export const requireUser=async()=>globalThis.__referralAccess.signedIn?{user:{id:9}}:{error:NextResponse.json({error:'Unauthorized'},{status:401})};` : args.path.endsWith("referral-chat") ? `export const referralConversation=async()=>globalThis.__referralAccess.participant?{userId:8,owner:{id:8,name:'Owner'},referredUser:{id:9,name:'Follower'}}:null;export const sendReferralMessage=async()=>{globalThis.__referralAccess.sends++;return globalThis.__referralAccess.participant?{id:1,body:'hello'}:null;};` : args.path.endsWith("rate-limit") ? `export const consumeRateLimit=async()=>({allowed:globalThis.__referralAccess.allowed});` : `export const prisma={referralMessage:{findMany:async()=>[]},$transaction:async fn=>fn({$queryRaw:async()=>[],referral:{findFirst:async()=>null}})};`, resolveDir: process.cwd(), loader: "js" }));
  } }] });
  const api = createRequire(import.meta.url)(resolve(".cache/referral-chat-access.cjs"));
  const context = { params: Promise.resolve({ id: "12" }) };
  const request = (method = "GET", body?: unknown, origin = "https://hymnmusic.fun") => new Request("http://0.0.0.0:3000/api/referrals/conversations/12", { method, headers: { origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await api.GET(request(), context)).status, 401);
  fixture.signedIn = true; fixture.participant = false;
  assert.equal((await api.GET(request(), context)).status, 404);
  const payload = { body: "hello", clientKey: "da088d15-0762-4acf-96bf-958f7432d26f" };
  assert.equal((await api.POST(request("POST", payload, "https://attacker.invalid"), context)).status, 403);
  assert.equal(fixture.sends, 0);
  assert.equal((await api.POST(request("POST", payload), context)).status, 404);
  assert.equal((await api.PATCH(request("PATCH", { blocked: false }), context)).status, 404);
  fixture.participant = true;
  assert.equal((await api.POST(request("POST", { ...payload, body: " " }), context)).status, 400);
  assert.equal((await api.POST(request("POST", { ...payload, body: "a".repeat(2001) }), context)).status, 400);
  assert.equal((await api.POST(request("POST", payload), context)).status, 201, "Public Hostinger origin is accepted behind its internal host.");
  fixture.allowed = false;
  assert.equal((await api.GET(request(), context)).status, 429);
  assert.equal((await api.POST(request("POST", payload), context)).status, 429);
  assert.equal(await referralJson(request("POST", { text: "a".repeat(11000) })), null, "Body limit works even without Content-Length.");
  console.log("PASS referral chat API authentication, participant isolation, CSRF origin checks, Hostinger proxy origin, message limits, streamed body limit and rate limiting.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
