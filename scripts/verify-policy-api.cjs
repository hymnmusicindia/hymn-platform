const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs/promises');const {build}=require('esbuild');
(async()=>{
 const out=path.resolve('.tmp/policy-api');await fs.mkdir(out,{recursive:true});process.env.NEXT_PUBLIC_APP_URL='https://hymn.fixture';process.env.APP_URL='https://hymn.fixture';
 global.policyFixture={auth:true,accepted:false,writes:[],revision:'current-revision'};
 const mocks={
  '@/lib/access':`export async function requireUser(){return global.policyFixture.auth?{user:{id:22}}:{error:new Response(null,{status:401})}}`,
  '@/lib/policy-agreement':`export async function getPolicyAgreementStatus(userId){return {revision:global.policyFixture.revision,accepted:global.policyFixture.accepted}};export async function acceptCurrentPolicies(userId,revision){if(revision!==global.policyFixture.revision)return {stale:true,status:await getPolicyAgreementStatus(userId)};global.policyFixture.writes.push(userId);global.policyFixture.accepted=true;return {stale:false,status:await getPolicyAgreementStatus(userId)}}`
 };
 await build({entryPoints:['app/api/account/policies/route.ts'],outfile:path.join(out,'route.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'policy-fixture',setup(b){b.onResolve({filter:/^@\/lib\//},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}));}}]});
 const {GET,POST}=require(path.join(out,'route.cjs'));
 const request=(body,origin='https://hymn.fixture')=>new Request('http://127.0.0.1:3000/api/account/policies',{method:'POST',headers:origin?{Origin:origin,'Content-Type':'application/json'}:{},body:JSON.stringify(body)});
 global.policyFixture.auth=false;assert.equal((await GET()).status,401);assert.equal((await POST(request({accepted:true,revision:'current-revision'}))).status,401);global.policyFixture.auth=true;
 assert.equal((await POST(request({accepted:true,revision:'current-revision'},'https://evil.fixture'))).status,403);
 assert.equal((await POST(request({accepted:true,revision:'current-revision'},null))).status,403);
 assert.equal((await POST(request({accepted:'true',revision:'current-revision'}))).status,400);
 assert.equal((await POST(request({accepted:false,revision:'current-revision'}))).status,400);
 assert.equal((await POST(request({accepted:true,revision:'old-revision'}))).status,409);
 assert.equal(global.policyFixture.writes.length,0);
 const accepted=await POST(request({accepted:true,revision:'current-revision',userId:999}));assert.equal(accepted.status,200);assert.deepEqual(global.policyFixture.writes,[22],'A caller cannot accept on another account by supplying userId');
 const status=await GET();assert.equal((await status.json()).accepted,true);assert.match(status.headers.get('cache-control'),/no-store/);assert.equal(status.headers.get('vary'),'Cookie');
 console.log('Policy API passed: authentication, explicit opt-in, current revision, account binding, reverse-proxy origin, cross-site rejection and private caching.');
})().catch(error=>{console.error(error);process.exitCode=1});
