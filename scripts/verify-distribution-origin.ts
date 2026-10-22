import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

async function main() {
  process.env.NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_APP_URL = 'https://hymnmusic.fun';
  const fixture = { signedIn: true, policyBlocked: false, reads: 0, approvals: 0, ownerId: 51 };
  (globalThis as typeof globalThis & { __distributionOrigin: typeof fixture }).__distributionOrigin = fixture;
  const outfile = '.cache/distribution-origin-route.cjs';
  await build({ entryPoints: ['app/api/distribution/artist-verification/route.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'fixture', setup(b) {
    const mocks: Record<string, string> = {
      '@/lib/access': `export async function requireUser(){return global.__distributionOrigin.signedIn?{user:{id:51}}:{error:Response.json({error:'Unauthorized'},{status:401})}}`,
      '@/lib/policy-agreement': `export async function requireCurrentPolicyAcceptance(){return global.__distributionOrigin.policyBlocked?Response.json({error:'Accept current terms'},{status:409}):null}`,
      '@/lib/release-artist-verification': `export class ArtistVerificationError extends Error{};export async function getArtistVerification(userId){const f=global.__distributionOrigin;if(userId!==f.ownerId)throw new ArtistVerificationError('Release not found.');f.reads++;return {artists:[]}};export async function approveReleaseArtistProfiles(userId){const f=global.__distributionOrigin;if(userId!==f.ownerId)throw new ArtistVerificationError('Release not found.');f.approvals++}`
    };
    b.onResolve({ filter: /^@\/lib\// }, args => mocks[args.path] ? { path: args.path, namespace: 'mock' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path] }));
  } }] });
  const { POST } = createRequire(import.meta.url)(resolve(outfile));
  const prepare = { action: 'prepare', releaseId: 147, artistCardIds: [10] };
  const request = (origin: string | null = 'https://hymnmusic.fun', body: unknown = prepare, internal = 'http://0.0.0.0:3000', extras: Record<string, string> = {}) => new Request(`${internal}/api/distribution/artist-verification`, { method: 'POST', headers: { ...extras, ...(origin ? { origin } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  for (const internal of ['http://0.0.0.0:3000', 'http://127.0.0.1:3000', 'https://hymnmusic.fun']) assert.equal((await POST(request('https://hymnmusic.fun', prepare, internal))).status, 200, 'Public HTTPS browser origin must survive Hostinger internal HTTP routing.');
  const before = fixture.reads;
  for (const origin of [null, 'null', 'https://attacker.invalid', 'https://hymnmusic.fun.attacker.invalid', 'http://hymnmusic.fun', 'https://hymnmusic.fun/path', 'http://127.0.0.1:3000']) assert.equal((await POST(request(origin))).status, 403);
  assert.equal((await POST(request('https://attacker.invalid', prepare, undefined, { 'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'https' }))).status, 403, 'Spoofed forwarding headers cannot authorize another origin.');
  assert.equal(fixture.reads, before); assert.equal(fixture.approvals, 0);
  fixture.signedIn = false; assert.equal((await POST(request())).status, 401); fixture.signedIn = true;
  fixture.policyBlocked = true; assert.equal((await POST(request())).status, 409); fixture.policyBlocked = false;
  fixture.ownerId = 99; assert.equal((await POST(request())).status, 409); fixture.ownerId = 51;
  assert.equal((await POST(request(undefined, { ...prepare, releaseId: 0 }))).status, 400);
  assert.equal((await POST(request(undefined, { ...prepare, action: 'approve' }))).status, 400);
  const spotify = 'https://open.spotify.com/artist/0cevmXPSNfo7KO9xeE7M3m';
  assert.equal((await POST(request(undefined, { ...prepare, action: 'approve', approvals: [{ artistCardId: 10, fingerprint: 'a'.repeat(64), spotifyUrl: spotify, openedSpotifyUrl: spotify, approved: true }] }))).status, 200);
  assert.equal(fixture.approvals, 1);
  process.env.NODE_ENV = 'development'; process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  assert.equal((await POST(request('http://localhost:3000', prepare, 'http://localhost:3000'))).status, 200);
  console.log('PASS distribution artist verification: public HTTPS behind internal HTTP, prepare/approve, local development, authentication, policy, ownership, invalid input and hostile/missing/spoofed origin rejection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
