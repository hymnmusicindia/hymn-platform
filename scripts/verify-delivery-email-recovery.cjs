const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let release, attempt, logs, deliveries;
const db = {
  release: { findUnique: async () => release },
  distributionSubmissionAttempt: { findFirst: async ({where}) => attempt && (!where.id || where.id === attempt.id) && (!where.state || where.state === attempt.state) && attempt.isCurrent ? attempt : null },
  emailLog: {
    upsert: async ({where,create}) => { let row=logs.find(x=>x.eventKey===where.eventKey); if(!row){row={id:logs.length+1,retryCount:0,...create};logs.push(row);}return row; },
    findMany: async ({where}) => logs.filter(x=>x.status===where.status),
    findFirst: async () => null,
    updateMany: async ({where,data}) => {const row=logs.find(x=>x.id===where.id&&x.status===where.status);if(row)Object.assign(row,data);return {count:row?1:0};},
    update: async ({where,data}) => Object.assign(logs.find(x=>x.id===where.id),data)
  }
};
const mocks={
 'server-only':{}, '@/lib/prisma':{prisma:db},
 './email-client':{getEmailConfig:()=>({enabled:true,from:'fixture@example.test'}),getEmailClient:()=>({emails:{send:async()=>{deliveries++;return {data:{id:'fixture'},error:null};}}})},
 './templates/release-status-email':{releaseStatusEmail:(event,input)=>({subject:event,html:input.upc||'',text:input.upc||''})},
 '@/lib/public-app-url':{getPublicAppUrl:()=> 'https://example.test'},
 '@/lib/direnote-qc-details':{}, '@/lib/direnote-qc-store':{}
};
const sandbox={exports:{},require:name=>{assert.ok(mocks[name],name);return mocks[name];},console,Date};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/email/release-outbox.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const {queueReleaseStatusUpdate,deliverReleaseOutbox}=sandbox.exports;
function reset(){logs=[];deliveries=0;release={id:188,userId:80,title:'Fixture',artistName:'Artist',status:'DISTRIBUTOR_PROCESSING',version:14,metadata:{},releaseDate:new Date(),archivedAt:null,user:{id:80,name:'Artist',email:'fixture@example.test',status:'ACTIVE'}};attempt={id:62,isCurrent:true,state:'submitted',providerReference:'job-62',upc:'3473620322062'};}
(async()=>{
 reset();await queueReleaseStatusUpdate(db,188,'distributor_processing');release.version++;await queueReleaseStatusUpdate(db,188,'sent_to_distributor');assert.equal(logs.length,1,'Callbacks across versions deduplicate by attempt');assert.match(logs[0].payload.text,/3473620322062/);
 release.status='LIVE';assert.equal((await deliverReleaseOutbox([188])).sent,1,'Forward progress does not cancel delivery');assert.equal((await deliverReleaseOutbox([188])).sent,0);assert.equal(deliveries,1);
 reset();attempt=null;assert.equal(await queueReleaseStatusUpdate(db,188,'sent_to_distributor'),undefined,'Status alone cannot claim delivery');assert.equal(logs.length,0);
 for(const state of ['retryable','failed','reconciliation_required']){reset();attempt.state=state;assert.equal(await queueReleaseStatusUpdate(db,188,'distributor_processing'),undefined,state);}
 reset();await queueReleaseStatusUpdate(db,188,'distributor_processing');attempt.id=63;assert.equal((await deliverReleaseOutbox([188])).cancelled,1,'Superseded delivery cannot notify');
 for(const status of ['CHANGES_REQUESTED','REJECTED','DRAFT']){reset();await queueReleaseStatusUpdate(db,188,'distributor_processing');release.status=status;assert.equal((await deliverReleaseOutbox([188])).cancelled,1,status);}
 reset();release.status='APPROVED';await queueReleaseStatusUpdate(db,188,'approved');release.status='DISTRIBUTOR_PROCESSING';assert.equal((await deliverReleaseOutbox([188])).sent,1,'Approval survives normal progress');
 reset();await queueReleaseStatusUpdate(db,188,'distributor_processing');release.user.email='other@example.test';assert.equal((await deliverReleaseOutbox([188])).cancelled,1,'Recipient change cancels');
 reset();await queueReleaseStatusUpdate(db,188,'distributor_processing');release.archivedAt=new Date();assert.equal((await deliverReleaseOutbox([188])).cancelled,1,'Archived releases cannot notify');
 console.log('PASS delivery outbox: async completion, evidence gates, attempt dedupe, UPC, progress, supersession, correction, rejection, drafts, recipient and archive guards.');
})().catch(e=>{console.error(e);process.exitCode=1});
