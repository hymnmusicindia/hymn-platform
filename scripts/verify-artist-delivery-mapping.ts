import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { ensureDireNoteArtistMapping, verifyReleaseArtistMappings } from '../lib/direnote-artist-mapping';
import { buildDireNotePayload, type DireNotePayload } from '../lib/direnote';
import type { Release, ArtistProfile } from '../lib/types';
import { createArtistProfile, listArtistProfilesByUser, updateArtistProfile } from '../lib/db';
import { resolveFeaturedArtistName } from '../lib/featured-artist-requirements';
import { syncDireNoteArtistInformation } from '../lib/direnote-service';
import { persistDireNoteArtistIds } from '../lib/distribution-service';
async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  process.env.DIRENOTE_API_PIN = 'fixture-pin'; process.env.DIRENOTE_CLIENT_ID = 'fixture-client';
  const spotify = 'https://open.spotify.com/artist/52BkE1owdr1Oz5duroCyHL', other = 'https://open.spotify.com/artist/66x9igCk2Vdjrhm1ULpe6r';
  const user = await prisma.user.create({ data: { name: 'Mapping fixture', email: 'mapping@fixture.invalid', googleId: 'mapping-fixture' } });
  const producer = await createArtistProfile({ userId:user.id, name:'Public Artist', isLinked:false, isProducer:true, producerArtistName:'Public Producer' });
  assert.equal(producer.isProducer,true);
  assert.equal(producer.producerArtistName,'Public Producer');
  assert.equal(producer.producerLegalName,null);
  const updatedProducer = await updateArtistProfile(user.id,producer.id,{producerArtistName:'Updated Producer'});
  assert.equal(updatedProducer?.producerArtistName,'Updated Producer');
  const legacyProducer = await prisma.artistCard.create({data:{userId:user.id,artistName:'Legacy Stage Name',role:JSON.stringify({type:'producer',legalName:'Private Legal Name'})}});
  const legacy = (await listArtistProfilesByUser(user.id)).find(profile=>profile.id===legacyProducer.id);
  assert.equal(legacy?.isProducer,true);
  assert.equal(legacy?.producerArtistName,'Legacy Stage Name');
  assert.equal(legacy?.producerLegalName,'Private Legal Name');
  const beforeFeaturedLookup = globalThis.fetch; let featuredCalls=0;
  globalThis.fetch=async (_input,init)=>{
    featuredCalls++; const request=JSON.parse(String(init?.body));
    assert.equal(new URL(String(_input)).pathname,'/list_artists');assert.equal(request.pin,'fixture-pin');
    const artists=request.search==='Known Guest' ? (request.page===2?[{artist_id:778,name:'Known Guest'}]:[]) : request.search==='Ambiguous Guest' ? [{artist_id:779,name:'Ambiguous Guest'},{artist_id:780,name:'Ambiguous Guest'}] : [];
    return new Response(JSON.stringify({success:true,artists,pagination:{has_more:request.search==='Known Guest'&&request.page===1}}),{headers:{'content-type':'application/json'}});
  };
  try {
    assert.equal(await resolveFeaturedArtistName('Known Guest'),'known');assert.equal(featuredCalls,2);
    assert.equal(await resolveFeaturedArtistName('Known Guest'),'known');assert.equal(featuredCalls,2,'shared database cache avoids repeated lookups');
    assert.equal(await resolveFeaturedArtistName('New Guest'),'profile-required');
    assert.equal(await resolveFeaturedArtistName('Ambiguous Guest'),'profile-required');
  } finally { globalThis.fetch=beforeFeaturedLookup; }
  const card = await prisma.artistCard.create({ data: { userId: user.id, artistName: 'Known Artist', spotifyProfileUrl: spotify, spotifyArtistId: '52BkE1owdr1Oz5duroCyHL', direNoteArtistId: '3175' } });
  const release = await prisma.release.create({ data: { userId: user.id, title: 'Mapping test', artistName: card.artistName, genre: 'Pop', releaseDate: new Date() } });
  let remote: string | null = null, writes = 0, reads = 0, timeout = false, apply = true, wrongName = false, edit = false, raceChange = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input), body = JSON.parse(String(init?.body || '{}'));
    assert.equal(body.pin, 'fixture-pin'); assert.equal(body.client_id, 'fixture-client');
    assert.equal(body.artist_id, 3175);
    if (url.endsWith('/check_artist')) {
      reads++; if (edit) { edit = false; await prisma.artistCard.update({ where: { id: card.id }, data: { spotifyProfileUrl: other } }); }
      const response = Response.json({ success: true, artist: { artist_id: 3175, name: wrongName ? 'Unrelated Artist' : 'Known Artist', links: { spotify: remote, apple: null } } });
      if (raceChange) { raceChange = false; remote = other; }
      return response;
    }
    if (url.endsWith('/update_artist')) {
      writes++; assert.equal(body.spotify_url, spotify); assert.equal(body.name, undefined); assert.equal(body.apple_url, undefined);
      if (apply) remote = body.spotify_url;
      if (timeout) throw Error('Lost provider response');
      return Response.json({ success: true, artist: { artist_id: 3175, name: 'Known Artist', links: { spotify: remote, apple: null } } });
    }
    throw Error('No real provider endpoint is allowed in this fixture.');
  };
  try {
    await ensureDireNoteArtistMapping(card.id, release.id); assert.equal(writes, 1); assert.equal(reads, 3);
    assert.equal(await prisma.direNoteLog.count({ where: { action: 'v24_update_artist', success: true } }), 1);
    await ensureDireNoteArtistMapping(card.id, release.id); assert.equal(writes, 1, 'An aligned mapping never sends another update.');
    await prisma.artistCard.update({ where: { id: card.id }, data: { spotifyProfileUrl: null } });
    await ensureDireNoteArtistMapping(card.id, release.id); assert.equal(writes, 1, 'A legacy stored Spotify ID remains an explicit identity without its URL.');
    await prisma.artistCard.update({ where: { id: card.id }, data: { spotifyProfileUrl: spotify } });
    remote = other; await assert.rejects(ensureDireNoteArtistMapping(card.id, release.id), /mapping differs/); assert.equal(writes, 1);
    assert.equal(await prisma.direNoteReconciliationDiscrepancy.count({ where: { releaseId: release.id, severity: 'critical' } }), 1);
    remote = null; wrongName = true; await assert.rejects(ensureDireNoteArtistMapping(card.id, release.id), /could not be verified/); assert.equal(writes, 1); wrongName = false;
    edit = true; await assert.rejects(ensureDireNoteArtistMapping(card.id, release.id), /card changed/); assert.equal(writes, 1);
    await prisma.artistCard.update({ where: { id: card.id }, data: { spotifyProfileUrl: spotify } });
    raceChange = true; await assert.rejects(ensureDireNoteArtistMapping(card.id, release.id), /different artist mapping appeared/); assert.equal(writes, 1, 'Re-read after claiming prevents overwriting a newly populated mapping.'); remote = null;
    await assert.rejects(ensureDireNoteArtistMapping(card.id, release.id, null, Date.now() - 1), /timed out/); assert.equal(writes, 1);
    timeout = true; await assert.rejects(ensureDireNoteArtistMapping(card.id, release.id), /paused/); assert.equal(writes, 2);
    const uncertain = await prisma.direNoteLog.findFirstOrThrow({ where: { action: 'v24_update_artist', responseJson: { path: ['state'], equals: 'unconfirmed' } } });
    timeout = false; await assert.rejects(ensureDireNoteArtistMapping(card.id, release.id), /unconfirmed outcome/); assert.equal(writes, 2, 'Uncertain writes require read-only admin reconciliation, even if a later read matches.');
    await prisma.direNoteLog.update({ where: { id: uncertain.id }, data: { responseJson: { state: 'confirmed' }, success: true } });
    const payload = { artists: [{ name: card.artistName, spotify_url: spotify }], tracks: [{ artists: [{ name: card.artistName, spotify_url: spotify }] }] } as DireNotePayload;
    await verifyReleaseArtistMappings(user.id, release.id, payload); assert.equal(writes, 2);
    await prisma.artistCard.update({ where: { id: card.id }, data: { appleMusicProfileUrl: 'https://music.apple.com/artist/1234' } });
    await assert.rejects(verifyReleaseArtistMappings(user.id, release.id, { ...payload, artists: [{ name: card.artistName, spotify_url: spotify, apple_url: 'https://music.apple.com/artist/9999' }] }), /missing or different/);
    await prisma.artistCard.update({ where: { id: card.id }, data: { appleMusicProfileUrl: null } });
    await assert.rejects(verifyReleaseArtistMappings(user.id, release.id, { ...payload, artists: [{ name: card.artistName }] }), /missing/);
    await prisma.artistCard.create({ data: { userId: user.id, artistName: 'Different Artist', spotifyProfileUrl: other, direNoteArtistId: '3175' } });
    await assert.rejects(ensureDireNoteArtistMapping(card.id, release.id), /conflicting artist cards/);
    await prisma.artistCard.deleteMany({ where: { artistName: 'Different Artist' } });
    remote = null; apply = false; await assert.rejects(ensureDireNoteArtistMapping(card.id, release.id), /awaits verification/);
    assert.equal(await prisma.direNoteLog.count({ where: { action: 'v24_update_artist', responseJson: { path: ['state'], equals: 'unconfirmed' } } }), 1, 'An acknowledged update without read-back proof remains blocked.');
    const profile = { id: card.id, userId: user.id, name: card.artistName, spotifyUrl: spotify } as ArtistProfile;
    const input = { id: release.id, userId: user.id, artistName: card.artistName, tracks: [{ primaryArtist: card.artistName, trackTitle: 'Mapping track' }] } as Release;
    assert.throws(() => buildDireNotePayload(input, { artistProfiles: [profile] }), /Select the saved HYMN artist card/);
    const linked = buildDireNotePayload({ ...input, tracks: [{ ...input.tracks![0], artistProfileIds: [card.id] }] }, { artistProfiles: [profile] });
    assert.equal(linked.artists[0].spotify_url, spotify); assert.equal(linked.tracks[0].artists?.[0].spotify_url, spotify);
    await prisma.direNoteLog.updateMany({ where: { action: 'v24_update_artist', success: false }, data: { responseJson: { state: 'confirmed' }, success: true } });
    apply = true; remote = null;
    await syncDireNoteArtistInformation(card.id, null, release.id);
    assert.equal(remote, spotify, 'Scheduled artist refresh repairs an empty provider mapping as well.');
    remote = other; await syncDireNoteArtistInformation(card.id, null, release.id);
    const review = await prisma.adminTask.findUniqueOrThrow({ where: { eventKey: `release:${release.id}:artist-mapping` } });
    assert.equal(review.status, 'open');
    await prisma.adminTask.update({ where: { id: review.id }, data: { status: 'resolved' } });
    await syncDireNoteArtistInformation(card.id, null, release.id);
    assert.equal((await prisma.adminTask.findUniqueOrThrow({ where: { id: review.id } })).status, 'open', 'Recurring conflicts reopen a resolved review task.');
    const arrival = await prisma.artistCard.create({ data: { userId: user.id, artistName: 'Async Arrival' } });
    const asyncRelease = await prisma.release.create({ data: { userId: user.id, title: 'Async arrival', artistName: arrival.artistName, genre: 'Pop', releaseDate: new Date(), tracks: { create: { title: 'Incoming track', trackNumber: 1, metadata: { artistProfileIds: [arrival.id] } } } } });
    await persistDireNoteArtistIds(asyncRelease.id, [{ name: arrival.artistName, artistId: '6789' }]);
    assert.equal((await prisma.artistCard.findUniqueOrThrow({ where: { id: arrival.id } })).direNoteArtistId, '6789', 'Completed async ingestion binds the provider identity to the selected card.');
    console.log('PASS artist delivery mapping: missing links repaired and verified, no overwrite, identity/name conflicts, concurrent edits, uncertain-write suppression, read-back proof and explicit card association.');
  } finally { globalThis.fetch = original; }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
