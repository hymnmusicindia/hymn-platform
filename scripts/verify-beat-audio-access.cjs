const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict'), { build } = require('esbuild');
(async () => {
    const out = path.resolve('.cache/beat-audio-access');
    await fs.mkdir(out, { recursive: true });
    const file = path.join(out, 'master.wav');
    await fs.writeFile(file, 'original-master');
    global.audioPath = file;
    global.audioOpens = 0;
    await build({ entryPoints: ['app/api/beats/[id]/audio/route.ts'], outfile: path.join(out, 'route.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'data-fixtures', setup(b) { b.onResolve({ filter: /^@\/lib\/(prisma|private-storage)$/ }, a => ({ path: a.path, namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path.endsWith('/prisma') ? `export const prisma={beat:{findFirst:async({where})=>{global.queryCount++;const b=global.fixtureBeat;return b&&b.id===where.id&&b.enabled&&where.status.in.includes(b.status)?b:null}}}` : `import{open}from'node:fs/promises';export async function openPrivateAssetAudio(){global.audioOpens++;return open(global.audioPath,'r')}` })); } }] });
    const { GET, HEAD } = require(path.join(out, 'route.cjs'));
    const beat = () => ({ id: 1, userId: 9, enabled: true, status: 'PUBLISHED', user: { status: 'ACTIVE' }, deliverableAsset: { id: 3, beatId: 1, ownerUserId: 9, assetType: 'private_beat_deliverable', mimeType: 'audio/wav', deletedAt: null, retentionUntil: null, checksum: 'master-version-1' } });
    const context = { params: Promise.resolve({ id: '1' }) };
    global.fixtureBeat = beat();
    global.queryCount = 0;
    const response = await GET(new Request('https://hymn.test/api/beats/1/audio', { headers: { Range: 'bytes=0-7' } }), context);
    assert.equal(response.status, 206);
    assert.equal(await response.text(), 'original');
    assert.equal(global.queryCount, 1);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-cache, no-transform');
    assert.equal(response.headers.get('ETag'), '"master-version-1"');
    assert.equal((await HEAD(new Request('https://hymn.test/audio', { method: 'HEAD' }), context)).body, null);
    assert.equal((await GET(new Request('https://hymn.test/audio', { headers: { 'If-None-Match': '"master-version-1"' } }), context)).status, 304);
    for (const mutate of [b => b.enabled = false, b => b.status = 'PENDING_REVIEW', b => b.user.status = 'SUSPENDED', b => b.deliverableAsset.deletedAt = new Date(), b => b.deliverableAsset.retentionUntil = new Date(0), b => b.deliverableAsset.ownerUserId = 999, b => b.deliverableAsset.beatId = 999, b => b.deliverableAsset.mimeType = 'application/zip']) {
        global.fixtureBeat = beat();
        mutate(global.fixtureBeat);
        const before = global.audioOpens;
        assert.equal((await GET(new Request('https://hymn.test/audio'), context)).status, 404);
        assert.equal(global.audioOpens, before, 'Disallowed source must never be opened');
    }
    assert.equal(await fs.readFile(file, 'utf8'), 'original-master');
    console.log('PASS published beat streaming: single catalogue lookup, private revalidation, HEAD, cache hit, inactive/unpublished/deleted/expired/mismatched/ZIP sources denied before opening; original unchanged');
})().catch(e => { console.error(e); process.exitCode = 1; });
