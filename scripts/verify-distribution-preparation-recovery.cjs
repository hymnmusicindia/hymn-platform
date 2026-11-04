const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
// Execute the actual post-claim pipeline with dependency faults. No database,
// provider request, email or production fixture is used.
const source=fs.readFileSync('lib/distribution-service.ts','utf8').replaceAll('\r\n','\n');
const start=source.indexOf('  const providerPayload =');
const end=source.indexOf('\n}\n\nexport async function retrySubmission',start);
assert(start>0&&end>start);
const code=ts.transpileModule('(async()=>{'+source.slice(start,end)+'})()', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
(async()=>{
 for(const fault of ['snapshot','queued','submitting','reservation','payload','transport']){
  let dispatches=0,finished,failed=false;const transitions=[];
  const fail=stage=>{if(stage===fault&&!failed){failed=true;throw Error('Injected '+stage+' failure');}};
  const context={console:{error:()=>{}},Date,JSON,options:{},claim:{attempt:{id:61,idempotencyKey:'fixture'}},payload:{},previousAttempt:null,releaseId:185,release:{id:185},validation:{ok:true},amendment:null,redactedPayload:{},
   redactDireNotePayload:x=>x,snapshotTrackContributions:async()=>fail('snapshot'),
   updateDetailedReleaseStatus:async(_id,status)=>{transitions.push(status);if(status==='queued_for_distribution')fail('queued');if(status==='submitting_to_distributor')fail('submitting');},
   reserveDireNoteRequest:async()=>fail('reservation'),prisma:{distributionSubmissionAttempt:{update:async()=>fail('payload')}},
   submitToDireNote:async()=>{dispatches++;fail('transport');},
   finishDistributionSubmission:async(_id,data)=>{finished=data;},logDistributionEvent:async()=>{},createReleaseAuditLog:async()=>{},createAdminTaskOnce:async()=>{},displayName:()=> 'Fixture',getDetailedReleaseById:async()=>({id:185}),retryCountFromRelease:()=>0
  };
  const result=await vm.runInNewContext(code,context);
  assert.equal(finished.state,fault==='transport'?'reconciliation_required':'retryable',fault);
  assert.equal(dispatches,fault==='transport'?1:0,'Preparation must never dispatch');
  assert.equal(result.retryable,fault!=='transport',fault);
  assert.equal(transitions.at(-1),fault==='transport'?'delivery_failed':'queued_for_distribution',fault);
 }
 console.log('PASS submission fault injection: snapshot, queue/status persistence, rate reservation and payload preparation recover; uncertain transport blocks blind retry.');
})().catch(e=>{console.error(e);process.exitCode=1});
