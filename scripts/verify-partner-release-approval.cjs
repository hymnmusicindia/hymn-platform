const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(path,mocks={}){const sandbox={exports:{},require:name=>{assert.ok(name in mocks,name);return mocks[name]},console,Date,Intl};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const helpers=load('lib/partner-release-approval.ts');
const {hasPartnerReleaseApproval:approved,partnerEstimatedDate:date,approvalEstimateText:copy}=helpers;
assert(approved({status:'approved'},[{status:'pending'}]));assert(approved({},[{status:'approved'},{status:'approved'}]));
for(const status of ['processing','accepted','pending'])assert(!approved({status},[{status}]));
assert(!approved({},[{status:'approved'},{status:'pending'}]));
for(const status of ['rejected','changes_required','failed'])assert(!approved({status:'approved'},[{status}]))
assert.equal(date({estimated_release_date:'2026-11-19T23:00:00-08:00',track_release_date:'2026-11-20'}),'2026-11-19');
assert.equal(date({track_release_date:'2026-11-20'}),'2026-11-20');
assert.equal(date({estimated_release_date:'2026-02-31'}),null);assert.equal(date({releaseDate:'2026-11-20'}),null);
assert.match(copy('2026-11-19'),/19 November 2026/);assert.match(copy('2026-11-19'),/estimate, not a guaranteed/);assert.match(copy(null),/not been provided/);
let release,attempt,emails,notices;
const match=(row,where)=>Object.entries(where).every(([key,value])=>value&&typeof value==='object'&&value.in?value.in.includes(row[key]):value&&typeof value==='object'&&value.path?value.path.reduce((v,k)=>v?.[k],row[key])===value.equals:row[key]===value);
const db={
 $executeRaw:async()=>{},release:{findUnique:async()=>release},distributionSubmissionAttempt:{findFirst:async({where})=>attempt&&match(attempt,where)?attempt:null},
 notification:{upsert:async({where,create,update})=>{let n=notices.find(n=>match(n,where));if(n)Object.assign(n,update);else notices.push({...create});}},
 emailLog:{upsert:async({where,create})=>{if(!emails.some(n=>match(n,where)))emails.push({id:1,retryCount:0,...create});},updateMany:async({where,data})=>{const rows=emails.filter(n=>match(n,where));rows.forEach(n=>Object.assign(n,data));return {count:rows.length}},findMany:async({where})=>emails.filter(n=>match(n,where)),update:async({where,data})=>Object.assign(emails.find(n=>match(n,where)),data)}
};db.$transaction=async fn=>fn(db);
const brand=load('lib/customer-message.ts');
const layout=load('lib/email/email-templates.ts',{'server-only':{},'@/lib/customer-message':brand,'@/lib/public-app-url':{getPublicAppUrl:()=> 'https://example.test'}});
const template=load('lib/email/templates/release-status-email.ts',{'server-only':{},'@/lib/customer-message':brand,'@/lib/email/email-templates':layout});
const rendered=template.releaseStatusEmail('release_partner_approved',{userName:'<script>Owner</script>',releaseTitle:'DireNote <img src=x>',artistName:'Artist',releaseId:1,releaseStatus:'DISTRIBUTOR_PROCESSING',manageReleaseUrl:'https://example.test/dashboard/releases/1',approvalEstimate:copy('2026-11-19')});
assert.match(rendered.html,/&lt;script&gt;Owner/);assert.doesNotMatch(rendered.html,/<img src=x>/);assert.match(rendered.html,/DireNote &lt;img/);assert.match(rendered.subject,/DireNote/);

const {queuePartnerReleaseApproval:queue}=load('lib/release-partner-approval-notifications.ts',{'server-only':{},'./prisma':{prisma:db},'./partner-release-approval':helpers,'./email/templates/release-status-email':template,'./public-app-url':{getPublicAppUrl:()=> 'https://example.test'}});
const {deliverReleaseOutbox:deliver}=load('lib/email/release-outbox.ts',{'server-only':{},'@/lib/prisma':{prisma:db},'@/lib/partner-release-approval':helpers,'./email-client':{getEmailConfig:()=>({enabled:true,from:'fixture@example.test'})},'./templates/release-status-email':template,'@/lib/public-app-url':{getPublicAppUrl:()=> 'https://example.test'},'@/lib/direnote-qc-details':{},'@/lib/direnote-qc-store':{},'@/lib/direnote-submission-evidence':{canNotifyDireNoteHandoff:()=>false}});
function reset(){emails=[];notices=[];release={id:1,userId:5,title:'Test song',artistName:'Artist',upc:'123456789012',status:'DISTRIBUTOR_PROCESSING',direNoteStatus:'processing',user:{name:'Owner',email:'fixture@example.test',status:'ACTIVE'}};attempt={id:7,releaseId:1,provider:'direnote',isCurrent:true,upc:release.upc};}
(async()=>{
 reset();await queue(1,7,release.upc,'2026-11-19');await queue(1,7,release.upc,'2026-11-20');assert.equal(emails.length,1);assert.equal(notices.length,1);assert.equal(notices[0].userId,5);assert.match(emails[0].payload.text,/20 November 2026/);assert.match(emails[0].payload.text,/estimate, not a guaranteed/);assert.doesNotMatch(emails[0].payload.text,/direnote/i);
 release.status='LIVE';assert.equal((await deliver([1],5,async()=>({data:{id:'test'},error:null}))).sent,1);await queue(1,7,release.upc,null);assert.equal(emails[0].status,'sent');assert.equal((await deliver([1],5,async()=>{throw Error('duplicate')})).sent,0);
 reset();await queue(1,7,release.upc,null);attempt.id=8;assert.equal((await deliver([1],5,async()=>{throw Error('stale')})).cancelled,1);
 reset();await queue(1,7,release.upc,null);release.direNoteStatus='changes_required';assert.equal((await deliver([1],5,async()=>{throw Error('correction')})).cancelled,1);
 for(const state of ['REJECTED','CHANGES_REQUESTED','DRAFT']){reset();release.status=state;await queue(1,7,release.upc,null);assert.equal(emails.length,0);}
 for(const change of [()=>{release.archivedAt=new Date()},()=>{release.user.email='changed@example.test'},()=>{release.userId=6},()=>{release.upc='999999999999'}]){reset();await queue(1,7,release.upc,null);change();assert.equal((await deliver([1],5,async()=>{throw Error('invalid owner or release')})).cancelled,1);}
 reset();attempt.isCurrent=false;await queue(1,7,release.upc,null);assert.equal(emails.length,0);
 reset();release.archivedAt=new Date();await queue(1,7,release.upc,null);assert.equal(emails.length,0);
 reset();release.user.status='SUSPENDED';await queue(1,7,release.upc,null);assert.equal(emails.length,0);
 reset();await queue(1,7,release.upc,null);emails[0].status='review';await queue(1,7,release.upc,'2026-11-21');assert.equal(emails[0].status,'review');
 console.log('PASS partner approval: evidence, estimated dates, owner notices, deduplication, late ETA, SMTP progress, supersession, correction and uncertain delivery guards.');
})().catch(e=>{console.error(e);process.exitCode=1});
