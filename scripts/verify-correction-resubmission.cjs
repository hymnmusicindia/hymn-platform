const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
function load(file, mocks = {}) {
  const sandbox = { exports: {}, require: name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, console, Buffer, Date };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, sandbox);
  return sandbox.exports;
}
const workflow = load('lib/release-correction-workflow.ts');
const { readTrackLanguage } = load('lib/track-language.ts');
assert.equal(readTrackLanguage({ language: 'Hindi', version: 'Instrumental' }), 'Instrumental');
assert.equal(readTrackLanguage({ language: 'Hindi', titleLanguage: 'English' }), 'Hindi');
assert.equal(readTrackLanguage({ metadata: { trackLanguage: 'Punjabi', language: 'Hindi' } }), 'Punjabi');
assert.equal(readTrackLanguage({}), ''); // Never infer vocal language from the release/title.
assert.equal(workflow.matchesReceivedCorrection({ status: 'changes_requested', metadata: { correctionSubmissionKey: 'key' } }, 'key'), false);
assert.equal(workflow.matchesReceivedCorrection({ status: 'under_review', metadata: { correctionSubmissionKey: 'other' } }, 'key'), false);
const metadata = { editReleaseId: 83, language: 'Hindi', tracks: [{ language: 'Hindi' }] };
const key = crypto.createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
let release = { id: 83, userId: 1, status: 'under_review', paymentStatus: 'paid', metadata: { correctionSubmissionKey: key } };
let session = { sub: 1 };
let failNextRead = false;
const mocks = {
  '@/lib/release-artist-verification': {assertReleaseArtistVerification:async()=>{},selectedReleaseArtistIds:()=>[],ArtistVerificationError:class extends Error{}},
  '@/lib/policy-agreement': {requireCurrentPolicyAcceptance:async()=>null},
  'node:crypto': crypto,
  'next/server': { NextResponse: { json: (data, init) => new Response(JSON.stringify(data), init) } },
  '@/lib/release-correction-workflow': workflow,
  '@/lib/session': { getSession: async () => session },
  '@/lib/distribution-db': { getDetailedReleaseById: async () => {
    if (failNextRead) { failNextRead = false; throw new Error('Simulated response/read failure'); }
    return release;
  }, updatePaidDistributionRelease: () => { throw new Error('Must not submit twice'); } },
  '@/lib/validation': { distributionEditSchema: { parse: value => value } },
  '@/lib/release-track-save': { releaseSaveFailure: () => null },
  '@/lib/private-storage': {}, '@/lib/db': {}, '@/lib/distribution-asset-format': {},
  '@/lib/release-asset-resolution': {}, '@/lib/prisma': {},
};
const { POST } = load('app/api/distribution/update-release/route.ts', mocks);
const request = () => ({ formData: async () => new Map([['payload', JSON.stringify({ metadata })]]) });
(async () => {
  const response = await POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alreadyReceived, true);
  failNextRead = true;
  assert.equal((await POST(request())).status, 200);
  release.metadata.correctionSubmissionKey = 'different';
  assert.equal((await POST(request())).status, 409);
  release.userId = 2;
  release.metadata.correctionSubmissionKey = key;
  assert.equal((await POST(request())).status, 404);
  session = null;
  assert.equal((await POST(request())).status, 401);
  const form = fs.readFileSync('components/release-form.tsx', 'utf8');
  assert.match(form, /!amendmentMode && initialRelease && \(releaseAlreadyInReview\(initialRelease.status\)/);
  assert.equal((form.match(/hidden=\{Boolean\(initialRelease && initialRelease.status !== "draft"\)\}/g) || []).length, 2);
  assert.equal((form.match(/help=\{<LanguageFieldHelp/g) || []).length, 2);
  console.log('PASS exact correction retry, locked/mismatched payload, ownership, authentication, instrumental and independent track language, review-state and Draft UI guards.');
})().catch(error => { console.error(error); process.exitCode = 1; });
