import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

async function main() {
  process.env.NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_APP_URL = 'https://hymnmusic.fun';
  const fixture = { signedIn: false, exists: true, fail: false, writes: 0, events: 0, completedAt: null as Date | null };
  (globalThis as typeof globalThis & { __referralOnboarding: typeof fixture }).__referralOnboarding = fixture;
  const require = createRequire(import.meta.url);
  const apis: Record<string, any> = {};
  for (const route of ['onboarding', 'events']) {
    const outfile = `.cache/referral-${route}-origin.cjs`;
    await build({ entryPoints: [`app/api/referrals/${route}/route.ts`], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'referral-fixture', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(session|prisma|rate-limit)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('session') ? `export const getSession=async()=>globalThis.__referralOnboarding.signedIn?{sub:9,role:'customer'}:null;` : args.path.endsWith('rate-limit') ? `export const consumeRateLimit=async()=>({allowed:true});export const requestIdentity=()=> 'fixture';` : `const f=globalThis.__referralOnboarding;export const prisma={user:{updateMany:async({where,data})=>{if(f.fail)throw new Error('fixture database unavailable');if(!f.exists||f.completedAt)return {count:0};if(where.id!==9)throw new Error('Wrong user');f.writes++;f.completedAt=data.referralPromptCompletedAt;return {count:1};},findUnique:async()=>f.exists?{id:9,referredById:null,referralPromptCompletedAt:f.completedAt,createdAt:new Date(),_count:{checkoutOrders:0,distributionOrders:0},subscription:null}:null},growthRewardPolicy:{findUniqueOrThrow:async()=>({artistCredit:100})},auditLog:{create:async()=>{f.events++;}}};`, loader: 'js', resolveDir: process.cwd() }));
    } }] });
    apis[route] = require(resolve(outfile));
  }
  const request = (origin: string | null = 'https://hymnmusic.fun', route = 'onboarding') => new Request(`http://0.0.0.0:3000/api/referrals/${route}`, { method: 'POST', headers: { ...(origin ? { origin } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'referral_link_copied' }) });
  assert.equal((await apis.onboarding.POST(request())).status, 401, 'Public origin passes CSRF validation before authentication.');
  fixture.signedIn = true;
  for (const origin of ['https://attacker.invalid', 'https://hymnmusic.fun.attacker.invalid', 'null']) assert.equal((await apis.onboarding.POST(request(origin))).status, 403);
  assert.equal(fixture.writes, 0, 'Rejected origins cannot save a choice.');
  assert.equal((await apis.onboarding.GET()).status, 200);
  assert.equal((await (await apis.onboarding.GET()).json()).showPrompt, true);
  const saved = await apis.onboarding.POST(request());
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).success, true);
  const completedAt = fixture.completedAt;
  assert.equal((await apis.onboarding.POST(request())).status, 200, 'Repeat skip is safe.');
  assert.equal(fixture.writes, 1);
  assert.equal(fixture.completedAt, completedAt);
  assert.equal((await (await apis.onboarding.GET()).json()).showPrompt, false, 'Reload does not reopen the skipped prompt.');
  fixture.fail = true;
  assert.equal((await apis.onboarding.POST(request())).status, 503);
  fixture.fail = false; fixture.exists = false;
  assert.equal((await apis.onboarding.POST(request())).status, 404);
  fixture.exists = true;
  assert.equal((await apis.onboarding.POST(request(null))).status, 200, 'Same-origin clients without Origin remain supported.');
  assert.equal((await apis.events.POST(request('https://hymnmusic.fun', 'events'))).status, 200);
  assert.equal((await apis.events.POST(request('https://attacker.invalid', 'events'))).status, 403);
  assert.equal(fixture.events, 1);
  console.log('PASS referral skip behind Hostinger, authentication, CSRF isolation, repeat requests, persisted prompt dismissal, missing accounts, database failures and referral event origins.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
