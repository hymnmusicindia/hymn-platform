import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { answerSupportQuestion } from '../lib/support-chat-knowledge';
const require=createRequire(import.meta.url);
class SupportError extends Error {constructor(message:string,public status=400){super(message);}}
let session:any=null,allowed=true,writes=0,reads=0;
const module={exports:{} as any};
const code=ts.transpileModule(fs.readFileSync('app/api/support-chat/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:module.exports,URL,Request,console,require:(id:string)=>{
  if(id==='@/lib/session')return {getSession:async()=>session};
  if(id==='@/lib/request-origin')return {isSameAppOrigin:(request:Request)=>request.headers.get('origin')==='https://hymn.test'};
  if(id==='@/lib/rate-limit')return {consumeRateLimit:async()=>({allowed}),requestIdentity:()=> 'fixture'};
  if(id==='@/lib/support-chat')return {supportChatContext:async(userId:number)=>{reads++;return {authenticated:true,releases:[{id:userId}]};},createChatSupportTicket:async()=>{writes++;return {id:77};}};
  if(id==='@/lib/support-chat-knowledge')return {answerSupportQuestion,supportServices:['distribution','beats','studio','payments','account','general']};
  if(id==='@/lib/support')return {SupportError};
  return require(id);
}});
const post=(body:unknown,origin='https://hymn.test')=>module.exports.POST(new Request('https://hymn.test/api/support-chat',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
async function main(){
  assert.equal((await post({action:'ticket'})).status,401);assert.equal(writes,0);
  assert.equal((await post({action:'answer',message:'Where is my UPC?'},'https://other.test')).status,403);
  assert.equal((await module.exports.POST(new Request('https://hymn.test/api/support-chat',{method:'POST',headers:{origin:'https://hymn.test'},body:'{bad'}))).status,400);
  assert.equal((await post({action:'answer',message:'a'.repeat(17000)})).status,413);
  assert.equal((await post({action:'answer',message:'a'.repeat(3001)})).status,400);
  assert.equal((await post({action:'answer',message:'pricing',service:'invalid'})).status,400);
  assert.equal((await post({action:'delete'})).status,400);
  const answer=await post({action:'answer',message:'Where is my UPC?'});assert.equal(answer.status,200);assert.equal((await answer.json()).answer.title,'Find a UPC or ISRC');assert.match(answer.headers.get('cache-control')!,/no-store/);
  const guest=await module.exports.GET(new Request('https://hymn.test/api/support-chat'));assert.equal((await guest.json()).authenticated,false);assert.equal(reads,0);
  session={sub:8};assert.equal((await module.exports.GET(new Request('https://hymn.test/api/support-chat?offset=-1'))).status,400);assert.equal(reads,0);
  const context=await module.exports.GET(new Request('https://hymn.test/api/support-chat'));assert.equal((await context.json()).releases[0].id,8);
  allowed=false;assert.equal((await post({action:'ticket'})).status,429);assert.equal(writes,0);assert.equal((await module.exports.GET(new Request('https://hymn.test/api/support-chat'))).status,429);
  allowed=true;assert.equal((await post({action:'ticket'})).status,201);assert.equal(writes,1);
  console.log('PASS support chat API: guest/private separation, authentication, origin enforcement, malformed/oversized requests, action/service validation, rate limits, no-store responses and trusted session identity.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
