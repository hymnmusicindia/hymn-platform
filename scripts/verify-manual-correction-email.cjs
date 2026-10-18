const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let permission = true;
let releaseStatus = 'CHANGES_REQUESTED';
let trackExists = true;
let queued = 0;
let delivered = 0;
let auditId = 0;
const auditRows = [];
const release = {
  id: 51, status: releaseStatus, archivedAt: null, correctionReason: null,
  direNoteStatus: 'changes_required', metadata: { direNote: { correctionMessages: ['Track 1 · Intro: Replace the sample licence.'] } },
  tracks: [{ id: 71, title: 'Intro', trackNumber: 1 }], user: { status: 'ACTIVE' }
};
const mocks = {
  'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
  '@/lib/access': { requireAdminPermission: async key => { assert.equal(key, 'releases.review'); return permission ? { sub: 9 } : { error: Response.json({}, { status: 403 }) }; } },
  '@/lib/public-app-url': { getPublicAppUrl: () => 'https://hymn.local' },
  '@/lib/prisma': { prisma: {
    release: { findUnique: async ({ where }) => where.id === 51 ? { ...release, status: releaseStatus, tracks: trackExists ? release.tracks : [] } : null },
    auditLog: { create: async ({ data }) => { auditRows.push(data); return { id: ++auditId }; } },
    emailLog: { findUnique: async () => ({ status: 'sent' }) }
  } },
  '@/lib/email/release-outbox': {
    queueReleaseStatusUpdate: async (_db, id, status, key) => { assert.equal(id, 51); assert.equal(status, 'changes_requested'); assert.match(key, /^manual-71-/); queued++; return 321; },
    deliverReleaseOutbox: async (_ids, limit, _deliver, logIds) => { assert.equal(limit, 1); assert.equal(JSON.stringify(logIds), '[321]'); delivered++; return { enabled: true, sent: 1, failed: 0, processed: 1 }; }
  }
};
const source = fs.readFileSync('app/api/admin/releases/[id]/correction-email/route.ts', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { exports: {}, require: name => name === 'node:crypto' ? require(name) : (assert.ok(mocks[name], name), mocks[name]), Request, Response, URL, console };
vm.runInNewContext(output, sandbox);
const post = body => sandbox.exports.POST(new Request('https://hymn.local/api/admin/releases/51/correction-email', { method: 'POST', headers: { origin: 'https://hymn.local', 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: '51' }) });

(async () => {
  permission = false; assert.equal((await post({ trackId: 71 })).status, 403);
  permission = true;
  assert.equal((await sandbox.exports.POST(new Request('https://hymn.local/api/admin/releases/51/correction-email', { method: 'POST', headers: { origin: 'https://evil.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ trackId: 71 }) }), { params: Promise.resolve({ id: '51' }) })).status, 403);
  trackExists = false; assert.equal((await post({ trackId: 71 })).status, 404); trackExists = true;
  releaseStatus = 'UNDER_REVIEW'; assert.equal((await post({ trackId: 71 })).status, 409); releaseStatus = 'CHANGES_REQUESTED';
  const response = await post({ trackId: 71 });
  assert.equal(response.status, 200); assert.equal((await response.json()).status, 'sent');
  assert.equal(queued, 1); assert.equal(delivered, 1);
  assert.deepEqual(auditRows.map(row => row.action), ['MANUAL_RELEASE_CORRECTION_EMAIL_REQUESTED', 'MANUAL_RELEASE_CORRECTION_EMAIL_FINISHED']);
  console.log('PASS manual correction email: permission and origin checks, track ownership, correction-state guard, precise outbox delivery, and audit trail.');
})().catch(error => { console.error(error); process.exitCode = 1; });
