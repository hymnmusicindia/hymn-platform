import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import ts from 'typescript';
import {prisma} from '../lib/prisma';import {desktopTaskScope,desktopTaskAlert} from '../lib/admin-desktop-feed';
const require=createRequire(import.meta.url);let session:any=null,permissions=['releases.read'],allowed=true;
const module={exports:{} as any};const code=ts.transpileModule(fs.readFileSync('app/api/admin/desktop/events/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:module.exports,URL,Date,console,require:(id:string)=>{if(id==='@/lib/session')return {getSession:async()=>session};if(id==='@/lib/access')return {getAdminAccessForPage:async()=>({permissions})};if(id==='@/lib/prisma')return {prisma};if(id==='@/lib/rate-limit')return {consumeRateLimit:async()=>({allowed})};if(id==='@/lib/admin-desktop-feed')return {desktopTaskScope,desktopTaskAlert};return require(id);}});
const get=(query='')=>module.exports.GET(new Request('https://hymn.test/api/admin/desktop/events'+query));
async function main(){
 assert.match(process.env.DATABASE_URL??'',/^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55473\/acquisition_fixture/);
 assert.equal((await get()).status,401);const user=await prisma.user.findUniqueOrThrow({where:{email:'desktop-admin@example.test'}});session={sub:user.id};permissions=[];assert.equal((await get()).status,403);permissions=['releases.read'];
 const at=new Date(Date.now()-10000),until=new Date(Date.now()+1000).toISOString();
 const release=await prisma.release.create({data:{userId:user.id,title:'Private submission',artistName:'Private artist',genre:'Pop',releaseDate:new Date('2099-01-01'),status:'LIVE'}});
 await prisma.adminTask.createMany({data:Array.from({length:150},(_,index)=>({eventKey:`desktop-page-${index}`,type:'Review',title:'Private evidence',body:'Private contact',href:'/admin',entityType:'release',entityId:String(release.id),createdAt:at,updatedAt:at}))});
 await prisma.releaseStatusTransition.createMany({data:Array.from({length:150},()=>({releaseId:release.id,previousStatus:'DRAFT' as const,newStatus:'SUBMITTED' as const,actorType:'user',createdAt:at}))});
 let query=`?since=${encodeURIComponent(new Date(at.getTime()-1000).toISOString())}&until=${encodeURIComponent(until)}`,pages=0;const seen=new Set<string>();
 do{const response=await get(query);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/);const body=await response.json();assert.doesNotMatch(JSON.stringify(body),/Private/);for(const event of body.events){assert.ok(!seen.has(event.key),'No equal-timestamp source is repeated or skipped.');seen.add(event.key);}pages++;if(!body.next)break;query=`?since=${encodeURIComponent(body.next.since)}&after=${body.next.after}&until=${encodeURIComponent(body.until)}`;}while(pages<10);
 assert.equal(seen.size,301);assert.equal([...seen].filter(key=>key.startsWith('submission:')).length,150,'Fast completed submissions remain observable independently of mutable tasks.');assert.ok(pages>=4);
 permissions=['services.manage'];const support=await (await get(`?until=${encodeURIComponent(until)}`)).json();assert.equal(support.events.length,1);assert.equal(support.events[0].category,'support');
 assert.equal((await get('?since=invalid')).status,400);assert.equal((await get('?after=-1')).status,400);allowed=false;assert.equal((await get()).status,429);
 console.log('PASS real DB desktop feed: 301 interleaved events with equal timestamps across four pages, immutable completed submissions, private summaries, service-only filtering, auth, invalid cursors and rate limits.');
}
main().finally(()=>prisma.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
