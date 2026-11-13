const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {build} = require('esbuild');
(async () => {
  const file=path.resolve('.cache/spotify-photo-cron-fixture.cjs');
  await fs.mkdir(path.dirname(file),{recursive:true});
  await build({stdin:{contents:`export {GET} from './app/api/cron/spotify-artist-photos/route';`,resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'isolated-photo-services',setup(b){
    b.onResolve({filter:/^@\/lib\/(cron\/runtime|prisma|spotify-artist-photos)$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('runtime')?`export const cronHandler=(_id,handler)=>handler;`:args.path.endsWith('prisma')?`export const prisma={ $queryRaw:async (sql,...values)=>{globalThis.photoFixture.queries.push(sql.join('?'));return sql.join('').includes('INSERT INTO')?[{run_id:values[1]}]:globalThis.photoFixture.cards;},$executeRaw:async()=>1,auditLog:{create:async()=>({})}};`:`export async function refreshSpotifyArtistPhoto(){globalThis.photoFixture.clock+=1700;if(globalThis.photoFixture.fail)throw Error('Fixture provider failure');return {outcome:'unchanged'};}`}));
  }}]});
  const {GET}=require(file), realNow=Date.now;
  process.env.CRON_SECRET='photo-cron-fixture';
  globalThis.photoFixture={clock:0,cards:Array.from({length:25},(_,i)=>({id:i+1})),queries:[]};
  Date.now=()=>globalThis.photoFixture.clock;
  try {
    const request=()=>new Request('https://hymn.fixture/api/cron/spotify-artist-photos',{headers:{authorization:'Bearer photo-cron-fixture'}});
    assert.equal((await GET(new Request('https://hymn.fixture/api/cron/spotify-artist-photos'))).status,401);
    const response=await GET(request()),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.success,true);assert.equal(body.errors,0);assert(body.deferred>0);assert.equal(response.headers.get('x-hymn-cron-continue-after'),'60');
    assert(globalThis.photoFixture.queries.some(sql=>sql.includes("INTERVAL '24 hours'")),'Recently checked profiles must not lead the next batch.');
    globalThis.photoFixture.cards=[];
    assert.equal((await GET(request())).headers.get('x-hymn-cron-continue-after'),null);
    globalThis.photoFixture.cards=[{id:1}];globalThis.photoFixture.fail=true;
    const failed=await GET(request());assert.equal(failed.status,503);assert.equal((await failed.json()).success,false);
    console.log('PASS photo cron: bounded batches continue successfully, recent checks wait 24 hours, real failures remain visible, unauthorized callers rejected.');
  } finally {Date.now=realNow;delete globalThis.photoFixture;}
})().catch(error=>{console.error(error);process.exitCode=1});
