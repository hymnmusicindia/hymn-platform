import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { engineerApplicationSchema } from '../lib/engineer-applications';

const nativeRequire = createRequire(import.meta.url);
let authenticated = true, role = 'artist', active = true, profile = false;
const writes: Array<{ kind: string; args: any }> = [];
const record = (kind: string, result: unknown = {}) => async (args: any) => { writes.push({ kind, args }); return result; };
const mocks: Record<string, unknown> = {
  'next/server': { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) }, after: (fn: () => Promise<void>) => { deferred.push(fn); } },
  '@/lib/access': { requireUser: async () => authenticated ? { user: { id: 7, role } } : { error: Response.json({}, { status: 401 }) } },
  '@/lib/session': { getSession: async () => authenticated ? { sub: 7, role } : null },
  '@/lib/engineer-applications': { engineerApplicationSchema },
  '@/lib/db': { updateUserRole: record('role') },
  '@/lib/prisma': { prisma: {
    producerProfile: { upsert: record('producer') },
    engineerProfile: { findFirst: async () => profile ? { id: 1 } : null },
    user: { findUnique: async () => ({ id: 7, name: 'Creator', email: 'creator@example.test', status: active ? 'ACTIVE' : 'SUSPENDED' }) },
    engineerApplication: { upsert: record('engineer', { id: 3, updatedAt: new Date('2026-11-25') }) },
    auditLog: { create: record('audit') }, notification: { create: record('notification') }
  } },
  '@/lib/notifications': { createNotificationOnce: record('notification') },
  '@/lib/email/email-templates': { emailLayout: () => '', emailText: () => '' },
  '@/lib/email/send-transactional-email': { sendTransactionalEmail: record('email') },
  '@/lib/public-app-url': { getPublicAppUrl: () => 'https://hymn.fixture' }
};
const deferred: Array<() => Promise<void>> = [];
function load(file: string) {
  const module = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports: module.exports, console, Response, Request, require: (id: string) => mocks[id] ?? nativeRequire(id) });
  return module.exports.POST;
}
const request = (body: unknown) => new Request('https://hymn.fixture/api', { method: 'POST', body: JSON.stringify(body) });
async function main() {
  const producer = load('app/api/producer/enroll/route.ts'), engineer = load('app/api/studio/engineer-application/route.ts');
  authenticated = false;
  assert.equal((await producer(request({}))).status, 401); assert.equal((await engineer(request({}))).status, 401); assert.equal(writes.length, 0);
  authenticated = true; role = 'admin'; assert.equal((await producer(request({}))).status, 400);
  role = 'artist'; assert.equal((await producer(request({ producerName: 'Creator', genre: 'Trap' }))).status, 400); assert.equal(writes.length, 0);
  assert.equal((await producer(request({ producerName: 'Creator', genre: 'Trap', rightsConfirmed: true, ageConfirmed: true, termsAccepted: true, userId: 999 }))).status, 200);
  assert.equal(writes.find(w => w.kind === 'producer')!.args.create.userId, 7); assert.equal(writes.find(w => w.kind === 'role')!.args, 7);
  const before = writes.length; role = 'producer'; assert.equal((await producer(request({}))).status, 200); assert.equal(writes.length, before);
  role = 'artist'; assert.equal((await engineer(request({}))).status, 400);
  const draft = { professionalName: 'Creator', bio: 'Mixing and mastering for independent artists.', specialties: ['Mixing'], genres: ['Pop'], portfolioUrl: 'https://example.test/work', experienceLevel: 'WORKING', startingPrice: 1999, turnaroundDays: 5 };
  profile = true; assert.equal((await engineer(request(draft))).status, 409); profile = false;
  active = false; assert.equal((await engineer(request(draft))).status, 403); active = true;
  assert.equal((await engineer(request({ ...draft, turnaroundDays: 1.5 }))).status, 400);
  assert.equal((await engineer(request({ ...draft, startingPrice: 0 }))).status, 400);
  assert.equal((await engineer(request({ ...draft, userId: 999 }))).status, 200);
  const write = writes.find(w => w.kind === 'engineer')!.args;
  assert.equal(write.create.userId, 7); assert.equal(write.update.status, 'PENDING'); assert.equal(write.update.reviewedAt, null);
  await Promise.all(deferred.map(fn => fn())); assert.equal(writes.filter(w => w.kind === 'email').length, 1);
  // Exercise the server page too: an expired session must retain curator intent.
  const pageModule = { exports: {} as { default: (props: { searchParams: Promise<{ reviewView?: string }> }) => Promise<unknown> } };
  const pageCode = ts.transpileModule(fs.readFileSync('app/(authenticated)/dashboard/playlists/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(pageCode, { exports: pageModule.exports, require: (id: string) => id === 'next/navigation' ? { redirect: (href: string) => { throw new Error(href); } } : id === '@/lib/access' ? { getCurrentUserForPage: async () => null } : id === '@/components/playlist-review-marketplace' ? {} : nativeRequire(id) });
  await assert.rejects(pageModule.exports.default({ searchParams: Promise.resolve({ reviewView: 'curator' }) }), error => new URL((error as Error).message, 'https://hymn.fixture').searchParams.get('next') === '/dashboard/playlists?reviewView=curator');
  await assert.rejects(pageModule.exports.default({ searchParams: Promise.resolve({ reviewView: 'invalid' }) }), error => new URL((error as Error).message, 'https://hymn.fixture').searchParams.get('next') === '/dashboard/playlists');
  console.log('PASS actual creator routes: authentication, consent, admin guard, idempotent producer enrollment, server-derived identity, engineer price/delivery validation, active-profile/account guards, review reset and queued notification/email. All persistence and delivery adapters isolated.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
