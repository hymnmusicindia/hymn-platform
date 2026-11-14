const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { build } = require('esbuild');
(async () => {
  const outfile = path.resolve('.cache/income-history-route.cjs');
  await fs.mkdir(path.dirname(outfile), { recursive: true });
  await build({ entryPoints: ['app/api/payout/income/history/route.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'authenticated-read-fixture', setup(b) {
    b.onResolve({ filter: /^@\/lib\/(access|income-history)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('access') ? `export async function requireUser(){return global.incomeAuth;}` : `export async function getIncomeHistory(...args){global.historyArguments=args;if(global.historyFailure)throw Error('PRIVATE DATABASE ERROR');return {source:args[1],entries:[],withdrawals:[],nextCursor:null};}` }));
  } }] });
  const { GET } = require(outfile);
  global.incomeAuth = { error: new Response('Unauthorized', { status: 401 }) };
  assert.equal((await GET(new Request('https://fixture.invalid/?source=studio'))).status, 401);
  global.incomeAuth = { user: { id: 7 } };
  for (const query of ['', 'source=unknown', 'source=studio&before=0', 'source=studio&before=-1', 'source=studio&before=NaN', 'source=studio&before=1.5', 'source=studio&before=9007199254740992']) assert.equal((await GET(new Request(`https://fixture.invalid/?${query}`))).status, 400);
  for (const source of ['studio', 'artist_royalty', 'producer_beat_sales', 'other', 'referral', 'curator']) {
    const response = await GET(new Request(`https://fixture.invalid/?source=${source}&before=25&userId=999`));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(global.historyArguments, [7, source, 25], 'Query parameters cannot impersonate a beneficiary');
  }
  global.historyFailure = true;
  const failed = await GET(new Request('https://fixture.invalid/?source=studio'));
  assert.equal(failed.status, 503); assert.equal(failed.headers.get('cache-control'), 'private, no-store');
  assert(!JSON.stringify(await failed.json()).includes('PRIVATE'));
  console.log('Income history API: authentication, beneficiary scope, six source routes, cursor validation, private caching and safe failure checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
