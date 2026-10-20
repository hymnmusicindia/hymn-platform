const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
(async () => {
  const out = path.resolve('.tmp/draft-autosave'); await fs.mkdir(out, { recursive: true });
  let row;
  global.__draftAuth = true;
  global.__draftPrisma = {
    release: {
      create: async ({ data }) => (row = { ...data, id: 91, updatedAt: new Date(), tracks: [] }),
      findFirst: async () => row,
      update: async ({ data }) => (row = { ...row, ...Object.fromEntries(Object.entries(data).filter(([,v]) => v !== undefined)), updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) }),
    },
    $queryRaw: async () => [{ locked: true }],
    $transaction: async callback => callback(global.__draftPrisma),
  };
  global.__draftRelease = () => ({ ...row, releaseTitle: row.title, status: row.status.toLowerCase() });
  const mocks = {
    '@/lib/access': 'export async function requireUser(){return global.__draftAuth?{user:{id:1,name:"Fixture artist"},session:{sub:1}}:{error:new Response(null,{status:401})}}',
    '@/lib/prisma': 'export const prisma=global.__draftPrisma;',
    '@/lib/distribution-db': 'export async function getDetailedReleaseByUserId(){return global.__draftRelease()}',
    '@/lib/first-release-promotion': 'export const FIRST_RELEASE_PROMOTION_CODE="FIRST_RELEASE_FREE";export async function getFirstReleaseEligibility(){return {eligible:true}}',
    '@/lib/first-release-flow': 'export function firstReleaseAttribution(){return {}}',
    '@/lib/release-track-save': 'export async function saveReleaseTracks(){};export function releaseSaveFailure(){return null}',
    '@/lib/release-contributor-sync': 'export const releaseSaveTransactionOptions={};',
  };
  await build({ stdin: { contents: 'export {POST} from "./app/api/distribution/drafts/route";export {PATCH} from "./app/api/distribution/drafts/[id]/route";', resolveDir: process.cwd() }, outfile: path.join(out, 'routes.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{name:'draft-dependencies',setup(b){b.onResolve({filter:/^@\/lib\//},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}));}}] });
  const { POST, PATCH } = require(path.join(out, 'routes.cjs'));
  const request = data => new Request('https://fixture/api/distribution/drafts/91', { method:'POST', body:JSON.stringify(data), headers:{'content-type':'application/json'} });
  assert.equal((await POST(request({ title:'' }))).status, 201);
  assert.equal(row.title, 'Untitled Release');
  row.lastEditedAt = new Date(Date.now() - 5 * 86400000);
  const oldEdit = row.lastEditedAt;
  const previousVersion = row.updatedAt.toISOString();
  const response = await PATCH(request({ expectedUpdatedAt:previousVersion, genre:'Pop', metadata:{mood:'Happy'} }), {params:Promise.resolve({id:'91'})});
  assert.equal(response.status, 200);
  assert.equal(row.genre, 'Pop'); assert.equal(row.metadata.mood, 'Happy');
  assert(row.lastEditedAt > oldEdit, 'Editing another field must refresh draft activity without a title');
  assert.equal(row.title, 'Untitled Release');
  assert.equal((await PATCH(request({expectedUpdatedAt:previousVersion,genre:'Stale edit'}),{params:Promise.resolve({id:'91'})})).status,409);
  assert.equal(row.genre,'Pop','A stale save must still be rejected');
  global.__draftAuth=false;
  assert.equal((await POST(request({}))).status,401);
  console.log('Draft autosave passed: untitled creation, metadata edits refresh activity, version conflicts and authentication.');
})().catch(error=>{console.error(error);process.exitCode=1});
