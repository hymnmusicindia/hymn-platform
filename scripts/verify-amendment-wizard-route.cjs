const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
(async () => {
  const file = path.resolve('.cache/amendment-wizard-route.cjs');
  await build({ entryPoints: ['app/api/distribution/amend-release/route.ts'], outfile: file, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'fixture', setup(b) {
    const mocks = {
      'next/server': 'export class NextResponse {static json(value, options) {return Response.json(value,options);}};export const after=()=>{};',
      '@/lib/release-amendment-automation': 'export const processAutomaticAmendment=async()=>{};',
      '@/lib/release-amendment-notifications': 'export const enqueueAmendmentUpdate=async()=>1;export const amendmentTransactionOptions={timeout:30000};',
      '@/lib/session': 'export const getSession=async()=>global.fixture.session;',
      '@/lib/policy-agreement': 'export const requireCurrentPolicyAcceptance=async()=>null;',
      '@/lib/distribution-db': 'export const getDetailedReleaseById=async()=>global.fixture.release;export const deserializeRelease=()=>global.fixture.currentRelease||global.fixture.release;',
      'server-only': '',
      '@/lib/prisma': 'export const prisma=new Proxy({}, {get:(_,key)=>global.fixture.db[key]});',
      '@/lib/distribution-asset-format': 'export const assertDireNoteAssetFormat=async()=>{if(global.fixture.missingAsset)throw Error("Original master unavailable");};',
      '@/lib/release-asset-resolution': 'export const resolvePrivateReleaseArtworkUrl=async({value})=>value;',
      '@/lib/release-artist-verification': 'export const selectedReleaseArtistIds=tracks=>[...new Set(tracks.flatMap(t=>t.artistProfileIds))];'
    };
    b.onResolve({filter:/^next\/server$/},()=>({path:'next/server',namespace:'mock'}));
    b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'mock'}));
    b.onResolve({ filter: /^@\/lib\// }, a => mocks[a.path] ? { path: a.path, namespace: 'mock' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: mocks[a.path] }));
  } }] });
  const revisionFile=path.resolve('.cache/amendment-revision-fixture.cjs');
  await build({entryPoints:['lib/release-amendment-revision.ts'],outfile:revisionFile,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'server',setup(b){b.onResolve({filter:/^next\/server$/},()=>({path:'next/server',namespace:'mock'}));
    b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
  const {amendmentSourceRevision,matchesAmendmentSourceRevision}=require(revisionFile);
  const version = '2026-10-22T10:00:00.000Z';
  const original = { id: 25, userId: 51, status: 'live', draftVersion: version, upcCode: '3473620314135', tracks: [{ id: 400, trackNumber: 1, isrc: 'INDN22602494', trackTitle: 'Original title' }] };
  let created = null, writes = 0;
  const tx = { $executeRaw: async()=>0, release: { findFirstOrThrow: async()=>({ id:25, status:global.fixture.status||'LIVE', upc: original.upcCode, updatedAt: new Date(global.fixture.currentVersion||version), tracks: original.tracks }) }, releaseChangeRequest: { findFirst:async()=>created, create:async({data})=>{writes++;return created={id:1,...data};},update:async({data})=>{writes++;return created={...created,...data};} }, releaseChangeRequestEvent:{create:async()=>({id:1})},auditLog:{create:async()=>{}} };
  global.fixture = { session:{sub:51}, release: original, db:{artistCard:{count:async()=>1},$transaction:async fn=>fn(tx)} };
  const { POST } = require(file);
  const metadata = { editReleaseId:25, artistName:'Deepan Aggarwal', releaseTitle:'Updated title', releaseType:'single',releaseDate:'2026-11-20',recordLabelName:'HYMN',primaryGenre:'Pop',secondaryGenre:'Pop',language:'Hindi',territory:'Worldwide',upcCode:original.upcCode,releaseTiming:'quick_release',platforms:['Spotify'],copyrightOwner:'Deepan Aggarwal',publishingRights:'Deepan Aggarwal',legal:Object.fromEntries(['ownershipConfirmation','noInfringement','collaboratorsCredited','platformGuidelines','hymnNotLiable','termsAccepted','falseMetadataAcknowledged','fraudWarningAccepted'].map(k=>[k,true])),paymentModel:'one_time',plan:'one_time',artworkFileKey:'artwork',existingArtworkUrl:'/api/assets/68/download',tracks:[{trackNumber:1,trackTitle:'Updated title',primaryArtist:'Deepan Aggarwal',artistProfileIds:[10],songwriters:'Deepan',composers:'Deepan',producers:'Deepan',isrc:'INDN22602494',isCover:false,coverLicenseConfirmed:false,audioFileKey:'audio-0',existingAudioUrl:'/api/assets/99/download',duration:'04:12',explicitContent:false,dolbyAtmos:false}] };
  const send = (data=metadata, source=version, revision=global.fixture.revision) => {const form=new FormData();form.set('payload',JSON.stringify({metadata:data}));form.set('sourceUpdatedAt',source);if(revision)form.set('sourceRevision',revision);return POST(new Request('http://localhost/api/distribution/amend-release',{method:'POST',body:form}));};
  global.fixture.session=null;assert.equal((await send()).status,401);global.fixture.session={sub:99};const denied=await send();assert.equal(denied.status,404,await denied.text());global.fixture.session={sub:51};
  assert.equal((await send({...metadata,upcCode:'3473620319079'})).status,409);
  assert.equal((await send(metadata,'stale')).status,409);
  global.fixture.missingAsset=true;assert.equal((await send()).status,409);global.fixture.missingAsset=false;
  global.fixture.revision=amendmentSourceRevision(original);
  assert(matchesAmendmentSourceRevision({...original,draftVersion:'background',direNoteLastSyncedAt:'new',status:'partially_live'},global.fixture.revision));
  assert(!matchesAmendmentSourceRevision({...original,releaseTitle:'Changed by another editor'},global.fixture.revision));
  assert(!matchesAmendmentSourceRevision({...original,userId:99},global.fixture.revision));
  global.fixture.currentRelease={...original,releaseTitle:'Changed by another editor'};assert.equal((await send()).status,409);delete global.fixture.currentRelease;
  assert.equal((await send(metadata,version,'f'.repeat(64))).status,409);
  global.fixture.status='DRAFT';assert.equal((await send()).status,409);delete global.fixture.status;
  global.fixture.currentVersion='2026-10-22T12:00:00.000Z';
  let response=await send();let result=await response.json();assert.equal(response.status,201,JSON.stringify(result));assert.equal(result.request.requestedChanges.wizard_metadata.requested.releaseTitle,'Updated title');
  assert.equal(original.status,'live');assert.equal(original.tracks[0].trackTitle,'Original title');assert.equal(original.upcCode,'3473620314135');
  assert.equal((await send()).status,201);assert.equal(writes,1);
  const duplicate=await send({...metadata,releaseTitle:'Another version'});assert.equal(duplicate.status,409);const duplicateBody=await duplicate.json();assert.equal(duplicateBody.code,'AMENDMENT_ALREADY_ACTIVE');assert.equal(duplicateBody.request.id,1);assert.match(duplicateBody.manageUrl,/tab=requests/);assert.equal(writes,1);
  created={id:1,status:'approved',requestedChanges:{spotify_artist_url:{requested:'https://open.spotify.com/artist/0cevmXPSNfo7KO9xeE7M3m'}}};assert.equal((await send()).status,201);assert.equal(created.status,'submitted');assert.equal(created.reviewedAt,null);assert.equal(writes,2);
  created={id:1,status:'submitted_to_partner',requestedChanges:{spotify_artist_url:{requested:'https://open.spotify.com/artist/0cevmXPSNfo7KO9xeE7M3m'}}};assert.equal((await send()).status,409);assert.equal(writes,2);
  console.log('PASS amendment endpoint: authentication, ownership, locked identifiers, background timestamp drift, signed content conflicts, invalid signatures, status eligibility, missing assets, preserved live release, complete proposed metadata, replay and conflicting request protection.');
  await fs.unlink(file);await fs.unlink(revisionFile);
})().catch(error=>{console.error(error);process.exitCode=1;});
