/* Exercise stream delivery and authorization without a database or network. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const esbuild=require('esbuild');
(async()=>{
  const output=path.resolve('.cache/team-chat-stream-test.cjs');
  const state=global.__teamStreamTest={revision:0,status:0,reads:0};
  await esbuild.build({stdin:{contents:`export { GET } from './app/api/team/chat-stream/route'; export { publishChatChange } from './lib/team/chat-events';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:output,plugins:[{name:'isolated-team-api',setup(build){
    build.onResolve({filter:/^@\/lib\/team\/(access|service|chat|policy)$/},args=>({path:args.path,namespace:'mock'}));
    build.onLoad({filter:/.*/,namespace:'mock'},args=>{
      if(args.path.endsWith('/policy'))return {contents:`export class TeamError extends Error { constructor(message,status){super(message);this.status=status;} }`,loader:'js'};
      if(args.path.endsWith('/access'))return {contents:`import {TeamError} from '@/lib/team/policy';export async function teamActor(){const s=global.__teamStreamTest;if(s.status)throw new TeamError('Denied',s.status);return {workspaceId:'workspace-1'};}`,loader:'js'};
      const name=args.path.endsWith('/chat')?'chatRead':'teamRead';
      return {contents:`export async function ${name}(actor,resource,params){const s=global.__teamStreamTest;s.reads++;s.lastResource=resource;return {items:[{id:'message-'+s.revision}],peer:params.get('peer')};}`,loader:'js'};
    });
  }}]});
  const {GET,publishChatChange}=require(output),decoder=new TextDecoder();
  const next=reader=>Promise.race([reader.read().then(x=>decoder.decode(x.value)),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Stream did not deliver promptly')),1200);timer.unref();})]);
  let response=await GET(new Request('https://hymn.test/api/team/chat-stream?view=native&workspace=workspace-1&channel=chat-1&peer=peer-1'));
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/event-stream/);
  let reader=response.body.getReader();assert.match(await next(reader),/message-0/);assert.equal(state.lastResource,'chat-messages');
  const before=state.reads;publishChatChange('other-workspace','chat-1');publishChatChange('workspace-1','other-chat');await new Promise(r=>setTimeout(r,150));assert.equal(state.reads,before,'Unrelated events must not read another conversation');
  state.revision=1;publishChatChange('workspace-1','chat-1');assert.match(await next(reader),/message-1/);
  state.status=403;publishChatChange('workspace-1','chat-1');const revoked=await next(reader);assert.match(revoked,/event: unavailable/);assert.match(revoked,/403/);assert.equal((await reader.read()).done,true);
  response=await GET(new Request('https://hymn.test/api/team/chat-stream?view=native&list=1'));assert.equal(response.status,403,'Denied members never receive stream data');
  state.status=0;response=await GET(new Request('https://hymn.test/api/team/chat-stream?view=native&list=1'));reader=response.body.getReader();await next(reader);assert.equal(state.lastResource,'chat-conversations');state.revision=2;publishChatChange('workspace-1','any-chat');assert.match(await next(reader),/message-2/);await reader.cancel();const after=state.reads;publishChatChange('workspace-1','any-chat');await new Promise(r=>setTimeout(r,150));assert.equal(state.reads,after,'Cancelled streams release listeners');
  console.log('PASS: initial data, conversation isolation, live delivery, permission revocation, directory updates and cleanup');delete global.__teamStreamTest;
})().catch(error=>{console.error(error);process.exitCode=1;});
