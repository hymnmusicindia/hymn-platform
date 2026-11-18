import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import ts from 'typescript';
import {readJsonBody,RequestBodyError} from '../lib/request-body';
const require=createRequire(import.meta.url);let session:any=null,permissions:string[]=[],allowed=true,issued=0,exchanged=0,saved=0;
class DesktopAuthError extends Error{constructor(message:string,public status=400){super(message);}}
const module={exports:{} as any};const code=ts.transpileModule(fs.readFileSync('app/api/desktop-admin-auth/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:module.exports,console,require:(id:string)=>{
 if(id==='@/lib/session')return {getSession:async()=>session,createSession:async()=>{saved++;}};
 if(id==='@/lib/access')return {getAdminAccessForPage:async()=>({permissions}),isRecentAdminAuthentication:(iat:number)=>iat>Math.floor(Date.now()/1000)-900};
 if(id==='@/lib/request-origin')return {isSameAppOrigin:(request:Request)=>request.headers.get('origin')==='https://hymn.test'};
 if(id==='@/lib/rate-limit')return {consumeRateLimit:async()=>({allowed}),requestIdentity:()=> 'fixture'};
 if(id==='@/lib/request-body')return {readJsonBody,RequestBodyError};
 if(id==='@/lib/admin-desktop-auth')return {DesktopAuthError,desktopAdministrator:async()=>{},issueDesktopCode:()=>{issued++;return 'short-lived-code';},redeemDesktopCode:async(code:string,verifier:string)=>{exchanged++;if(code!=='valid'||verifier!=='proof')throw new DesktopAuthError('Invalid handoff',401);return {id:1,email:'admin@example.test',name:'Admin',avatar:null};}};
 return require(id);
}});
const post=(body:unknown,origin='https://hymn.test')=>module.exports.POST(new Request('https://hymn.test/api/desktop-admin-auth',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
async function main(){
 assert.equal((await post({action:'approve',challenge:'x'})).status,403);assert.equal(issued,0);
 session={sub:1,iat:Math.floor(Date.now()/1000)};assert.equal((await post({action:'approve',challenge:'x'})).status,403);
 permissions=['releases.read'];session.iat=0;assert.equal((await post({action:'approve',challenge:'x'})).status,401);session.iat=Math.floor(Date.now()/1000);
 assert.equal((await post({action:'approve',challenge:'x'},'https://evil.test')).status,403);
 const approved=await post({action:'approve',challenge:'x'});assert.equal(approved.status,200);assert.match(approved.headers.get('cache-control')!,/no-store/);assert.equal(issued,1);
 session=null;permissions=[];assert.equal((await post({action:'redeem',code:'invalid',verifier:'proof'})).status,401);assert.equal(saved,0);
 assert.equal((await post({action:'redeem',code:'valid',verifier:'proof'})).status,200);assert.equal(saved,1,'Only verified handoff creates a new app session.');
 assert.equal((await post({action:'redeem',code:'valid',verifier:'proof'},'https://evil.test')).status,403);assert.equal(saved,1);
 assert.equal((await post({action:'approve',padding:'x'.repeat(6000)})).status,413);
 assert.equal((await module.exports.POST(new Request('https://hymn.test/api/desktop-admin-auth',{method:'POST',headers:{origin:'https://hymn.test','Content-Type':'application/json'},body:'{'}))).status,400);
 allowed=false;assert.equal((await post({action:'redeem',code:'valid',verifier:'proof'})).status,429);
 assert.equal(exchanged,2);console.log('PASS desktop API: recent admin approval, CSRF, public proof-bound exchange, no session on failure, bounded JSON, rate limits and no-store.');
}main().catch(error=>{console.error(error);process.exitCode=1;});
