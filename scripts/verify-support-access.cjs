const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let admin=false, member=false, active=true, granted=false, signedIn=true, queued=0;
const denied=()=>({error:Response.json({error:'Forbidden'},{status:403})});
const mocks={
  'server-only':{},
  './access':{requireAdminPermission:async()=>admin?{sub:1}:denied()},
  './team/access':{teamActor:async()=>{if(!member||!active)throw Error('Inactive');return {userId:2};}},
  './team/policy':{can:()=>granted},
  'next/server':{NextResponse:Response,after:()=>{}},
  '@/lib/request-origin':{isSameAppOrigin:()=>true},
  '@/lib/access':{requireUser:async()=>signedIn?{user:{id:3}}:{error:Response.json({},{status:401})}},
  '@/lib/prisma':{prisma:{}},
  '@/lib/rate-limit':{consumeRateLimit:async()=>({allowed:true})},
  '@/lib/db':{listAllSupportTickets:async()=>[{id:10,userId:8}],listSupportTicketsByUser:async userId=>[{id:11,userId}]},
  '@/lib/task-queue':{}, '@/lib/audit-log':{},
  '@/lib/support':{SupportError:class extends Error{},queueSupportReply:async(id,authorId)=>{queued++;return {id,authorId}},readSupportTicket:async id=>({id})}
};
function load(file){const box={exports:{},require:name=>{assert.ok(name in mocks,name);return mocks[name]},Response,Request,URL,console};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box);return box.exports;}
(async()=>{
  const access=load('lib/support-access.ts');mocks['@/lib/support-access']=access;
  const route=load('app/api/support-tickets/route.ts');
  let response=await route.GET();assert.equal((await response.json()).tickets[0].userId,3);
  const reply=()=>route.POST(new Request('https://hymn.fixture/api/support-tickets',{method:'POST',body:JSON.stringify({action:'send-reply',ticketId:10})}));
  assert.equal((await reply()).status,403);assert.equal(queued,0);
  member=true;assert.equal((await reply()).status,403);
  granted=true;response=await route.GET();assert.equal((await response.json()).reviewer,true);assert.match(response.headers.get('cache-control'),/private, no-store/);
  assert.equal((await reply()).status,200);assert.equal(queued,1);
  active=false;assert.equal((await reply()).status,403);
  admin=true;assert.equal((await reply()).status,200);
  admin=false;member=false;signedIn=false;assert.equal((await route.GET()).status,401);
  mocks['@/lib/customer-message']={customerBrandText:value=>value};
  mocks['@/lib/public-app-url']={getPublicAppUrl:()=> 'https://hymn.fixture'};
  const template=load('lib/email/email-templates.ts').emailLayout({title:'Support update',body:'Writing to you: Aditya Ujjain\nFounder, HYMN Music\n<script>unsafe</script>',ctaLabel:'View support ticket',ctaUrl:'https://hymn.fixture/dashboard?tab=support'});
  assert.match(template,/hymnlogowhite\.png/);assert.match(template,/Founder, HYMN Music/);assert.ok(!template.includes('<script>'));assert.match(template,/&lt;script&gt;/);
  console.log('PASS support access: personal scope, shared inbox, staff permission, inactive membership, admin, anonymous and reply authorization.');
})().catch(error=>{console.error(error);process.exitCode=1;});
