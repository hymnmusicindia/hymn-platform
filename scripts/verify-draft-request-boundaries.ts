import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { recordId } from '../lib/record-id';
import { readJsonBody, RequestBodyError } from '../lib/request-body';

let authenticated = true, reads = 0;
const mocks: Record<string, unknown> = {
  'next/server': { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
  '@/lib/access': { requireUser: async () => authenticated ? { session: { sub: 1 } } : { error: Response.json({}, { status: 401 }) } },
  '@/lib/distribution-db': { getDetailedReleaseByUserId: async (userId: number, id: number) => { reads++; assert.equal(userId, 1); assert.equal(id, 12); return { id, status: 'draft' }; } },
  '@/lib/release-track-save': {}, '@/lib/release-contributor-sync': {}, '@/lib/draft-policy': {}, '@/lib/release-asset-resolution': {},
  '@/lib/record-id': { recordId }, '@/lib/request-body': { readJsonBody, RequestBodyError }
};
const sandbox = { exports: {} as any, require: (name: string) => { assert(name in mocks, name); return mocks[name]; }, console };
vm.runInNewContext(ts.transpileModule(readFileSync('app/api/distribution/drafts/[id]/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body: string) => new Request('https://hymn.fixture/api/distribution/drafts/12', { method: 'PATCH', body });
async function main() {
  for (const id of ['','0','-1','1.1','1e2','0x10','NaN','Infinity','2147483648','9007199254740992',' 12','12 ']) {
    assert.equal(recordId(id), null, id);
    assert.equal((await sandbox.exports.GET(request('{}'), params(id))).status, 400, id);
    assert.equal((await sandbox.exports.PATCH(request('{}'), params(id))).status, 400, id);
  }
  assert.equal(reads, 0, 'Invalid IDs never reach the database');
  assert.equal(recordId('2147483647'), 2147483647);
  assert.equal((await sandbox.exports.GET(request('{}'), params('12'))).status, 200);
  for (const body of ['{','null','[]','"draft"','true','{"metadata":null}','{"metadata":[]}','{"metadata":"draft"}']) assert.equal((await sandbox.exports.PATCH(request(body), params('12'))).status, 400, body);
  authenticated = false;
  assert.equal((await sandbox.exports.GET(request('{}'), params('12'))).status, 401);
  assert.equal((await sandbox.exports.PATCH(request('{}'), params('12'))).status, 401);
  console.log('PASS draft routes: malformed/overflow IDs never query, malformed JSON and non-object saves never mutate, valid drafts remain readable and authentication stays mandatory.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
