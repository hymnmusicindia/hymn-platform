import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { saveReleaseTracks } from '../lib/release-track-save';
import { syncReleaseContributions } from '../lib/release-contributor-sync';

async function main() {
  assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const user=await prisma.user.create({data:{name:'Music master fixture',email:'masters@fixture.invalid',googleId:'music-masters'}});
  const release=await prisma.release.create({data:{userId:user.id,title:'Master sequence fixture',artistName:'Fixture',genre:'Pop',releaseDate:new Date('2099-01-01')}});
  const rows=['Alpha','Beta','Gamma'].map((title,i)=>({title,trackNumber:i+1,audioUrl:`/api/assets/${i+1}/download`,isrc:`INABC260000${i+1}`,metadata:{clientTrackId:`recording-${title}`,songwriters:`Writer ${title}`}}));
  const initial=await prisma.$transaction(tx=>saveReleaseTracks(tx,release.id,rows,[]));
  await prisma.$transaction(tx=>syncReleaseContributions(tx,{actorUserId:user.id,tracks:initial.map((track,i)=>({trackId:track.id,contributions:[{role:'composer',legalName:`Composer ${i}`,clientReference:`composer-${i}`}]}))}));
  const contributions=await prisma.trackContribution.findMany({where:{trackId:{in:initial.map(track=>track.id)}},orderBy:{id:'asc'}});
  const reordered=[rows[1],rows[2],{...rows[0],audioUrl:'/api/assets/99/download'}].map((row,i)=>({...row,trackNumber:i+1}));
  const saved=await prisma.$transaction(tx=>saveReleaseTracks(tx,release.id,reordered,initial));
  assert.deepEqual(saved.map(track=>track.id),[initial[1].id,initial[2].id,initial[0].id]);
  const alpha=await prisma.track.findUniqueOrThrow({where:{id:initial[0].id}});
  assert.equal(alpha.trackNumber,3); assert.equal(alpha.isrc,rows[0].isrc); assert.equal(alpha.audioUrl,'/api/assets/99/download');
  assert.deepEqual(await prisma.trackContribution.findMany({where:{trackId:{in:initial.map(track=>track.id)}},orderBy:{id:'asc'}}),contributions);
  const repeated=await prisma.$transaction(tx=>saveReleaseTracks(tx,release.id,reordered,saved));
  assert.deepEqual(repeated,saved,'Repeated saves retain the recording IDs.');
  const shortened=[reordered[0],reordered[2]].map((row,i)=>({...row,trackNumber:i+1}));
  const retained=await prisma.$transaction(async tx=>{const result=await saveReleaseTracks(tx,release.id,shortened,saved);await tx.track.deleteMany({where:{releaseId:release.id,trackNumber:{gt:shortened.length}}});return result;});
  assert.deepEqual(retained.map(track=>track.id),[initial[1].id,initial[0].id]);
  assert.equal(await prisma.track.count({where:{releaseId:release.id}}),2);
  await assert.rejects(prisma.$transaction(tx=>saveReleaseTracks(tx,release.id,[shortened[0],{...shortened[0],trackNumber:2}],retained)),/unique track identity/);
  // Legacy tracks with indistinguishable titles/audio still follow their original database IDs.
  const legacy=await prisma.release.create({data:{userId:user.id,title:'Legacy draft',artistName:'Fixture',genre:'Pop',releaseDate:new Date('2099-01-01')}});
  const legacyRows=[1,2].map(trackNumber=>({title:'Same title',trackNumber,audioUrl:'/api/assets/1/download',metadata:{}}));
  const legacyIds=await prisma.$transaction(tx=>saveReleaseTracks(tx,legacy.id,legacyRows,[]));
  const newRecording={title:'New recording',trackNumber:1,audioUrl:'/api/assets/99/download',metadata:{clientTrackId:'brand-new-recording'}};
  const firstReorder=await prisma.$transaction(tx=>saveReleaseTracks(tx,legacy.id,[newRecording,...[...legacyIds].reverse().map((track,i)=>({...legacyRows[i],trackNumber:i+2,metadata:{clientTrackId:`existing-track-${track.id}`}}))],legacyIds));
  assert.deepEqual(firstReorder.slice(1).map(track=>track.id),[legacyIds[1].id,legacyIds[0].id]);
  assert.ok(!legacyIds.some(track=>track.id===firstReorder[0].id),'A new recording must not consume an existing recording ID.');
  console.log('PASS music master persistence: reorder, replacement, recording IDs, ISRCs, contributor links, retries, removal, legacy identity and duplicate rejection.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
