const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const {createHash, webcrypto} = require('node:crypto');
function load(file, dependencies = {}, extra = {}) {
  const fixtureModule = {exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,{module:fixtureModule,exports:fixtureModule.exports,require:name=>{assert.ok(name in dependencies,'Unexpected import '+name);return dependencies[name]},console,Buffer,File,Blob,Request,Response,DOMException,AbortSignal,crypto:webcrypto,setTimeout:resolve=>{resolve();return 0},...extra},{filename:file});
  return fixtureModule.exports;
}
const policy = load('lib/release-document-policy.ts');
const mime = load('lib/upload-mime.ts');
let userId=60, session, calls=[], failures=0, completeCalls=0, rejectStatus=0;
const next={NextResponse:{json:(body,init)=>Response.json(body,init)}};
const prisma={release:{findFirst:async({where})=>where.userId===60&&where.id===116?{id:116}:null},track:{count:async()=>0},uploadSession:{findFirst:async({where})=>session&&session.fileFingerprint===where.fileFingerprint&&session.userId===where.userId&&session.chunkSize===where.chunkSize?session:null,create:async({data})=>(session={...data,id:'fixture-upload'})}};
const route=load('app/api/uploads/sessions/route.ts',{'next/server':next,'node:crypto':require('node:crypto'),'@/lib/upload-mime':mime,'@/lib/access':{requireUser:async()=>({user:{id:userId}})},'@/lib/prisma':{prisma},'@/lib/storage-service':{uploadConfig:{chunkSize:8*1024*1024,sessionHours:48},createSafeAssetFolderName:()=>{}},'@/lib/release-document-policy':policy});
const received=new Map();
const client=load('lib/client-release-document-upload.ts',{'./upload-mime':mime,'./release-document-policy':policy},{fetch:async(url,init)=>{
 calls.push({url,init});
 if(rejectStatus)return Response.json({error:'Session expired fixture'},{status:rejectStatus});
 if(url==='/api/uploads/sessions')return route.POST(new Request('https://hymn.fixture'+url,init));
 if(url.includes('/chunks/')){
   const i=Number(url.split('/').at(-1));const bytes=Buffer.from(await init.body.arrayBuffer());assert.ok(bytes.length<=512*1024);assert.equal(createHash('sha256').update(bytes).digest('hex'),session.chunkHashes[i]);
   if(i===1&&failures++===0)throw new TypeError('Network connection reset');
   received.set(i,bytes);return Response.json({ok:true});
 }
 if(url.endsWith('/complete')){completeCalls++;if(completeCalls===1)return Response.json({session},{status:202});assert.equal(Buffer.concat([...received.values()]).length,session.totalSize);return Response.json({asset:{downloadPath:'/api/assets/999/download'}})}
 throw Error('Unexpected URL '+url);
}});
(async()=>{
 const bytes=Buffer.alloc(1200000);bytes.write('%PDF-1.7');const file=new File([bytes],'beat-license.PDF',{type:''});let progress=0;
 assert.equal(await client.uploadReleaseDocument(file,'private_ownership_proof',{releaseId:116,onProgress:loaded=>progress=loaded}),'/api/assets/999/download');assert.equal(progress,file.size);assert.equal(session.assetCategory,'RELEASE_LICENSE_RECEIPT');assert.equal(session.mimeType,'application/pdf');assert.equal(session.chunkSize,512*1024);assert.equal(failures,2);assert.equal(completeCalls,2);
 const prior=calls.length;await assert.rejects(()=>client.uploadReleaseDocument(new File(['x'],'license.png',{type:'image/png'}),'private_ownership_proof',{releaseId:116}),/PDF/);await assert.rejects(()=>client.uploadReleaseDocument(new File([new Uint8Array(10*1024*1024+1)],'large.pdf',{type:'application/pdf'}),'private_ownership_proof',{releaseId:116}),/10 MB/);assert.equal(calls.length,prior);
 calls=[];rejectStatus=401;await assert.rejects(()=>client.uploadReleaseDocument(file,'private_ownership_proof',{releaseId:116}),/Session expired/);assert.equal(calls.length,1);rejectStatus=0;
 const controller=new AbortController();controller.abort();await assert.rejects(()=>client.uploadReleaseDocument(file,'private_ownership_proof',{releaseId:116,signal:controller.signal}),{name:'AbortError'});
 const original=session;session={...session,uploadedChunks:[0,1]};calls=[];received.clear();received.set(0,bytes.subarray(0,512*1024));received.set(1,bytes.subarray(512*1024,1024*1024));await client.uploadReleaseDocument(file,'private_ownership_proof',{releaseId:116});assert.equal(calls.filter(c=>c.url.includes('/chunks/')).length,1);assert.equal(calls.find(c=>c.url.includes('/chunks/')).url.split('/').at(-1),'2');
 userId=61;const denied=await route.POST(new Request('https://hymn.fixture/api/uploads/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({releaseId:116,assetCategory:'RELEASE_LICENSE_RECEIPT',originalFilename:'license.pdf',mimeType:'application/pdf',totalSize:1})}));assert.equal(denied.status,404);
 userId=60;for(const bad of [{mimeType:'image/png',totalSize:1},{mimeType:'application/pdf',totalSize:10*1024*1024+1}]){const response=await route.POST(new Request('https://hymn.fixture/api/uploads/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({releaseId:116,assetCategory:'RELEASE_LICENSE_RECEIPT',originalFilename:'license.pdf',...bad})}));assert.equal(response.status,400)}
 assert.equal(original.totalChunks,3);
 // Exercise the actual completion route for each document purpose. Storage and
 // database boundaries are isolated; authorization and type binding stay real.
 let finalSession, validations=0, creates=0;
 const pdfBytes=Buffer.from('%PDF-1.7 fixture license');
 const completionPrisma={uploadSession:{findFirst:async({where})=>where.userId===60?finalSession:null,updateMany:async()=>({count:1}),update:async({data})=>(finalSession={...finalSession,...data})},storedAsset:{create:async({data})=>{creates++;assert.equal(data.accessClassification,'private');assert.equal(data.ownerUserId,60);assert.equal(data.releaseId,116);return {id:999,...data}}}};
 completionPrisma.$transaction=async operation=>operation(completionPrisma);
 const complete=load('app/api/uploads/sessions/[id]/complete/route.ts',{'node:path':require('node:path'),'node:fs/promises':{readFile:async()=>pdfBytes},'node:crypto':require('node:crypto'),'next/server':next,'@/lib/access':{requireUser:async()=>({user:{id:userId}})},'@/lib/prisma':{prisma:completionPrisma},'@/lib/release-document-policy':policy,'@/lib/storage-service':{finalRelativePath:async()=>'/fixture/license.pdf',validateSessionHeader:(mime,bytes)=>assert.equal(bytes.toString().slice(0,4),'%PDF'),localStorageProvider:{assemble:async()=>({path:'/fixture/assembled',header:pdfBytes,size:pdfBytes.length,checksum:'checked'}),moveAssembled:async()=>{},removeTemp:async()=>{}}},'@/lib/private-storage':{validatePrivateUpload:input=>{validations++;assert.equal(input.bytes,pdfBytes);assert.equal(policy.releaseDocumentPolicies[input.assetType].category,finalSession.assetCategory)}},'@/lib/media-integrity':{}});
 for(const [assetType,config] of Object.entries(policy.releaseDocumentPolicies)){
   finalSession={id:'fixture-upload',userId:60,releaseId:116,assetCategory:config.category,originalFilename:'license.pdf',mimeType:'application/pdf',totalSize:pdfBytes.length,totalChunks:1,uploadedChunks:[0],status:'UPLOADING',expiresAt:new Date(Date.now()+60000)};
   const response=await complete.POST(new Request('https://hymn.fixture/complete',{method:'POST'}),{params:Promise.resolve({id:'fixture-upload'})});assert.equal(response.status,201);assert.equal(finalSession.status,'COMPLETED');
   finalSession.finalAsset={id:999,safeFilename:'license.pdf',assetType};const replay=await complete.POST(new Request('https://hymn.fixture/complete',{method:'POST'}),{params:Promise.resolve({id:'fixture-upload'})});assert.equal(replay.status,200);
 }
 assert.equal(validations,3);assert.equal(creates,3);userId=61;assert.equal((await complete.POST(new Request('https://hymn.fixture/complete',{method:'POST'}),{params:Promise.resolve({id:'fixture-upload'})})).status,404);

 console.log('PASS document uploads: real session route, MIME inference, small checked chunks, network retry, resume, 202 completion, expiry, cancellation, size/type limits and release ownership.');
})().catch(e=>{console.error(e);process.exitCode=1});
