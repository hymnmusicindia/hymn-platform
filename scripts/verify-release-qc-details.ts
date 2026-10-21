import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { prisma } from '../lib/prisma';
import { syncDireNoteRelease } from '../lib/direnote-service';
import { buildReleaseQcReport, providerQcSourceUpc, qcReportSummary } from '../lib/direnote-qc-details';
import { saveReleaseQcReport, readReleaseQcReport } from '../lib/direnote-qc-store';
import { releaseStatusEmail } from '../lib/email/templates/release-status-email';
import { qcReportReturnPath } from '../lib/routes';

async function main(){
  assert.match(process.env.DATABASE_URL??'',/^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\//);
  const user=await prisma.user.create({data:{name:'QC customer',email:'qc@example.test',googleId:'qc-fixture',status:'ACTIVE'}});
  const release=await prisma.release.create({data:{userId:user.id,title:'QC fixture',artistName:'Fixture Artist',genre:'Pop',releaseDate:new Date('2099-01-01'),status:'DISTRIBUTOR_PROCESSING',upc:'012345678905',paymentStatus:'paid'}});
  const tracks=await Promise.all([1,2].map(i=>prisma.track.create({data:{releaseId:release.id,title:`Track ${i}`,trackNumber:i,isrc:`USAAA260000${i}`,audioUrl:'/fixture.wav'}})));
  const attempt=await prisma.distributionSubmissionAttempt.create({data:{releaseId:release.id,idempotencyKey:'qc-fixture-attempt',payloadHash:'fixture',state:'submitted',isCurrent:true,upc:release.upc,trackIdentifiers:tracks.map(t=>({id:t.id,title:t.title,isrc:t.isrc,trackNumber:t.trackNumber}))}});
  const match={offset:2.2,played_duration:10.7,score:61,result:{title:'Matched recording',artists:[{name:'Reference artist'}],label:'Reference label',external_ids:{isrc:'USZZZ2500001'},sample_begin_time_offset_ms:2160,sample_end_time_offset_ms:12840,db_begin_time_offset_ms:1000,db_end_time_offset_ms:11680,rights_claim:[{rights_claim_policy:'Monetize',rights_owners:[{name:'Example rights owner'}],distributor:{name:'Example distributor'}}],external_metadata:{spotify:{track:{id:'0123456789012345678901'}}}}};
  const raw={success:true,upc_code:release.upc,track_count:2,tracks:[...tracks].reverse().map(t=>({track_name:t.title,isrc:t.isrc,scanned:true,acr:{results:{music:t.trackNumber===2?[match]:[]}},isrc_lookup:{status:'NEW ISRC'},upc_lookup:{status:'NEW UPC'}}))};
  const context={releaseId:release.id,attemptId:attempt.id,currentUpc:release.upc!,sourceUpc:release.upc!,tracks};
  const detail=buildReleaseQcReport(raw,context);assert(detail.verified);assert.equal(detail.tracks[1].localTrackId,tracks[1].id);assert.equal(detail.tracks[1].matches[0].startMs,2160);assert.equal(detail.tracks[1].matches[0].score,61);assert.equal(detail.tracks[1].matches[0].rightsOwners[0],'Example rights owner');
  assert.match(qcReportSummary(detail),/Matched recording.*2.16s/);
  assert.throws(()=>buildReleaseQcReport({...raw,upc_code:'036000291452'},context),/source UPC/);
  assert.equal(buildReleaseQcReport({...raw,tracks:raw.tracks.map(t=>({...t,isrc:'USXXX2600999'}))},context).verified,false);
  const duplicate={...raw,tracks:[raw.tracks[0],raw.tracks[0]]};assert.throws(()=>buildReleaseQcReport(duplicate,context),/repeats/);
  const unscanned=buildReleaseQcReport({...raw,tracks:raw.tracks.map(t=>({...t,scanned:false}))},context);assert.equal(unscanned.tracks[1].matches.length,0);
  assert.equal(providerQcSourceUpc({remarks:'See https://dashboard.direnotemedia.com/release_detection_analysis.php?upc=036000291452.'}),'036000291452');
  assert.equal(providerQcSourceUpc({remarks:'https://evil.example/report?upc=036000291452'}),null);
  const originalFetch=global.fetch;let qcCalls=0;
  global.fetch=async(url,init)=>{
    const pathname=new URL(String(url)).pathname;
    const body=JSON.parse(String(init?.body??'{}'));
    if(pathname==='/check_qc_report'){qcCalls++;assert.deepEqual(Object.keys(body).sort(),['client_id','pin','upc']);return Response.json(raw);}
    if(pathname==='/check_release_status')return Response.json({success:true,release:{upc_code:release.upc,album_name:release.title},tracks:tracks.map(t=>({track_name:t.title,isrc:t.isrc,status:'Rejected',remarks:'Please provide rights clearance for this recording.'}))});
    return Response.json({success:false,error:'Fixture endpoint unavailable'},{status:404});
  };
  try{
    await syncDireNoteRelease(release.id);
    assert.equal((await prisma.release.findUniqueOrThrow({where:{id:release.id}})).status,'CHANGES_REQUESTED');
    const stored=await readReleaseQcReport(release.id);assert(stored?.verified);assert.equal(stored.tracks[1].matches.length,1);
    const notes=(await prisma.release.findUniqueOrThrow({where:{id:release.id}})).reviewIssues as any;assert(notes.fields.some((field:any)=>field.field==='tracks.1.providerQc'));
    const count=await prisma.emailLog.count({where:{entityId:String(release.id),template:'release_changes_requested'}});assert.equal(count,1);
    const email=await prisma.emailLog.findFirstOrThrow({where:{entityId:String(release.id),template:'release_changes_requested'}});assert.match(JSON.stringify(email.payload),new RegExp(`/dashboard/releases/${release.id}/qc-report`));assert.match(JSON.stringify(email.payload),/Matched recording/);
    await syncDireNoteRelease(release.id);assert.equal(qcCalls,1,'Report cache avoids repeat requests.');assert.equal(await prisma.emailLog.count({where:{entityId:String(release.id),template:'release_changes_requested'}}),count,'Repeated reports do not resend correction email.');
  }finally{global.fetch=originalFetch;}
  const supplied=buildReleaseQcReport(raw,{...context,provenance:'partner_supplied'});await saveReleaseQcReport(supplied);
  for(let i=0;i<22;i++)await saveReleaseQcReport(buildReleaseQcReport({...raw,tracks:raw.tracks.map(t=>({...t,acr:null}))},context));assert.equal((await readReleaseQcReport(release.id))!.tracks[1].matches.length,1,'Later omitted ACR must not age saved evidence out of the report window.');
  const oldRaw={...raw,upc_code:'036000291452',tracks:raw.tracks.map(t=>({...t,isrc:t.isrc!.replace('260','250'),isrc_lookup:{status:'NEW ISRC',isrc:t.isrc}}))};const old=buildReleaseQcReport(oldRaw,{...context,sourceUpc:'036000291452'});assert(old.verified);
  const require=createRequire(import.meta.url);let owner=user.id;
  const accessModule={exports:{} as any};const compile=(file:string)=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(compile('lib/release-qc-access.ts'),{exports:accessModule.exports,require:(id:string)=>id==='server-only'?{}:id==='@/lib/prisma'?{prisma}:id==='@/lib/access'?{requireUser:async()=>owner?{user:{id:owner}}:{error:require('next/server').NextResponse.json({error:'Unauthorized'},{status:401})},requireAdminPermission:async()=>({error:require('next/server').NextResponse.json({error:'Forbidden'},{status:403})})}:require(id)});
  const api={exports:{} as any};vm.runInNewContext(compile('app/api/releases/[id]/qc-report/route.ts'),{exports:api.exports,URL,require:(id:string)=>id==='@/lib/release-qc-access'?accessModule.exports:id==='@/lib/direnote-qc-store'?{readReleaseQcReport}:require(id)});
  const get=()=>api.exports.GET(new Request('http://fixture/qc-report?download=1'),{params:Promise.resolve({id:String(release.id)})});
  const response=await get();assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/);assert.match(response.headers.get('content-disposition')!,/attachment/);
  owner=user.id+100;assert.equal((await get()).status,404);owner=0;assert.equal((await get()).status,401);
  await prisma.distributionSubmissionAttempt.update({where:{id:attempt.id},data:{isCurrent:false}});assert.equal(await readReleaseQcReport(release.id),null,'Superseded evidence cannot be attached to a different attempt.');
  const template=releaseStatusEmail('release_changes_requested',{userName:'Fixture',releaseTitle:'<script>bad</script>',releaseId:release.id,releaseStatus:'changes_requested',manageReleaseUrl:'https://example.test/release',qcReportUrl:'https://example.test/qc-report',qcSummary:'Matched recording at 2.16s–12.84s'});assert.match(template.text,/qc-report/);assert(!template.html.includes('<script>bad</script>'));
  assert.equal(qcReportReturnPath(`/dashboard/releases/${release.id}/qc-report`),`/dashboard/releases/${release.id}/qc-report`);assert.equal(qcReportReturnPath('//evil.test'),undefined);assert.equal(qcReportReturnPath('https://evil.test'),undefined);
  console.log('PASS release QC: real sync → verified snapshot → track corrections → deduplicated email/report link; source aliases, evidence preservation, UPC/ISRC mismatch rejection, private API authorization/download and HTML escaping.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
