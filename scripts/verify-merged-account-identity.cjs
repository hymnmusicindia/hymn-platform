const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');const crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const retiredEmail=hash('retired@example.test'), retiredGoogle=hash('old-google-id');let retiredUser=true, cookieWrites=0, writes=0;
const prisma={auditLog:{findFirst:async input=>{assert.equal(input.where.action,'ACCOUNT_MERGED');return input.where.OR.some(item=>[retiredEmail,retiredGoogle].includes(item.metadata.equals))?{id:1}:null}},user:{findUnique:async()=>({statusReason:retiredUser?'ACCOUNT_MERGED':null})},session:{findUnique:async()=>({userId:51,revokedAt:null,expiresAt:new Date(Date.now()+10000)}),create:async()=>{writes++}}};
function load(file,mocks){const sandbox={exports:{},require:n=>{assert.ok(n in mocks,n);return mocks[n]},Error,Date,process,console,Request,Response,URL};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const identity=load('lib/merged-account-identity.ts',{'node:crypto':crypto,'@/lib/prisma':{prisma}});
let payload={sub:22,email:'retired@example.test',name:'Fixture',role:'customer'};
const cookies={get:()=>({value:'fixture-token'}),set:()=>{cookieWrites++}};
const session=load('lib/session.ts',{'jsonwebtoken':{default:{verify:()=>payload,sign:()=> 'token'},verify:()=>payload,sign:()=> 'token'},crypto,'@/lib/prisma':{prisma},'@/lib/types':{},'@/lib/env':{getUserSessionSecret:()=> 'fixture',getAdminSessionSecret:()=> 'fixture'},'@/lib/audit-log':{logAuditEvent:async()=>{}},'@/lib/growth':{identifyGrowthUser:async()=>{}},'@/lib/growth-partners':{attachPartnerReferral:async()=>{}},'@/lib/merged-account-identity':identity,'next/headers':{cookies:async()=>cookies}});
(async()=>{
 await assert.rejects(identity.assertNotMergedIdentity({email:' RETIRED@example.test '}),/no longer available/);
 await assert.rejects(identity.assertNotMergedIdentity({email:'other@example.test',googleId:'old-google-id'}),/no longer available/);
 await identity.assertNotMergedIdentity({email:'new@example.test',googleId:'new-google-id'});
 process.env.DATABASE_URL='postgresql://fixture:fixture@localhost:1/fixture';
 await assert.rejects(session.createSession(payload),/merged/);assert.equal(cookieWrites,0);assert.equal(writes,0);
 assert.equal(await session.getSession(),null); // Legacy cookies cannot reopen the tombstone.
 payload={...payload,sid:'fixture-sid'};assert.equal(await session.getSession(),null); // Session owner binding.
 retiredUser=false;payload={...payload,sub:51,email:'new@example.test'};assert.equal((await session.getSession()).sub,51);
 const db=fs.readFileSync('lib/db.ts','utf8');for(const marker of ['export async function createPasswordUser','export async function upsertGoogleUser']){const section=db.slice(db.indexOf(marker));assert.ok(section.indexOf('await assertNotMergedIdentity')<section.indexOf('tx.user.findFirst'));}
 console.log('PASS retired email/Google hash blocking, active destination login, no tombstone session creation, legacy-cookie rejection, session-owner binding and signup guards.');
})().catch(e=>{console.error(e);process.exitCode=1});
