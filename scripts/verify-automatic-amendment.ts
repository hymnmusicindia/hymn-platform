import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { getDetailedReleaseById, deserializeRelease } from '../lib/distribution-db';
import { buildDireNotePayloadForRelease } from '../lib/distribution-service';
import { assertReleaseArtistVerification } from '../lib/release-artist-verification';
import { amendmentSourceRevision } from '../lib/release-amendment-revision';
import { processAutomaticAmendment } from '../lib/release-amendment-automation';
import { pollDireNoteIngestJobs } from '../lib/direnote-ingest-jobs';
import { projectWizardAmendment } from '../lib/release-amendment-proposal';
import { completeArtistAmendment } from '../lib/release-artist-amendment';
async function main() {
 assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
 process.env.DIRENOTE_API_PIN='fixture-pin';process.env.DIRENOTE_CLIENT_ID='fixture-client';
 const spotify='https://open.spotify.com/artist/52BkE1owdr1Oz5duroCyHL';
 const oldUpc='3473620314135', isrc='INDN22602494';
 const originalFetch=globalThis.fetch;
 let calls=0, mode='new';
 try { for(const scenario of ['new','same','direct','failed','invalid']) {
  mode=scenario;
  const user = await prisma.user.create({ data: { email: `wizard-${scenario}@fixture.invalid`, name: 'Amendment fixture', googleId: `wizard-${scenario}-fixture` } });
  const card = await prisma.artistCard.create({ data: { userId: user.id, artistName: 'Fixture Artist', spotifyProfileUrl: spotify, spotifyArtistId: spotify.split('/').pop(), instagramUrl: 'https://instagram.com/fixture_artist', direNoteArtistId: '8100' } });
  const release = await prisma.release.create({ data: {
    userId: user.id, artistProfileId: card.id, title: 'Amendment recording', artistName: card.artistName, genre: 'Pop', releaseType: 'single', releaseDate: new Date('2026-01-01'), status: 'LIVE', paymentStatus: 'paid', artworkUrl: 'https://cdn.example.test/cover.jpg', upc: oldUpc,
    metadata: { releaseTitle: 'Amendment recording', releaseDate: '2026-01-01', releaseTiming: 'quick_release', language: 'Hindi', secondaryGenre: 'Indie Pop', labelName: 'Fixture Records', copyrightOwner: '2026 Fixture Records', publishingRights: '2026 Fixture Artist', contentType: 'original', platforms: ['Spotify'], territory: 'Worldwide', ownershipConfirmed: true, noUnauthorizedSamples: true, collaboratorsCredited: true, platformCompliant: true, hymnNotLiable: true, agreedToTerms: true, falseMetadataAcknowledged: true, releasePreviouslyReleased: false },
    tracks: { create: { title: 'Amendment recording', trackNumber: 1, primaryArtist: card.artistName, audioUrl: 'https://cdn.example.test/track.wav', isrc, metadata: { artistProfileIds: [card.id], language: 'Hindi', version: 'Original', songwriters: 'Fixture Artist', composers: 'Fixture Artist', producers: 'Fixture Artist', duration: '180', explicitContent: false } } }
  }, include: { tracks: true } });
  await assertReleaseArtistVerification(user.id, release.id, undefined, true);
  const detailed = (await getDetailedReleaseById(release.id))!;
  const oldPayload = await buildDireNotePayloadForRelease(detailed);
  const oldAttempt = await prisma.distributionSubmissionAttempt.create({ data: { releaseId: release.id, state: 'submitted', isCurrent: true, startedAt: new Date(0), idempotencyKey: `wizard-${scenario}-old`, payloadHash: 'old', upc: oldUpc, providerStatus: 'live', payloadRedacted: JSON.parse(JSON.stringify(oldPayload)), trackIdentifiers: release.tracks.map(track => ({ id: track.id, isrc })) } });
  const proposed = { editReleaseId:release.id, artistName:'Fixture Artist', releaseTitle:'Amended recording', releaseType:'single', releaseDate:'2026-11-20', recordLabelName:'Fixture Records', primaryGenre:'Pop', secondaryGenre:'Indie Pop', language:'Hindi', territory:'Worldwide', upcCode:release.upc!, releaseTiming:'quick_release', platforms:['Spotify'], copyrightOwner:'Fixture Artist', publishingRights:'Fixture Artist',legal:Object.fromEntries(['ownershipConfirmation','noInfringement','collaboratorsCredited','platformGuidelines','hymnNotLiable','termsAccepted','falseMetadataAcknowledged','fraudWarningAccepted'].map(k=>[k,true])),paymentModel:'one_time',plan:'one_time',artworkFileKey:'artwork',existingArtworkUrl:'https://cdn.example.test/cover.jpg',tracks:[{trackNumber:1,trackTitle:'Amended recording',primaryArtist:'Fixture Artist',artistProfileIds:[card.id],songwriters:'Fixture Artist',composers:'Fixture Artist',producers:'Fixture Artist',isrc:'INDN22602494',isCover:false,coverLicenseConfirmed:false,audioFileKey:'audio-0',existingAudioUrl:'https://cdn.example.test/restored.wav',duration:'04:12',explicitContent:false,dolbyAtmos:false}] };

  const changes={automaticDelivery:true,fingerprint:`wizard-${scenario}`,sourceRevision:amendmentSourceRevision(detailed),wizard_metadata:{requested:proposed}};
  assert.equal(projectWizardAmendment(detailed,changes).releaseTitle,'Amended recording');
  assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).title,'Amendment recording','Projection must not mutate live catalogue');
  const changedSource={...detailed,releaseTitle:'Another edit'};assert.throws(()=>projectWizardAmendment(changedSource,changes),/content changed/);
  if(scenario==='invalid') await prisma.release.update({where:{id:release.id},data:{paymentStatus:'pending'}});
  const request=await prisma.releaseChangeRequest.create({data:{releaseId:release.id,requestedByUserId:user.id,requestType:'metadata_update',status:'submitted',reason:'Update the release from its prefilled wizard.',requestedChanges:JSON.parse(JSON.stringify(changes))}});
  const startCalls=calls;
  globalThis.fetch=async(input,init)=>{
   const url=String(input),body=JSON.parse(String(init?.body||'{}'));
   if(body.artist_id)return Response.json({success:true,artist:{artist_id:8100,name:card.artistName,links:{spotify}}});
   if(url.endsWith('/ingest_content')){calls++;assert.equal(body.albumname,'Amended recording');assert.equal(body.upc,undefined);assert.equal(body.tracks[0].isrc,isrc);assert.equal(body.releasePreviouslyReleased,'Yes');if(scenario==='direct')return Response.json({success:true,upc_code:'3473620319079',tracks:[{track_number:1,track_name:'Amended recording',isrc:'INDN22602495'}]});return Response.json({success:true,job_id:`wizard-${scenario}`,idempotency_key:body.idempotency_key,status:'queued'},{status:202});}
   if(url.endsWith('/ingest_status'))return Response.json(scenario==='failed'?{success:true,job_id:`wizard-${scenario}`,status:'failed',error:'Audio rejected fixture',can_resubmit:false}:{success:true,job_id:`wizard-${scenario}`,status:'completed',result:{album_name:'Amended recording',upc_code:scenario==='same'?oldUpc:'3473620319079',track_count:1,tracks:[{track_number:1,track_name:'Amended recording',isrc:scenario==='same'?isrc:'INDN22602495'}]}});
   throw Error(`Unexpected network call: ${new URL(url).pathname}`);
  };
  await processAutomaticAmendment(request.id);
  const received=await prisma.releaseChangeRequest.findUniqueOrThrow({where:{id:request.id}});
  if(scenario==='invalid') {assert.equal(calls,startCalls);assert.equal(received.status,'processing_manually');assert.equal(await prisma.adminTask.count({where:{eventKey:`amendment:${request.id}:manual-qc`}}),1);continue;}
  assert.equal(received.status,'submitted_to_partner',received.adminNote||'');assert.equal(calls,startCalls+1);
  await processAutomaticAmendment(request.id);assert.equal(calls,startCalls+1,'Replays cannot send a second package');
  const pending=await prisma.release.findUniqueOrThrow({where:{id:release.id},include:{tracks:true}});assert.equal(pending.upc,scenario==='direct'?'3473620319079':oldUpc);assert.equal(pending.tracks[0].isrc,scenario==='direct'?'INDN22602495':isrc);assert.equal(pending.title,'Amended recording');
  const poll=scenario==='direct'?{completed:1}:await pollDireNoteIngestJobs({limit:1,releaseId:release.id});
  const outcome=await prisma.release.findUniqueOrThrow({where:{id:release.id},include:{tracks:true}});
  if(scenario==='failed') {assert.equal('failed' in poll && poll.failed,1);assert.equal(outcome.status,'LIVE');assert.equal(outcome.title,'Amendment recording');assert.equal(outcome.tracks[0].audioUrl,'https://cdn.example.test/track.wav');assert.equal(outcome.upc,oldUpc);assert.equal((await prisma.releaseChangeRequest.findUniqueOrThrow({where:{id:request.id}})).status,'failed');assert.equal(await prisma.adminTask.count({where:{eventKey:`amendment:${request.id}:manual-qc`}}),1);}
  else {assert.equal(poll.completed,1,JSON.stringify(poll));assert.equal(outcome.upc,scenario==='same'?oldUpc:'3473620319079');assert.equal(outcome.tracks[0].isrc,scenario==='same'?isrc:'INDN22602495');assert.equal((outcome.metadata as any).amendmentQc.status,'passed');const attempt=await prisma.distributionSubmissionAttempt.findFirstOrThrow({where:{releaseId:release.id,isCurrent:true}});await completeArtistAmendment(release.id,attempt.id,[{status:'Live'}]);assert.equal((await prisma.releaseChangeRequest.findUniqueOrThrow({where:{id:request.id}})).status,'completed');}
  const history=await prisma.distributionSubmissionAttempt.findUniqueOrThrow({where:{id:oldAttempt.id}});assert.equal(history.upc,oldUpc);assert.deepEqual(history.payloadRedacted,JSON.parse(JSON.stringify(oldPayload)));
 } } finally {globalThis.fetch=originalFetch;}
 console.log('PASS automatic wizard amendments: proposed payload, concurrency guard, one delivery, old/new identifier responses, queued identifier locks, automatic QC, verified completion, rejection rollback, manual QC and immutable delivery history.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
