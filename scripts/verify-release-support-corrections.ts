import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { createReleaseChangeRequest, reviewReleaseChangeRequest } from '../lib/release-change-requests';
import { previewSupportCorrection, submitSupportCorrection, syncSupportCorrection } from '../lib/release-support-corrections';
import { submitRelease } from '../lib/distribution-service';
import { processAutomaticAmendment } from '../lib/release-amendment-automation';
import { localPrivateStorage } from '../lib/private-storage';
import sharp from 'sharp';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  process.env.DIRENOTE_API_PIN = 'correction-fixture-pin'; process.env.DIRENOTE_CLIENT_ID = 'correction-fixture-client';
  const user = await prisma.user.create({ data: { name: 'Correction owner', email: 'support-correction@fixture.invalid', googleId: 'support-correction' } });
  const stranger = await prisma.user.create({ data: { name: 'Other owner', email: 'support-other@fixture.invalid', googleId: 'support-other' } });
  const release = await prisma.release.create({ data: { userId: user.id, title: 'Existing recording', artistName: 'Original Artist', genre: 'Pop', releaseDate: new Date('2026-01-01'), status: 'LIVE', upc: '3473620314135', tracks: { create: { trackNumber: 1, title: 'Existing recording', primaryArtist: 'Original Artist', isrc: 'INDN22602494', audioUrl: '/original.wav' } } }, include: { tracks: true } });
  const trackId = release.tracks[0].id;
  const oldAttempt = await prisma.distributionSubmissionAttempt.create({ data: { releaseId: release.id, state: 'submitted', isCurrent: true, idempotencyKey: 'correction-original-attempt', payloadHash: 'immutable', upc: release.upc, payloadRedacted: { original: true } } });
  const make = (supportCorrection: unknown, userId = user.id) => createReleaseChangeRequest({ releaseId: release.id, userId, requestType: 'metadata_update', reason: 'Please correct this existing recording.', requestedChanges: { supportCorrection: supportCorrection as any } });
  await assert.rejects(make({ action: 'request_add_artist', trackId, artist_name: 'Guest', artist_type: 'featuring' }, stranger.id));
  await assert.rejects(make({ action: 'request_add_artist', trackId: 999999, artist_name: 'Guest', artist_type: 'featuring' }));
  await assert.rejects(make({ action: 'request_replace_artist', trackId, artist_name: 'Original Artist', new_artist_name: 'Original Artist' }), /different artist/);
  const request = await make({ action: 'request_add_artist', trackId, artist_name: 'Guest', artist_type: 'featuring' });
  assert.equal((await make({ action: 'request_add_artist', trackId, artist_name: 'Guest', artist_type: 'featuring' })).id, request.id, 'Retry returns the same request.');
  await assert.rejects(make({ action: 'request_meta_not_live', trackId }), /already active/);
  await assert.rejects(previewSupportCorrection(request.id), /Approve/);
  await reviewReleaseChangeRequest({ id: request.id, decision: 'approved', note: 'Reviewed the existing recording correction.' });
  const preview = await previewSupportCorrection(request.id);
  assert.equal(preview.locked.upc, release.upc); assert.equal(preview.payload.isrc, release.tracks[0].isrc);
  const nativeFetch = globalThis.fetch; let writes = 0; let status = 'pending'; let uncertain = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input); assert.ok(!url.includes('ingest'), 'Amendments must never ingest content.');
    if (url.endsWith('/request_cover_art_change')) {
      writes++; assert.ok(init?.body instanceof FormData); assert.equal(init.body.get('isrc'), 'INDN22602494'); assert.ok(init.body.get('file') instanceof Blob);
      return Response.json({ success: true, request: { request_id: 72, status: 'pending' } });
    }
    const body = JSON.parse(String(init?.body)); assert.equal(body.pin, 'correction-fixture-pin');
    if (url.endsWith('/list_support_requests')) return Response.json({ success: true, requests: [{ request_id: 71, isrc: 'INDN22602494', status }] });
    assert.ok(url.endsWith('/request_add_artist')); writes++; assert.equal(body.isrc, 'INDN22602494'); assert.equal(body.artist_name, 'Guest'); assert.equal(body.upc, undefined);
    if (uncertain) throw Error('Simulated timeout after provider receipt');
    return Response.json({ success: true, request: { request_id: 71, status: 'pending' } });
  };
  try {
    await assert.rejects(submitSupportCorrection(request.id, 'stale'), /Preview/);
    assert.equal((await submitSupportCorrection(request.id, preview.revision)).submitted, true);
    await assert.rejects(submitSupportCorrection(request.id, preview.revision)); assert.equal(writes, 1);
    assert.equal((await syncSupportCorrection(request.id)).status, 'submitted_to_partner');
    status = 'approved'; assert.equal((await syncSupportCorrection(request.id)).status, 'processing_manually', 'Partner approval is not store confirmation.');
    const unchanged = await prisma.release.findUniqueOrThrow({ where: { id: release.id }, include: { tracks: true } });
    assert.equal(unchanged.upc, release.upc); assert.equal(unchanged.status, 'LIVE'); assert.equal(unchanged.releaseDate.toISOString(), release.releaseDate.toISOString()); assert.equal(unchanged.tracks[0].isrc, 'INDN22602494'); assert.equal(unchanged.tracks[0].primaryArtist, 'Original Artist');
    assert.equal(await prisma.distributionSubmissionAttempt.count({ where: { releaseId: release.id } }), 1);
    assert.deepEqual((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: oldAttempt.id } })).payloadRedacted, { original: true });
    await assert.rejects(submitRelease(release.id, { amendmentRequestId: request.id }), /never content ingestion/);
    await reviewReleaseChangeRequest({ id: request.id, decision: 'completed', note: 'Verified credited guest on store listing.', providerReference: 'support:71' });
    assert.equal(((await prisma.track.findUniqueOrThrow({ where: { id: trackId } })).metadata as { featuredArtists: string }).featuredArtists, 'Guest');
    const jpeg = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#222' } }).jpeg().toBuffer();
    const asset = await localPrivateStorage.upload({ ownerUserId: user.id, releaseId: release.id, assetType: 'private_unreleased_artwork', fileName: 'replacement.jpg', mimeType: 'image/jpeg', bytes: jpeg });
    const art = await make({ action: 'request_cover_art_change', trackId, assetId: asset.id });
    await reviewReleaseChangeRequest({ id: art.id, decision: 'approved', note: 'Artwork reviewed against specifications.' });
    assert.equal((await submitSupportCorrection(art.id, (await previewSupportCorrection(art.id)).revision)).submitted, true);
    await prisma.releaseChangeRequest.update({ where: { id: art.id }, data: { status: 'completed' } });
    uncertain = true;
    const failed = await make({ action: 'request_add_artist', trackId, artist_name: 'Guest', artist_type: 'featuring' });
    await reviewReleaseChangeRequest({ id: failed.id, decision: 'approved', note: 'Review timeout scenario fixture.' });
    const plan = await previewSupportCorrection(failed.id);
    assert.equal((await submitSupportCorrection(failed.id, plan.revision)).submitted, false);
    await assert.rejects(reviewReleaseChangeRequest({ id: failed.id, decision: 'failed', note: 'Attempt to close an unknown provider outcome.' }), /unresolved/);
    await prisma.releaseChangeRequest.update({ where: { id: failed.id }, data: { status: 'approved' } });
    await assert.rejects(submitSupportCorrection(failed.id, (await previewSupportCorrection(failed.id)).revision), /already recorded/);
    const legacy = await prisma.releaseChangeRequest.create({ data: { releaseId: release.id, requestedByUserId: user.id, requestType: 'metadata_update', reason: 'Legacy queued wizard amendment', requestedChanges: { automaticDelivery: true, wizard_metadata: {} } } });
    await processAutomaticAmendment(legacy.id);
    assert.equal((await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id: legacy.id } })).status, 'processing_manually');
    assert.equal(writes, 3);
    assert.ok(await prisma.notification.count({ where: { userId: user.id, type: 'release_amendment' } }) > 0);
    console.log('Existing-recording correction contracts, ownership, multipart upload, receipts, uncertain-send protection, manual verification, immutable identifiers and legacy ingestion guard passed.');
  } finally { globalThis.fetch = nativeFetch; }
}
main().finally(() => prisma.$disconnect());
