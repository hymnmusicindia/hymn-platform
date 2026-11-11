const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict'), { build } = require('esbuild');
(async () => {
  const root = path.resolve('.cache/beat-waveform-access'); await fs.mkdir(root, { recursive: true });
  const bytes = Buffer.alloc(44 + 32000); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(32000, 40);
  for (let i = 0; i < 16000; i++) bytes.writeInt16LE(Math.round(Math.sin(i * .17) * (500 + (i % 1000) * 20)), 44 + i * 2);
  const audioPath = path.join(root, 'master.wav'); await fs.writeFile(audioPath, bytes);
  global.waveformAudioPath = audioPath; global.waveformRoot = path.join(root, 'managed'); global.audioOpens = 0; global.queries = 0;
  await build({ entryPoints: ['app/api/beats/[id]/waveform/route.ts'], outfile: path.join(root, 'route.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'fixtures', setup(b) {
    b.onResolve({ filter: /^@\/lib\/(prisma|private-storage|storage|hostinger-storage)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path.endsWith('/prisma') ? 'export const prisma={beat:{findUnique:async({where})=>{global.queries++;return where.id===1?global.fixtureBeat:null}}}' : a.path.endsWith('/private-storage') ? 'import{open}from"node:fs/promises";export async function openPrivateAssetAudio(){global.audioOpens++;return open(global.waveformAudioPath,"r")}' : a.path.endsWith('/hostinger-storage') ? 'export const managedStorageRoot=()=>global.waveformRoot' : 'export const normalizePublicUploadUrl=x=>x;export const resolvePublicUploadPaths=()=>[global.waveformAudioPath]' }));
  } }] });
  const { GET } = require(path.join(root, 'route.cjs'));
  const beat = () => ({ id: 1, userId: 9, enabled: true, status: 'PUBLISHED', user: { status: 'ACTIVE' }, preview: { id: 7, userId: 9, publicUrl: '/api/public-uploads/beats/preview.wav', checksum: 'preview' }, deliverableAsset: { id: 3, beatId: 1, ownerUserId: 9, assetType: 'private_beat_deliverable', mimeType: 'audio/wav', deletedAt: null, retentionUntil: null, checksum: 'master' } });
  const context = { params: Promise.resolve({ id: '1' }) }, request = source => new Request(`https://hymn.test/api/beats/1/waveform?source=${source}`);
  global.fixtureBeat = beat();
  const response = await GET(request('master'), context); assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.peaks.length, 128); assert.equal(data.duration, 1); assert(JSON.stringify(data).length < 1024);
  const cached = await GET(new Request(request('master'), { headers: { 'If-None-Match': response.headers.get('ETag') } }), context); assert.equal(cached.status, 304);
  const preview = await GET(request('preview'), context); assert.equal(preview.status, 200); assert.notEqual(preview.headers.get('ETag'), response.headers.get('ETag'));
  for (const mutate of [b => b.enabled = false, b => b.status = 'PENDING_REVIEW', b => b.user.status = 'SUSPENDED', b => b.deliverableAsset.deletedAt = new Date(), b => b.deliverableAsset.retentionUntil = new Date(0), b => b.deliverableAsset.ownerUserId = 999, b => b.deliverableAsset.beatId = 999, b => b.deliverableAsset.mimeType = 'application/zip']) {
    global.fixtureBeat = beat(); mutate(global.fixtureBeat); const opens = global.audioOpens;
    assert.equal((await GET(request('master'), context)).status, 404); assert.equal(global.audioOpens, opens);
  }
  global.fixtureBeat = beat(); global.fixtureBeat.preview.userId = 999; assert.equal((await GET(request('preview'), context)).status, 404);
  global.fixtureBeat = beat(); global.fixtureBeat.preview.publicUrl = 'https://external.invalid/private'; assert.equal((await GET(request('preview'), context)).status, 404);
  const before = global.queries; assert.equal((await GET(request('arbitrary-url'), context)).status, 404); assert.equal(global.queries, before);
  console.log('PASS waveform API: source-specific peaks, <1 KB response, ETag, public-state revalidation, inactive/unpublished/deleted/expired/mismatched/ZIP denial and no arbitrary URL fetching');
})().catch(error => { console.error(error); process.exitCode = 1; });
