import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { activateDireNoteAttempt, ensureCurrentDireNoteAttempt } from '../lib/distribution-idempotency';
import { syncDireNoteRelease } from '../lib/direnote-service';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('An amendment awaiting assignment must never look up the previous release.'); };
  try {
    const user = await prisma.user.create({ data: { name: 'Amendment fixture', email: 'amendments@fixture.invalid', googleId: 'amendments-fixture' } });
    const oldUpc = '3473620319017', newUpc = '3473620319079';
    const oldIsrcs = ['INDN22600001', 'INDN22600002'], newIsrcs = ['INDN22600101', 'INDN22600102'];
    const release = await prisma.release.create({ data: { userId: user.id, title: 'Amendment fixture', artistName: 'Fixture artist', genre: 'Pop', releaseDate: new Date(), upc: oldUpc, status: 'LIVE', tracks: { create: oldIsrcs.map((isrc, index) => ({ title: `Recording ${index + 1}`, trackNumber: index + 1, isrc })) } }, include: { tracks: { orderBy: { trackNumber: 'asc' } } } });
    const old = await prisma.distributionSubmissionAttempt.create({ data: { releaseId: release.id, state: 'submitted', isCurrent: true, idempotencyKey: 'amendment-old', payloadHash: 'old', upc: oldUpc, providerStatus: 'live', payloadRedacted: { upc: oldUpc }, trackIdentifiers: release.tracks.map(track => ({ id: track.id, isrc: track.isrc })) } });
    const next = await prisma.distributionSubmissionAttempt.create({ data: { releaseId: release.id, idempotencyKey: 'amendment-next', payloadHash: 'next' } });
    const pending = release.tracks.map(track => ({ id: track.id, isrc: null }));
    await activateDireNoteAttempt(next.id, { upc: null, trackIdentifiers: pending, responseRedacted: { identifierPolicy: 'replace', ingestJobId: 'fixture-job' }, providerStatus: 'queued' }, { replaceIdentifiers: true });
    const projection = () => prisma.release.findUniqueOrThrow({ where: { id: release.id }, include: { tracks: { orderBy: { trackNumber: 'asc' } } } });
    assert.equal((await projection()).upc, oldUpc);
    assert.deepEqual((await projection()).tracks.map(track => track.isrc), oldIsrcs);
    assert.equal((await ensureCurrentDireNoteAttempt(release.id)).upc, null, 'An old displayed UPC must not be adopted as the new attempt UPC.');
    const synced = await syncDireNoteRelease(release.id); assert.ok('skipped' in synced); assert.equal(synced.skipped, 'identifier_assignment_pending');
    const locks = await prisma.externalIdentifierHistory.count({ where: { releaseId: release.id, source: `submission_attempt:${next.id}:locked` } });
    assert.equal(locks, 3);
    await activateDireNoteAttempt(next.id, { upc: newUpc, trackIdentifiers: [{ id: release.tracks[0].id, isrc: newIsrcs[0] }, { id: release.tracks[1].id, isrc: null }], responseRedacted: { identifierPolicy: 'replace' }, providerStatus: 'processing' }, { replaceIdentifiers: true });
    assert.equal((await projection()).upc, oldUpc, 'Partial assignments never produce a mixed old/new identifier set.');
    assert.deepEqual((await projection()).tracks.map(track => track.isrc), oldIsrcs);
    assert.equal((await ensureCurrentDireNoteAttempt(release.id)).upc, newUpc);
    assert.equal(await prisma.externalIdentifierHistory.count({ where: { releaseId: release.id, source: `submission_attempt:${next.id}:locked` } }), locks, 'Repeated checks do not duplicate identifier locks.');
    const complete = release.tracks.map((track, index) => ({ id: track.id, isrc: newIsrcs[index] }));
    await assert.rejects(activateDireNoteAttempt(next.id, { upc: newUpc, trackIdentifiers: [{ id: release.tracks[0].id, isrc: 'INVALID' }], responseRedacted: {} }, { replaceIdentifiers: true }), /invalid ISRC/);
    await assert.rejects(activateDireNoteAttempt(next.id, { upc: newUpc, trackIdentifiers: [complete[0], complete[0]], responseRedacted: {} }, { replaceIdentifiers: true }), /duplicated/);
    assert.equal((await projection()).upc, oldUpc);
    await activateDireNoteAttempt(next.id, { upc: newUpc, trackIdentifiers: complete, responseRedacted: { identifierPolicy: 'replace' }, providerStatus: 'completed' }, { replaceIdentifiers: true });
    assert.equal((await projection()).upc, newUpc); assert.deepEqual((await projection()).tracks.map(track => track.isrc), newIsrcs);
    const previous = await prisma.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: old.id } });
    assert.equal(previous.upc, oldUpc); assert.deepEqual(previous.payloadRedacted, { upc: oldUpc });
    assert.equal(previous.isCurrent, false);
    assert.equal(await prisma.externalIdentifierHistory.count({ where: { releaseId: release.id, previousValue: oldUpc, canonicalValue: newUpc } }), 1);
    assert.equal(await prisma.externalIdentifierHistory.count({ where: { releaseId: release.id, previousValue: { in: oldIsrcs }, canonicalValue: { in: newIsrcs } } }), 2);
    assert.equal(await prisma.externalIdentifierHistory.count({ where: { releaseId: release.id, canonicalValue: 'awaiting_assignment' } }), 0);
    console.log('PASS amendment identifiers: old identities stay locked, pending attempts never inherit old codes, partial and malformed responses do not change displayed codes, completed sets switch atomically, and immutable history remains.');
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
