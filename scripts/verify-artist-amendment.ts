import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { submitRelease, buildDireNotePayloadForRelease } from '../lib/distribution-service';
import { getDetailedReleaseById } from '../lib/distribution-db';
import { assertReleaseArtistVerification } from '../lib/release-artist-verification';
import { artistAmendmentPayload, loadArtistAmendment, completeArtistAmendment } from '../lib/release-artist-amendment';
import { pollDireNoteIngestJobs } from '../lib/direnote-ingest-jobs';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  process.env.DIRENOTE_API_PIN = 'fixture-pin'; process.env.DIRENOTE_CLIENT_ID = 'fixture-client';
  const original = globalThis.fetch;
  const spotify = 'https://open.spotify.com/artist/52BkE1owdr1Oz5duroCyHL', desired = 'https://open.spotify.com/artist/0cevmXPSNfo7KO9xeE7M3m';
  const oldUpc = '3473620314135', newUpc = '3473620319079', isrc = 'INDN22602494';
  const user = await prisma.user.create({ data: { email: 'artist-amendment@fixture.invalid', name: 'Amendment fixture', googleId: 'artist-amendment-fixture' } });
  const card = await prisma.artistCard.create({ data: { userId: user.id, artistName: 'Fixture Artist', spotifyProfileUrl: spotify, spotifyArtistId: spotify.split('/').pop(), instagramUrl: 'https://instagram.com/fixture_artist', direNoteArtistId: '8100' } });
  const release = await prisma.release.create({ data: {
    userId: user.id, artistProfileId: card.id, title: 'Amendment recording', artistName: card.artistName, genre: 'Pop', releaseType: 'single', releaseDate: new Date('2026-01-01'), status: 'LIVE', paymentStatus: 'paid', artworkUrl: 'https://cdn.example.test/cover.jpg', upc: oldUpc,
    metadata: { releaseTitle: 'Amendment recording', releaseDate: '2026-01-01', releaseTiming: 'quick_release', language: 'Hindi', secondaryGenre: 'Indie Pop', labelName: 'Fixture Records', copyrightOwner: '2026 Fixture Records', publishingRights: '2026 Fixture Artist', contentType: 'original', platforms: ['Spotify'], territory: 'Worldwide', ownershipConfirmed: true, noUnauthorizedSamples: true, collaboratorsCredited: true, platformCompliant: true, hymnNotLiable: true, agreedToTerms: true, falseMetadataAcknowledged: true, releasePreviouslyReleased: false },
    tracks: { create: { title: 'Amendment recording', trackNumber: 1, primaryArtist: card.artistName, audioUrl: 'https://cdn.example.test/track.wav', isrc, metadata: { artistProfileIds: [card.id], language: 'Hindi', version: 'Original', songwriters: 'Fixture Artist', composers: 'Fixture Artist', producers: 'Fixture Artist', duration: '180', explicitContent: false } } }
  }, include: { tracks: true } });
  await assertReleaseArtistVerification(user.id, release.id, undefined, true);
  const detailed = (await getDetailedReleaseById(release.id))!;
  const oldPayload = await buildDireNotePayloadForRelease(detailed);
  const oldAttempt = await prisma.distributionSubmissionAttempt.create({ data: { releaseId: release.id, state: 'submitted', isCurrent: true, startedAt: new Date(0), idempotencyKey: 'artist-amendment-old', payloadHash: 'old', upc: oldUpc, providerStatus: 'live', payloadRedacted: JSON.parse(JSON.stringify(oldPayload)), trackIdentifiers: release.tracks.map(track => ({ id: track.id, isrc })) } });
  const request = await prisma.releaseChangeRequest.create({ data: { releaseId: release.id, requestedByUserId: user.id, requestType: 'metadata_update', status: 'submitted', reason: 'Correct the Spotify profile mapping.', requestedChanges: { spotify_artist_url: { current: spotify, requested: desired } } } });
  await assert.rejects(submitRelease(release.id, { amendmentRequestId: request.id }), /Approve/);
  await prisma.releaseChangeRequest.update({ where: { id: request.id }, data: { status: 'approved' } });
  const amendment = await loadArtistAmendment(detailed, request.id);
  const planned = artistAmendmentPayload(oldPayload, amendment, '2026-01-01');
  assert.equal(planned.upc, undefined); assert.equal(planned.tracks[0].isrc, isrc);
  assert.equal(planned.releasePreviouslyReleased, 'Yes'); assert.equal(planned.tracks[0].previouslyReleased, 'Yes');
  assert.equal(planned.originalReleaseDate, '2026-01-01');
  let ingests = 0, failJob = false, expectedSpotify = desired;
  const emailsBefore = await prisma.emailLog.count();
  globalThis.fetch = async (input, init) => {
    const url = String(input); const body = JSON.parse(String(init?.body || '{}'));
    assert.equal(body.client_id, 'fixture-client'); assert.equal(body.pin, 'fixture-pin');
    if (url.endsWith('/ingest_content')) {
      ingests++; assert.equal(body.upc, undefined); assert.equal(body.tracks[0].isrc, isrc); assert.equal(body.artists[0].spotify_url, expectedSpotify); assert.equal(body.tracks[0].artists[0].spotify_url, expectedSpotify); assert.equal(body.releasePreviouslyReleased, 'Yes');
      return Response.json({ success: true, job_id: 'artist-amendment-job', idempotency_key: body.idempotency_key, status: 'queued' }, { status: 202 });
    }
    if (url.endsWith('/ingest_status')) return Response.json(failJob ? { success: true, job_id: 'artist-amendment-job', status: 'failed', error: 'Rejected amendment fixture', can_resubmit: false } : { success: true, job_id: 'artist-amendment-job', status: 'completed', result: { album_name: release.title, upc_code: newUpc, track_count: 1, tracks: [{ track_number: 1, track_name: release.title, isrc }], artists: [{ name: card.artistName, artist_id: 8200 }] } });
    throw Error(`Unexpected network call: ${new URL(url).pathname}`);
  };
  try {
    const accepted = await submitRelease(release.id, { amendmentRequestId: request.id });
    assert.equal(accepted.submitted, true, JSON.stringify(accepted)); assert.equal(ingests, 1);
    assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: release.id } })).upc, oldUpc);
    assert.equal((await prisma.track.findUniqueOrThrow({ where: { id: release.tracks[0].id } })).isrc, isrc);
    assert.equal((await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'submitted_to_partner');
    const replay = await submitRelease(release.id, { amendmentRequestId: request.id });
    assert.equal(replay.submitted, true); assert.equal(ingests, 1, 'An accepted amendment cannot be delivered twice.');
    const poll = await pollDireNoteIngestJobs({ limit: 1, releaseId: release.id });
    assert.equal(poll.completed, 1, JSON.stringify(poll));
    const updated = await prisma.release.findUniqueOrThrow({ where: { id: release.id }, include: { tracks: true } });
    assert.equal(updated.upc, newUpc); assert.equal(updated.tracks[0].isrc, isrc, 'Use the actual returned recording identifier.');
    assert.equal((updated.metadata as Record<string, unknown>).releasePreviouslyReleased, false, 'The internal re-release flag is not exposed as a changed customer declaration.');
    const savedCard = await prisma.artistCard.findUniqueOrThrow({ where: { id: card.id } });
    assert.equal(savedCard.spotifyProfileUrl, desired); assert.equal(savedCard.direNoteArtistId, '8200');
    const historical = await prisma.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: oldAttempt.id } });
    assert.equal(historical.upc, oldUpc); assert.deepEqual(historical.payloadRedacted, JSON.parse(JSON.stringify(oldPayload)));
    const events = await prisma.releaseChangeRequestEvent.findMany({ where: { requestId: request.id } });
    assert.equal(events.filter(event => Boolean((event.metadata as Record<string, unknown> | null)?.assignedAttemptId)).length, 1);
    const currentAttempt = await prisma.distributionSubmissionAttempt.findFirstOrThrow({ where: { releaseId: release.id, isCurrent: true } });
    await completeArtistAmendment(release.id, currentAttempt.id, [{ status: 'Live', artist: { name: card.artistName, links: { spotify } } }]);
    assert.equal((await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'submitted_to_partner', 'An incorrect final store profile cannot complete the amendment.');
    await completeArtistAmendment(release.id, currentAttempt.id, [{ status: 'Live', artist: { name: card.artistName, links: { spotify: desired } } }]);
    assert.equal((await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'completed');
    await prisma.release.update({ where: { id: release.id }, data: { status: 'LIVE' } });
    await prisma.distributionSubmissionAttempt.updateMany({ where: { releaseId: release.id }, data: { startedAt: new Date(0) } });
    await prisma.distributionSubmissionAttempt.update({ where: { id: currentAttempt.id }, data: { providerStatus: 'live' } });
    failJob = true; expectedSpotify = 'https://open.spotify.com/artist/66x9igCk2Vdjrhm1ULpe6r';
    const failedRequest = await prisma.releaseChangeRequest.create({ data: { releaseId: release.id, requestedByUserId: user.id, requestType: 'metadata_update', status: 'approved', reason: 'Failure rollback fixture', requestedChanges: { spotify_artist_url: { requested: expectedSpotify } } } });
    assert.equal((await submitRelease(release.id, { amendmentRequestId: failedRequest.id })).submitted, true);
    const failedPoll = await pollDireNoteIngestJobs({ limit: 1, releaseId: release.id }); assert.equal(failedPoll.failed, 1, JSON.stringify(failedPoll));
    const retained = await prisma.release.findUniqueOrThrow({ where: { id: release.id }, include: { tracks: true } });
    assert.equal(retained.status, 'LIVE'); assert.equal(retained.upc, newUpc); assert.equal(retained.tracks[0].isrc, isrc);
    assert.equal((await prisma.distributionSubmissionAttempt.findFirstOrThrow({ where: { releaseId: release.id, isCurrent: true } })).id, currentAttempt.id);
    assert.equal((await prisma.releaseArtistIdentity.findUniqueOrThrow({ where: { releaseId_artistCardId: { releaseId: release.id, artistCardId: card.id } } })).spotifyUrl, desired);
    assert.equal((await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id: failedRequest.id } })).status, 'failed');
    assert.equal(await prisma.emailLog.count({ where: { template: { not: 'release_amendment_update' } } }), emailsBefore, 'Amendments do not enqueue misleading ordinary release-status emails.');
    assert(await prisma.emailLog.count({ where: { template: 'release_amendment_update' } }) >= 4, 'Dedicated amendment updates must be durable.');
    console.log('PASS live artist amendment: approval, internal re-release flags, supplied ISRC, assigned UPC, mapping at all levels, queued locks, scoped polling, replay protection, verified final profile, rollback of failed amendments, dedicated amendment notifications and immutable history.');
  } finally { globalThis.fetch = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
