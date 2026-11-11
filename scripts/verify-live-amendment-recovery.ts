import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { recoverLegacyLiveRelease } from '../lib/release-live-recovery';
import { createReleaseChangeRequest,reviewReleaseChangeRequest } from '../lib/release-change-requests';
import { previewSupportCorrection } from '../lib/release-support-corrections';

async function main(){
  assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  process.env.DIRENOTE_CLIENT_ID='recovery-fixture';process.env.DIRENOTE_API_PIN='recovery-fixture';
  const owner=await prisma.user.create({data:{name:'Recovery owner',email:'live-recovery@fixture.invalid',googleId:'live-recovery'}});
  const release=await prisma.release.create({data:{userId:owner.id,title:'Original live song',artistName:'Recovery Artist',genre:'Pop',status:'CHANGES_REQUESTED',upc:'3473620320396',releaseDate:new Date('2026-10-25'),tracks:{create:{trackNumber:1,title:'Original live song',primaryArtist:'Recovery Artist',isrc:'INDN22602494',audioUrl:'/original.wav'}}},include:{tracks:true}});
  const original=await prisma.distributionSubmissionAttempt.create({data:{releaseId:release.id,upc:'3473620314135',state:'submitted',isCurrent:false,idempotencyKey:'recovery-original',payloadHash:'original-immutable',payloadRedacted:{original:true}}});
  const request=await prisma.releaseChangeRequest.create({data:{releaseId:release.id,requestedByUserId:owner.id,requestType:'metadata_update',status:'submitted_to_partner',reason:'Legacy duplicate amendment',requestedChanges:{wizard_metadata:{},locked:{upc:original.upc}}}});
  const duplicate=await prisma.distributionSubmissionAttempt.create({data:{releaseId:release.id,upc:release.upc,state:'submitted',isCurrent:true,idempotencyKey:'recovery-duplicate',payloadHash:'duplicate-immutable',responseRedacted:{amendmentRequestId:request.id}}});
  await prisma.auditLog.create({data:{action:'RELEASE_AMENDMENT_APPLIED',entity:'release',entityId:String(release.id),metadata:{requestId:request.id,previous:{title:release.title,artistName:release.artistName,genre:release.genre,artworkUrl:'/original.jpg',audioUrl:'/original.wav',metadata:{artistName:release.artistName},tracks:[{id:release.tracks[0].id,title:release.title,primaryArtist:release.artistName,audioUrl:'/original.wav',metadata:{},contributors:[{role:'producer',artistName:'',legalName:''}]}]}}}});
  const native=global.fetch;let mismatch=false,originalLive=true;
  global.fetch=async(url,options)=>{
    const endpoint=new URL(String(url)).pathname;
    assert.equal(endpoint,'/check_release_status','Recovery must never ingest, update artists, or send a correction.');
    const body=JSON.parse(String(options?.body));const old=body.upc===original.upc;
    return Response.json({success:true,release:{upc_code:body.upc,track_release_date:old?'2026-09-14':'2026-10-25'},tracks:[{isrc:mismatch?'INDN22609999':'INDN22602494',status:old?(originalLive?'Live':'Pending'):'Rejected',artist:{name:'Recovery Artist'}}]});
  };
  try{
    mismatch=true;await assert.rejects(recoverLegacyLiveRelease(release.id,duplicate.id),/exact UPC/);mismatch=false;
    originalLive=false;assert.equal(await recoverLegacyLiveRelease(release.id,duplicate.id),false);originalLive=true;
    assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).status,'CHANGES_REQUESTED');
    assert.equal(await recoverLegacyLiveRelease(release.id,duplicate.id),true);
    const restored=await prisma.release.findUniqueOrThrow({where:{id:release.id}});
    assert.equal(restored.status,'LIVE');assert.equal(restored.upc,original.upc);assert.equal(restored.releaseDate.toISOString().slice(0,10),'2026-09-14');
    assert.equal((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({where:{id:original.id}})).isCurrent,true);
    assert.equal((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({where:{id:duplicate.id}})).isCurrent,false);
    assert.equal((await prisma.releaseChangeRequest.findUniqueOrThrow({where:{id:request.id}})).status,'cancelled');
    assert.equal(await recoverLegacyLiveRelease(release.id,duplicate.id),false,'Recovery is idempotent.');
    assert.equal((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({where:{id:original.id}})).payloadHash,'original-immutable');
    const mapping={trackId:release.tracks[0].id,artistName:'Recovery Artist',spotifyArtistUrl:'https://open.spotify.com/artist/0123456789012345678901',spotifyTrackUrl:'https://open.spotify.com/track/0123456789012345678901'};
    const make=(profileMapping:unknown)=>createReleaseChangeRequest({releaseId:release.id,userId:owner.id,requestType:'metadata_update',reason:'My live song is on the wrong artist profile.',requestedChanges:{profileMapping:profileMapping as any}});
    await assert.rejects(make({...mapping,artistName:'Uncredited Artist'}),/already credited/);
    await assert.rejects(make({...mapping,spotifyArtistUrl:'https://evil.example/artist'}));
    const saved=await make(mapping);assert.equal((await make(mapping)).id,saved.id);
    await reviewReleaseChangeRequest({id:saved.id,decision:'approved',note:'Reviewed the Spotify profile mismatch evidence.'});
    await assert.rejects(previewSupportCorrection(saved.id),/content-mismatch/);
    await assert.rejects(reviewReleaseChangeRequest({id:saved.id,decision:'submitted_to_partner',note:'Sending this as a new release is incorrect.',providerReference:'ingest:123'}),/Spotify content-mismatch/);
    await reviewReleaseChangeRequest({id:saved.id,decision:'submitted_to_partner',note:'Spotify case submitted for the original recording.',providerReference:'spotify:CASE123'});
    await reviewReleaseChangeRequest({id:saved.id,decision:'completed',note:'Verified the existing track now appears on the correct Spotify artist profile.'});
    assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).status,'LIVE');
    assert.equal(await prisma.distributionSubmissionAttempt.count({where:{releaseId:release.id}}),2);

    console.log('PASS legacy live recovery: independent UPC/ISRC proof, rejected duplicate isolation, original identifiers/date/current attempt, idempotence; Spotify profile-mismatch validation, tracked case and zero ingestion.');
  }finally{global.fetch=native;}
}
main().finally(()=>prisma.$disconnect());
