import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { homeReleaseShowcase } from '../lib/public-home-data';
import { getLibraryAssets } from '../lib/user-library';
async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const owner = await prisma.user.create({ data: { name: 'Library owner', email: 'library@site-load.fixture.invalid', googleId: randomUUID() } });
  const other = await prisma.user.create({ data: { name: 'Other owner', email: 'other@site-load.fixture.invalid', googleId: randomUUID() } });
  const releases = [];
  for (let index = 0; index < 15; index++) releases.push(await prisma.release.create({ data: { userId: owner.id, title: `Public release ${index}`, artistName: 'Actual artist', genre: 'Pop', releaseDate: new Date('2026-01-01'), status: index === 0 ? 'DRAFT' : 'LIVE', archivedAt: index === 1 ? new Date() : null, artworkUrl: '/api/assets/7/download', metadata: { releaseTitle: `Public title ${index}`, privateNotes: 'PRIVATE RECORD DETAILS' } } }));
  const showcase = await homeReleaseShowcase(); assert.equal(showcase.length, 12); assert.ok(!JSON.stringify(showcase).includes('PRIVATE RECORD DETAILS')); assert.ok(!showcase.some(row => [releases[0].id, releases[1].id].includes(row.id))); assert.equal(showcase[0].artworkUrl, `/api/releases/${showcase[0].id}/artwork?filename=cover.jpg`);
  const selected = await homeReleaseShowcase([releases[5].id, releases[2].id, releases[0].id, releases[1].id]); assert.deepEqual(selected.map(row => row.id), [releases[5].id, releases[2].id]);
  const base = { assetType: 'private_audio_master', storageProvider: 'local', originalFilename: 'My original.wav', safeFilename: 'my-original.wav', mimeType: 'audio/wav', byteSize: 34000000, checksum: 'fixture-checksum', accessClassification: 'private', uploadStatus: 'ready' };
  const own = await prisma.storedAsset.create({ data: { ...base, ownerUserId: owner.id, objectKey: randomUUID(), releaseId: releases[2].id } });
  await prisma.storedAsset.create({ data: { ...base, ownerUserId: other.id, objectKey: randomUUID() } });
  await prisma.storedAsset.create({ data: { ...base, ownerUserId: owner.id, objectKey: randomUUID(), deletedAt: new Date() } });
  await prisma.storedAsset.create({ data: { ...base, ownerUserId: owner.id, objectKey: randomUUID(), uploadStatus: 'pending' } });
  const files = await getLibraryAssets(owner.id); assert.equal(files.length, 1); assert.equal(files[0].id, own.id); assert.equal(files[0].released, true); assert.match(files[0].audioUrl, new RegExp(`/api/assets/${own.id}/download`)); assert.ok(!('objectKey' in files[0]));
  console.log('PASS bounded public showcase, exact featured order, draft/archive exclusion, private metadata exclusion and owner-scoped ready library files.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
