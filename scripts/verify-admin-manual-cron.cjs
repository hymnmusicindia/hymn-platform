const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let role='super_admin', allowed=true, calls=0, writes=0, origin='https://hymn.local';
process.env.CRON_SECRET='fixture-secret';
let payload={success:true,processedCount:2,errorCount:1,results:[{releaseId:81,title:'YAMUNAWOOD',success:true,status:'changes_required'}]};
const mocks={
  '@/lib/public-app-url':{getPublicAppUrl:()=> 'https://hymn.local'},
  'next/server':{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)}},
  '@/lib/access':{requireAdminPermission:async permission=>{assert.equal(permission,'system.manage');return allowed?{sub:1,adminRole:role}:{error:new Response('{}',{status:403})};}},
  '@/lib/prisma':{prisma:{auditLog:{create:async()=>{writes++;return{id:1}},update:async()=>({})}}},
  '@/lib/direnote':{redactDireNoteDiagnostic:value=>value},
  '@/app/api/cron/direnote-release-sync/route':{GET:async request=>{calls++;assert.equal(request.headers.get('authorization'),'Bearer fixture-secret');return new Response(JSON.stringify(payload));}}
};
const sandbox={exports:{},require:name=>{assert.ok(mocks[name],name);return mocks[name]},Request,process,URL,console};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/admin/cron/release-status/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const run=()=>sandbox.exports.POST(new Request('https://hymn.local/api/admin/cron/release-status',{method:'POST',headers:{origin}}));
(async()=>{
  allowed=false;assert.equal((await run()).status,403);assert.equal(calls,0);
  allowed=true;role='distribution_operator';assert.equal((await run()).status,403);assert.equal(calls,0);
  role='super_admin';origin='https://evil.invalid';assert.equal((await run()).status,403);assert.equal(writes,0);
  origin='https://hymn.local';const response=await run();assert.equal(response.status,200);assert.equal((await response.json()).errorCount,1);assert.equal(calls,1);assert.equal(writes,1);
  payload={success:true,skipped:'already_running'};assert.equal((await(await run()).json()).skipped,'already_running');
  role='owner';assert.equal((await run()).status,200);
  delete process.env.CRON_SECRET;assert.equal((await run()).status,503);
  console.log('PASS super-admin enforcement, owner access, CSRF rejection, server-only secret, audit, partial results and overlap handling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
