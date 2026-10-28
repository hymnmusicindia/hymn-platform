import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma } from '../lib/prisma';
import { beatVisitor,readBeatEngagement,writeBeatEngagement } from '../lib/beat-engagement';
import { GET,POST } from '../app/api/beats/engagement/route';

async function main(){
  assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const user=await prisma.user.create({data:{name:'Beat owner',email:'beat-engagement@fixture.invalid',googleId:'beat-engagement'}});
  const beat=await prisma.beat.create({data:{userId:user.id,title:'Record fixture',bpm:90,genre:'Hip Hop',mood:'Chill',keySignature:'C minor',priceCents:10000,status:'PUBLISHED'}});
  const draft=await prisma.beat.create({data:{userId:user.id,title:'Private draft',bpm:90,genre:'Pop',mood:'Chill',keySignature:'C',priceCents:10000,status:'DRAFT'}});
  const visitor=beatVisitor();assert.equal(visitor.fresh,true);assert.equal(beatVisitor(visitor.cookie).key,visitor.key);assert.equal(beatVisitor(visitor.cookie.slice(0,-1)+'x').fresh,true);
  assert.deepEqual((await readBeatEngagement([beat.id],visitor.key))[beat.id],{views:0,likes:0,liked:false});
  await Promise.all(Array.from({length:8},()=>writeBeatEngagement(beat.id,visitor.key,'view')));
  await Promise.all(Array.from({length:8},()=>writeBeatEngagement(beat.id,visitor.key,'like',true)));
  assert.deepEqual((await readBeatEngagement([beat.id],visitor.key))[beat.id],{views:1,likes:1,liked:true});
  await writeBeatEngagement(beat.id,visitor.key,'like',false);
  assert.deepEqual((await readBeatEngagement([beat.id],visitor.key))[beat.id],{views:1,likes:0,liked:false});
  await writeBeatEngagement(beat.id,beatVisitor().key,'like',true);
  assert.equal((await readBeatEngagement([beat.id],visitor.key))[beat.id].likes,1);
  assert.equal((await readBeatEngagement([draft.id],visitor.key))[draft.id],undefined);
  assert.equal(await writeBeatEngagement(draft.id,visitor.key,'view'),null);
  const request=(body:unknown,origin='https://hymn.fixture')=>new NextRequest('https://hymn.fixture/api/beats/engagement',{method:'POST',headers:{origin,'content-type':'application/json',cookie:`hymn-beat-visitor=${visitor.cookie}`},body:JSON.stringify(body)});
  assert.equal((await POST(request({beatId:beat.id,action:'like',liked:true},'https://other.fixture'))).status,403);
  assert.equal((await POST(request({beatId:beat.id,action:'like',liked:'true'}))).status,400);
  assert.equal((await POST(request({beatId:draft.id,action:'view'}))).status,404);
  const updated=await POST(request({beatId:beat.id,action:'like',liked:true}));assert.equal(updated.status,200);assert.equal((await updated.json()).counts.likes,2);
  const counts=await GET(new NextRequest(`https://hymn.fixture/api/beats/engagement?ids=${beat.id},${draft.id}`,{headers:{cookie:`hymn-beat-visitor=${visitor.cookie}`}}));
  assert.equal(counts.headers.get('cache-control'),'private, no-store');assert.equal((await counts.json()).counts[beat.id].liked,true);
  const fresh=await GET(new NextRequest(`https://hymn.fixture/api/beats/engagement?ids=${beat.id}`));assert.match(fresh.headers.get('set-cookie')||'',/HttpOnly/);
  assert.equal((await GET(new NextRequest('https://hymn.fixture/api/beats/engagement?ids=0'))).status,400);
  await prisma.beat.delete({where:{id:beat.id}});assert.equal(await prisma.beatEngagement.count({where:{beatId:beat.id}}),0);
  console.log('PASS beat engagement: real persisted counts, concurrent replay deduplication, unlike/reload state, signed anonymous browser identity, public beat scope, origin/validation guards and cascade cleanup.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
