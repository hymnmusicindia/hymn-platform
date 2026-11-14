const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const sandbox={exports:{},require:name=>{assert(name in mocks,`Unexpected dependency ${name}`);return mocks[name]},console,Date};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const channels=load('lib/distribution-capabilities.ts');
const policy=load('lib/correction-social-policy.ts',{'./distribution-capabilities':channels});
for(const status of ['REJECTED','changes_requested','RESUBMITTED']){
  for(const name of ['TikTok','Snapchat','Instagram / Facebook','YouTube Content ID'])assert.throws(()=>policy.assertCorrectionSocialSelection({status},{platforms:[name]}),/Disputed/);
  assert.throws(()=>policy.assertCorrectionSocialSelection({status},{platforms:['Spotify'],youtubeContentIdEnabled:true}),/Disputed/);
  policy.assertCorrectionSocialSelection({status},{platforms:['Spotify','Apple Music','YouTube Music']});
}
policy.assertCorrectionSocialSelection({status:'draft'},{platforms:['TikTok']});
let rows=[],locked=false,trackId=10,owner=7;
const tx={
  $executeRaw:async()=>{locked=true},
  release:{findFirst:async({where})=>where.userId===owner?{id:1,status:'LIVE',upc:'123'}:null},
  track:{findFirst:async({where})=>({id:where.id,isrc:'INDN22602494'})},
  releaseChangeRequest:{findFirst:async()=>rows.find(r=>r.status==='submitted'),findMany:async()=>{assert(locked,'Allowance read must hold the release lock');return rows},create:async({data})=>{const r={...data,id:rows.length+1,status:'submitted'};rows.push(r);return r}},
  releaseChangeRequestEvent:{create:async()=>({id:1})},auditLog:{create:async()=>({})}
};
const {createReleaseChangeRequest}=load('lib/release-change-requests.ts',{
  './correction-social-policy':policy,
  './release-amendment-notifications':{enqueueAmendmentUpdate:async()=>{},amendmentTransactionOptions:{}},
  './release-amendment-fulfillment':{},'./release-support-corrections':{validateReleaseCorrection:async(_r,_u,correction)=>({correction,release:{upc:'123'},track:{id:correction.trackId,title:'Track',isrc:'INDN22602494'}})},
  './spotify-profile-mismatch':{},'./release-correction-contract':{correctionSchema:{parse:v=>v,safeParse:v=>({success:true,data:v})}},
  '@prisma/client':{},'@/lib/prisma':{prisma:{$transaction:async fn=>{locked=false;return fn(tx)}}},'@/lib/release-status-engine':{}
});
const input=()=>({releaseId:1,userId:owner,requestType:'metadata_update',reason:'Please check missing Meta availability.',requestedChanges:{supportCorrection:{action:'request_meta_not_live',trackId,spotifyTrackUrl:'https://open.spotify.com/track/0123456789012345678901',spotifyLiveConfirmed:true}}});
(async()=>{
  const first=await createReleaseChangeRequest(input());assert.equal(first.id,1);
  assert.equal((await createReleaseChangeRequest(input())).id,1,'Exact active retry returns its existing receipt');assert.equal(rows.length,1);
  rows[0].status='completed';await assert.rejects(createReleaseChangeRequest(input()),/already used/);
  trackId=11;assert.equal((await createReleaseChangeRequest(input())).id,2,'Each recording has its own allowance');
  const stranger={...input(),userId:99};await assert.rejects(createReleaseChangeRequest(stranger),/not found/);
  console.log('PASS forged social/CID selections blocked; normal music stores retained; locked per-track appeal limit, exact retry receipt and ownership enforced.');
})().catch(error=>{console.error(error);process.exitCode=1});
