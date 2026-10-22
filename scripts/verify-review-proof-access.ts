import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
async function main() {
  const f = { permissions: [] as string[], asset: { ownerUserId: 51, assetType: 'private_ownership_proof', releaseId: 147 as number|null, category:null,entityType:null,releaseAssetLinks:[],mimeType:'application/pdf' } };
  (globalThis as any).__proofFixture=f;
  const mocks:Record<string,string>={
    '@/lib/session':`export const getSession=async()=>({sub:99});export const getAdminSession=async()=>null;`,
    '@/lib/access':`export const requireAdminPermission=async key=>global.__proofFixture.permissions.includes(key)?{sub:99}:{error:Response.json({error:'Forbidden'},{status:403})};`,
    '@/lib/prisma':`export const prisma={storedAsset:{findUnique:async()=>global.__proofFixture.asset}};`,
    '@/lib/private-storage':`export class AudioRangeNotSatisfiableError extends Error{};export const localPrivateStorage={createAuthorizedRead:async({requesterUserId,isAdmin})=>{if(!isAdmin&&requesterUserId!==global.__proofFixture.asset.ownerUserId)throw Error('Forbidden.');return{bytes:Buffer.from('fixture proof'),mimeType:'application/pdf',fileName:'proof.pdf'}}};`,
    '@/lib/artwork-preview':`export const requestedArtworkWidth=()=>null;`,
    '@/lib/artwork-thumbnail':`export const artworkThumbnail=async bytes=>bytes;`,
    '@/lib/media-placeholder':`export const missingImageResponseHeaders=()=>({});export const missingImageSvg=()=>'';`
  };
  const outfile='.cache/review-proof-route.cjs';
  await build({entryPoints:['app/api/assets/[id]/download/route.ts'],outfile,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@\/lib\//},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}));}}]});
  const {GET}=createRequire(import.meta.url)(resolve(outfile));
  const get=()=>GET(new Request('https://hymn.fixture/api/assets/378/download'),{params:Promise.resolve({id:'378'})});
  assert.equal((await get()).status,403);
  for(const permission of ['releases.read','releases.review']){f.permissions=[permission];const response=await get();assert.equal(response.status,200);assert.equal(await response.text(),'fixture proof');}
  f.asset.releaseId=null;assert.equal((await get()).status,403,'Unlinked private proofs remain inaccessible.');
  f.permissions=[];f.asset.ownerUserId=99;assert.equal((await get()).status,200,'The owner retains access.');
  console.log('PASS private correction evidence: read/review permissions, linked proof download, unrelated-customer rejection, unlinked proof isolation and owner access.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
