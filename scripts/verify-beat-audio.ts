import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { audioRange } from "../lib/audio-range";
import { buildBeatStorefront } from "../lib/beat-store";

async function main() {
  assert.deepEqual(audioRange("bytes=2-4", 10), { start:2, end:4 });
  assert.deepEqual(audioRange("bytes=-3", 10), { start:7, end:9 });
  assert.deepEqual(audioRange("bytes=5-", 10), { start:5, end:9 });
  for (const value of ["bytes=10-", "bytes=4-2", "bytes=-0", "bytes=0-1,3-4", "garbage"]) assert.equal(audioRange(value,10),null);
  mkdirSync(".cache", {recursive:true});
  await build({ entryPoints:["app/api/beats/[id]/audio/route.ts"], outfile:".cache/beat-audio-test.cjs", bundle:true, platform:"node", format:"cjs", packages:"external", plugins:[{name:"adapters",setup(builder) {
    builder.onResolve({filter:/^@\/lib\/(prisma|private-storage)$/}, args=>({path:args.path,namespace:"test"}));
    builder.onLoad({filter:/.*/,namespace:"test"}, args=>({contents:args.path.endsWith("prisma") ? `exports.prisma={beat:{findFirst:async ({where})=>{const b=globalThis.fixture;return b&&b.id===where.id&&b.enabled&&where.status.in.includes(b.status)?b:null}}}` : `exports.localPrivateStorage={createAuthorizedRead:async input=>{globalThis.readInput=input;return {bytes:Buffer.from('0123456789'),mimeType:'audio/mpeg'}}}` }));
  }}] });
  const modulePath = "../.cache/beat-audio-test.cjs";
  const { GET } = await import(modulePath);
  const state=globalThis as typeof globalThis & {fixture:any;readInput:any};
  const beat={id:7,enabled:true,status:"PUBLISHED",preview:null,deliverableAsset:{id:9,ownerUserId:4,assetType:"private_beat_deliverable",mimeType:"audio/mpeg"}};
  const request=(range?:string)=>GET(new Request("http://localhost/api/beats/7/audio",{headers:range?{range}:{}}),{params:Promise.resolve({id:"7"})});
  state.fixture=beat;
  let response=await request();assert.equal(response.status,200);assert.equal(await response.text(),"0123456789");assert.equal(state.readInput.isAdmin,false);
  response=await request("bytes=2-4");assert.equal(response.status,206);assert.equal(await response.text(),"234");assert.equal(response.headers.get("content-range"),"bytes 2-4/10");
  assert.equal((await request("bytes=20-")).status,416);
  for (const patch of [{enabled:false},{status:"PENDING_REVIEW"},{status:"DRAFT"},{preview:{publicUrl:"/uploads/preview.mp3"}},{deliverableAsset:null}]) {
    state.fixture={...beat,...patch};assert.equal((await request()).status,404);
  }
  const sample:any={id:7,producerId:4,title:"Test",enabled:true,genre:"Trap",mood:"Dark",bpm:120,price:120,fileUrl:"/api/beats/7/audio"};
  assert.equal(buildBeatStorefront([sample]).catalog[0].fileUrl,"/api/beats/7/audio");
  assert.equal(buildBeatStorefront([{...sample,previewUrl:"/uploads/preview.mp3"}]).catalog[0].fileUrl,"/uploads/preview.mp3");
  console.log("PASS master fallback, preview priority, published-state gates and audio seeking");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
