const assert=require('node:assert/strict');
const {build}=require('esbuild');
const Module=require('node:module');
async function main(){
  const result=await build({stdin:{contents:"export {resolvePrivateReleaseArtworkUrl} from './lib/release-asset-resolution';export {validateReleaseDocument} from './lib/release-attachment-validation';export {saveReleaseTracks} from './lib/release-track-save';export {assertDireNoteAssetFormat} from './lib/distribution-asset-format';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'isolated-db',setup(b){b.onResolve({filter:/^(server-only|@\/lib\/prisma|\.\/prisma)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='server-only'?'':'export const prisma={};'}));}}]});
  const mod=new Module(__filename);mod._compile(result.outputFiles[0].text,__filename);const {resolvePrivateReleaseArtworkUrl:resolve,validateReleaseDocument:document,saveReleaseTracks:save,assertDireNoteAssetFormat:format}=mod.exports;
  const releases=[{id:1,userId:7,ownerUserId:null,releaseSource:'CUSTOMER',artworkUrl:'/api/assets/10/download'}, {id:2,userId:7,ownerUserId:null,releaseSource:'CUSTOMER',artworkUrl:'/api/releases/1/artwork'}, {id:3,userId:7,ownerUserId:null,releaseSource:'CUSTOMER',artworkUrl:'/api/releases/2/artwork'}, {id:4,userId:8,ownerUserId:null,releaseSource:'CUSTOMER',artworkUrl:'/api/assets/11/download'}, {id:5,userId:7,ownerUserId:null,releaseSource:'CUSTOMER',artworkUrl:'/api/releases/5/artwork'}, {id:6,userId:7,ownerUserId:null,releaseSource:'CUSTOMER',artworkUrl:'/api/releases/7/artwork'}, {id:7,userId:7,ownerUserId:null,releaseSource:'CUSTOMER',artworkUrl:'/api/releases/6/artwork'}, {id:8,userId:7,ownerUserId:8,releaseSource:'ADMIN_MANUAL',artworkUrl:'/api/assets/11/download'}];
  const assets=[{id:10,ownerUserId:7,releaseId:1,assetType:'private_unreleased_artwork',mimeType:'image/jpeg',safeFilename:'cover #1.jpg',uploadStatus:'ready',deletedAt:null}, {id:11,ownerUserId:8,releaseId:4,assetType:'private_unreleased_artwork',mimeType:'image/jpeg',safeFilename:'other.jpg',uploadStatus:'ready',deletedAt:null}, ...['private_cover_licence','private_ownership_proof','private_ai_receipt'].map((assetType,i)=>({id:20+i,ownerUserId:7,releaseId:1,assetType,mimeType:'application/pdf',safeFilename:'proof.pdf',uploadStatus:'ready',deletedAt:null}))];
  function matches(row,where){return Object.entries(where).every(([key,value])=>key==='OR'?value.some(v=>matches(row,v)):value&&typeof value==='object'?'not'in value?row[key]!==value.not:'in'in value?value.in.includes(row[key]):'startsWith'in value?row[key]?.startsWith(value.startsWith):false:row[key]===value);}
  let queries=0;
  const db={release:{findFirst:async({where})=>{queries++;return releases.find(r=>matches(r,where))||null;}},storedAsset:{findFirst:async({where})=>{queries++;return assets.find(r=>matches(r,where))||null;}}};
  const art='/api/assets/10/download?filename=cover%20%231.jpg';
  for(const value of ['/api/assets/10/download','https://hymnmusic.fun/api/assets/10/download?filename=wrong.png','/api/releases/1/artwork','/api/releases/2/artwork','/api/releases/3/artwork'])assert.equal(await resolve({userId:7,releaseId:3,value},db),art);
  // Autosave's own display route resolves to the existing stored reference.
  assert.equal(await resolve({userId:7,releaseId:1,value:'/api/releases/1/artwork?filename=cover.jpg'},db),art);
  for(const id of [4,5,6,8]){queries=0;const value=`/api/releases/${id}/artwork`;assert.equal(await resolve({userId:7,releaseId:id,value},db),value);assert(queries<30,'Cycles and foreign ownership must terminate without traversing unbounded chains');}
  assert.equal(await resolve({userId:7,value:''},db),'');
  assets[0].deletedAt=new Date();assert.notEqual(await resolve({userId:7,releaseId:1,value:'/api/releases/1/artwork'},db),art);assets[0].deletedAt=null;
  assets[0].uploadStatus='uploading';assert.notEqual(await resolve({userId:7,releaseId:1,value:'/api/releases/1/artwork'},db),art);assets[0].uploadStatus='ready';
  for(const [kind,id]of [['cover',20],['ownership',21],['ai',22]]){
    assert.match(await document({userId:7,kind,value:`/api/assets/${id}/download?filename=forged.exe`},db),/filename=proof.pdf$/);
    await assert.rejects(document({userId:8,kind,value:`/api/assets/${id}/download`},db),/unavailable/);
    const a=assets.find(a=>a.id===id);for(const status of ['uploading','failed']){a.uploadStatus=status;await assert.rejects(document({userId:7,kind,value:`/api/assets/${id}/download`},db),/unavailable/);}a.uploadStatus='ready';
    a.deletedAt=new Date();await assert.rejects(document({userId:7,kind,value:`/api/assets/${id}/download`},db),/unavailable/);a.deletedAt=null;
    a.mimeType='application/x-msdownload';await assert.rejects(document({userId:7,kind,value:`/api/assets/${id}/download`},db),/unsupported/);a.mimeType='application/pdf';
  }
  await assert.rejects(document({userId:7,kind:'cover',value:'/api/assets/21/download'},db),/unsupported/);
  for(const value of ['javascript:alert(1)','file:///x.pdf','/api/assets/999/download','/api/assets/not-id/download','previously_uploaded'])await assert.rejects(document({userId:7,kind:'ownership',value,allowLink:true},db),/unavailable/);
  assert.equal(await document({userId:7,kind:'ownership',value:'https://example.test/proof.pdf',allowLink:true},db),'https://example.test/proof.pdf');
  await assert.rejects(document({userId:7,kind:'cover',value:'https://example.test/proof.pdf'},db),/unavailable/);
  const oldMode=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try{
    await format({userId:7,url:art,kind:'artwork',label:'Artwork'},db);
    for(const url of ['/api/releases/1/artwork','https://example.test/cover.jpg','https://example.test/api/assets/10/download','/api/assets/not-id/download'])await assert.rejects(format({userId:7,url,kind:'artwork',label:'Artwork'},db),/unavailable/);
    await assert.rejects(format({userId:8,url:art,kind:'artwork',label:'Artwork'},db),/unavailable/);
    assets.push({id:30,ownerUserId:7,releaseId:1,assetType:'private_audio_master',mimeType:'audio/wav',safeFilename:'master.wav',uploadStatus:'ready',deletedAt:null});
    const audio=assets.at(-1);for(const [mime,name]of [['audio/wav','master.wav'],['audio/x-wav','master.WAV'],['audio/mpeg','master.mp3']]){audio.mimeType=mime;audio.safeFilename=name;await format({userId:7,url:'/api/assets/30/download',kind:'audio',label:'Master'},db);}
    for(const [mime,name]of [['audio/flac','master.flac'],['audio/mpeg','master.exe'],['application/zip','master.wav']]){audio.mimeType=mime;audio.safeFilename=name;await assert.rejects(format({userId:7,url:'/api/assets/30/download',kind:'audio',label:'Master'},db),/WAV or MP3/);}
  }finally{if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;}
  const previous=[{id:100,trackNumber:1,title:'One',audioUrl:'/audio1',metadata:{clientTrackId:'one',coverLicenseUrl:'/api/assets/20/download'}},{id:101,trackNumber:2,title:'Two',audioUrl:'/audio2',metadata:{clientTrackId:'two',coverLicenseUrl:'/api/assets/22/download'}}];
  const rows=[{title:'Two',trackNumber:1,audioUrl:'/audio2',metadata:{clientTrackId:'two'}},{title:'One',trackNumber:2,audioUrl:'/audio1',metadata:{clientTrackId:'one'}}];
  await save({track:{findMany:async()=>previous,createMany:async()=>{},updateMany:async()=>{}},$executeRaw:async()=>2},1,rows,previous);
  assert.equal(rows[0].metadata.coverLicenseUrl,'/api/assets/22/download');assert.equal(rows[1].metadata.coverLicenseUrl,'/api/assets/20/download');
  const replaced=[{title:'One',trackNumber:1,metadata:{clientTrackId:'one',coverLicenseUrl:'/api/assets/21/download'}}];await save({track:{findMany:async({where})=>where.trackNumber?previous.slice(0,1):previous,createMany:async()=>{},updateMany:async()=>{}},$executeRaw:async()=>1},1,replaced,previous);assert.equal(replaced[0].metadata.coverLicenseUrl,'/api/assets/21/download');
  console.log('PASS attachment reuse: private artwork, autosave display routes, nested duplicates, cycles, ownership reassignment, deleted/incomplete uploads, document MIME/type/owner checks, external proof links, and licence-preserving track reorder/replacement.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
