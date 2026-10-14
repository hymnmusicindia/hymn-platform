const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { z } = require('zod');
let authenticated = true, allowed = true, payoutAllowed = false, writes = 0, origin = 'https://hymn.fixture';
const calls = [];
const business = new Proxy({}, { get: (_, key) => async (...args) => { calls.push([key,...args]); if (key !== 'playlistReviewSnapshot') writes++; return { ok: true }; } });
const mocks = {
  'zod': { z },
  'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
  '@/lib/access': { requireUser: async () => authenticated ? { user: { id: 9 } } : { error: new Response('{}', { status: 401 }) }, requireAdminPermission: async key => allowed && (key !== 'payouts.mark_paid' || payoutAllowed) ? { adminRole: 'owner' } : { error: new Response('{}', { status: 403 }) } },
  '@/lib/public-app-url': { getPublicAppUrl: () => 'https://hymn.fixture' },
  '@/lib/rate-limit': { consumeRateLimit: async () => ({ allowed: true }) },
  '@/lib/playlist-reviews': business,
  '@/lib/playlist-testimonials': business,
  '@/lib/playlist-recommendations-server': business,
  '@/lib/razorpay': { verifyRazorpaySignature: () => false, verifyRazorpayWebhookSignature: () => authenticated },
};
function load(file) {
  const sandbox = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Request, Response, URL, Buffer, console };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return sandbox.exports;
}
const request = body => new Request('https://hymn.fixture/api/playlist-reviews', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
(async () => {
  const customer = load('app/api/playlist-reviews/route.ts');
  authenticated = false;assert.equal((await customer.GET()).status,401);assert.equal((await customer.POST(request({ action:'apply' }))).status,401);assert.equal(writes,0);
  authenticated = true;origin = 'https://evil.example';assert.equal((await customer.POST(request({ action:'apply' }))).status,403);assert.equal(writes,0);
  origin='https://hymn.fixture';assert.equal((await customer.POST(request({ action:'verify', orderId:'order_123', paymentId:'pay_123', signature:'bad' }))).status,400);assert.equal(writes,0);
  await customer.POST(request({ action:'apply' }));assert.equal(calls.at(-1)[1],9);
  assert.equal((await customer.GET(new Request('https://hymn.fixture/api/playlist-reviews?view=recommendations&releaseId=bad'))).status,400);
  assert.equal((await customer.GET(new Request('https://hymn.fixture/api/playlist-reviews?view=recommendations&releaseId=83'))).status,200);
  assert.equal(calls.at(-1)[0],'releasePlaylistRecommendations');assert.equal(calls.at(-1)[1],9);assert.equal(calls.at(-1)[2],83);
  const admin = load('app/api/admin/playlist-reviews/route.ts');
  allowed=false;assert.equal((await admin.GET()).status,403);assert.equal((await admin.POST(request({ action:'moderate' }))).status,403);
  allowed=true;const before=writes;assert.equal((await admin.POST(request({ action:'settle',id:1,reference:'real_transfer_123' }))).status,403);assert.equal(writes,before);
  const moderation=await admin.POST(request({ action:'moderate',id:1,status:'APPROVED',note:'Verified ownership evidence.' }));assert.equal(moderation.status,200);assert.equal(calls.at(-1)[1],null);
  payoutAllowed=true;assert.equal((await admin.POST(request({ action:'settle',id:1,reference:'real_transfer_123' }))).status,200);
  let known=true, legacy=0;
  mocks['@/lib/playlist-review-webhook']={ processPlaylistReviewWebhook: async () => known };
  mocks['@/lib/payment-webhooks']={ receiveRazorpayEvent:async()=>{legacy++;return{id:1}},processRazorpayEvent:async()=>{} };
  const webhook=load('app/api/webhooks/razorpay/route.ts');
  authenticated=false;assert.equal((await webhook.POST(request({}))).status,401);assert.equal(legacy,0);
  authenticated=true;assert.equal((await webhook.POST(request({}))).status,200);assert.equal(legacy,0);
  known=false;assert.equal((await webhook.POST(request({}))).status,200);assert.equal(legacy,1);
  console.log('PASS actual routes: authentication, CSRF, invalid payment signature, server-derived actor, admin permission, separate settlement permission, signed product webhook and untouched legacy dispatch.');
})().catch(error=>{console.error(error);process.exitCode=1;});
