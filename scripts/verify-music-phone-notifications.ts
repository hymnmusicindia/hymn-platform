import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { phoneFeedCursor, phoneNotification, phoneNotificationHref } from '../lib/music-phone-feed';
import { musicAppNeedsUpdate } from '../lib/music-app-version';

let user: number | null = 7, reads = 0;
const rows = Array.from({ length: 121 }, (_, i) => ({ id: i + 1, userId: i === 120 ? 8 : 7, title: 'Release approved', type: 'release', href: '/dashboard/releases?releaseId=3', readAt: i === 4 ? new Date() : null }));
const mocks: Record<string, unknown> = {
  'next/server': { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
  '@/lib/session': { getSession: async () => user === null ? null : { sub: user } },
  '@/lib/music-phone-feed': { phoneFeedCursor, phoneNotification },
  '@/lib/prisma': { prisma: { notification: {
    findFirst: async ({ where }: any) => { reads++; return rows.filter(row => row.userId === where.userId).at(-1) ?? null; },
    findMany: async ({ where, take, orderBy }: any) => { reads++; assert.equal(orderBy.id, 'asc'); return rows.filter(row => row.userId === where.userId && row.id > where.id.gt).slice(0, take); }
  } } }
};
const sandbox = { exports: {} as any, require: (name: string) => { assert(name in mocks, name); return mocks[name]; }, URL };
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/music/phone-notifications/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
const get = (query = '') => sandbox.exports.GET(new Request(`https://hymn.fixture/api/music/phone-notifications${query}`)) as Promise<Response>;
async function main() {
  assert(musicAppNeedsUpdate('Android HYMNMusic/1.0.4', '1.0.5'));
  assert(musicAppNeedsUpdate('HYMNMusic/1.0.9', '1.0.10'));
  for (const [ua, latest] of [['Chrome Android', '1.0.5'], ['HYMNMusic/1.0.5', '1.0.5'], ['HYMNMusic/2.0.0', '1.0.5'], ['HYMNMusic/bad', '1.0.5'], ['HYMNMusic/1.0.4', 'bad']]) assert.equal(musicAppNeedsUpdate(ua, latest), false);
  user = null; assert.equal((await get()).status, 401); assert.equal(reads, 0);
  user = 7;
  for (const invalid of ['-1', '1e2', '01', 'NaN', '2147483648', '1.5', '']) assert.equal((await get(`?account=7&after=${invalid}`)).status, 400, invalid);
  assert.equal(reads, 0);
  const baseline = await get(); assert.match(baseline.headers.get('cache-control')!, /no-store/);
  assert.deepEqual(await baseline.json(), { account: '7', cursor: 120, baseline: true, hasMore: false, items: [] });
  const switched = await (await get('?account=8&after=0')).json(); assert.equal(switched.baseline, true); assert.equal(switched.items.length, 0);
  const seen: number[] = []; let cursor = 0, more = true;
  while (more) {
    const page = await (await get(`?account=7&after=${cursor}`)).json();
    assert(page.cursor > cursor); cursor = page.cursor; more = page.hasMore;
    for (const item of page.items) { seen.push(item.id); assert.equal('body' in item, false); assert.equal('metadata' in item, false); }
  }
  assert.equal(cursor, 120); assert.equal(seen.length, 119); assert.equal(new Set(seen).size, 119); assert(!seen.includes(5)); assert(!seen.includes(121));
  assert.equal((await (await get('?account=7&after=120')).json()).items.length, 0);
  user = 9; assert.equal((await (await get()).json()).cursor, 0);
  for (const unsafe of ['https://evil.test', '//evil.test', '/api/auth/logout', '/auth', '/\\evil.test', 'https://user@hymnmusic.fun/']) assert.equal(phoneNotificationHref(unsafe), '/dashboard');
  assert.equal(phoneNotificationHref('/dashboard/releases?releaseId=3'), '/dashboard/releases?releaseId=3');
  assert.equal(phoneNotification({ id: 1, title: 'DireNote approved', type: 'release', href: null }).title, 'HYMN approved');
  console.log('PASS phone feed: authentication, malformed cursors, account isolation, first-install baseline, 3-page catch-up, read suppression, stable IDs, empty accounts, private no-store responses, safe links and HYMN branding. No live users or messages used.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
