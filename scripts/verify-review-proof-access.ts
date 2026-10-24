import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
async function main() {
  const f = { permissions: [] as string[], assignedQc:false, signedIn:true, asset: { ownerUserId: 51, assetType: 'private_ownership_proof', releaseId: 147 as number|null, category:null,entityType:null,releaseAssetLinks:[] as {releaseId:number}[],mimeType:'application/pdf' } };
  (globalThis as any).__proofFixture=f;
  const mocks:Record<string,string>={
    '@/lib/session':`export const getSession=async()=>global.__proofFixture.signedIn?({sub:99}):null;export const getAdminSession=async()=>null;`,
    '@/lib/access':`export const requireAdminPermission=async key=>global.__proofFixture.permissions.includes(key)?{sub:99}:{error:Response.json({error:'Forbidden'},{status:403})};`,
    '@/lib/prisma':`export const prisma={storedAsset:{findUnique:async()=>global.__proofFixture.asset}};`,
    '@/lib/private-storage':`export class AudioRangeNotSatisfiableError extends Error{};export const localPrivateStorage={createAuthorizedRead:async({requesterUserId,isAdmin})=>{if(!isAdmin&&requesterUserId!==global.__proofFixture.asset.ownerUserId)throw Error('Forbidden.');return{bytes:Buffer.from('fixture proof'),mimeType:global.__proofFixture.asset.mimeType,fileName:'proof.pdf'}}};`,
    '@/lib/team/release-qc-media':`export const canReadAssignedQcAsset=async()=>global.__proofFixture.assignedQc;`,
    '@/lib/artwork-preview':`export const requestedArtworkWidth=()=>null;`,
    '@/lib/artwork-thumbnail':`export const artworkThumbnail=async bytes=>bytes;`,
    '@/lib/media-placeholder':`export const missingImageResponseHeaders=()=>({});export const missingImageSvg=()=>'';`
  };
  const outfile='.cache/review-proof-route.cjs';
  await build({entryPoints:['app/api/assets/[id]/download/route.ts'],outfile,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@\/lib\//},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));}}]});
  const {GET}=createRequire(import.meta.url)(resolve(outfile));
  const get=(query='')=>GET(new Request('https://hymn.fixture/api/assets/378/download'+query),{params:Promise.resolve({id:'378'})});
  assert.equal((await get()).status,403);
  for(const assetType of ['private_ownership_proof','private_cover_licence','private_ai_receipt']) {
    f.asset.assetType=assetType;
    for(const permission of ['releases.read','releases.review']){f.permissions=[permission];const response=await get();assert.equal(response.status,200);assert.equal(await response.text(),'fixture proof');assert.match(response.headers.get('content-disposition')!,/^inline;/);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');}
    assert.match((await get('?download=1')).headers.get('content-disposition')!,/^attachment;/);
  }
  f.permissions=[];f.assignedQc=true;assert.equal((await get()).status,200,'Assigned QC reviewers retain access.');f.assignedQc=false;
  assert.equal((await get()).status,403,'Unassigned staff cannot read private evidence.');
  f.permissions=['releases.review'];
  f.asset.releaseId=null;assert.equal((await get()).status,403,'Unlinked private proofs remain inaccessible.');
  f.asset.releaseAssetLinks=[{releaseId:147}];assert.equal((await get()).status,200,'Release-linked proofs can be reviewed.');f.asset.releaseAssetLinks=[];
  f.permissions=[];f.asset.ownerUserId=99;assert.equal((await get()).status,200,'The owner retains access.');
  f.signedIn=false;assert.equal((await get()).status,401,'Anonymous users cannot read private evidence.');
  console.log('PASS private correction evidence: read/review permissions, linked proof download, unrelated-customer rejection, unlinked proof isolation and owner access.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
