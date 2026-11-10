const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
(async () => {
  process.env.JWT_SECRET = 'calendar-oauth-fixture-secret-with-more-than-thirty-two-characters';
  const fixture = global.__calendarOAuthFixture = { actor: { id: 'owner', userId: 1, workspaceId: 'workspace', role: { owner: true } }, nonce: '', scopes: 'openid email https://www.googleapis.com/auth/calendar.events', saved: null, previous: null, externalEvents: 0, revokeDuringWrite: false };
  const mocks = {
    'next/headers': 'export const cookies=async()=>({get:()=>({value:globalThis.__calendarOAuthFixture.nonce}),set:(name,value)=>{globalThis.__calendarOAuthFixture.nonce=value}});',
    'next/server': 'export class NextResponse extends Response{static json(data,init){return Response.json(data,init)}static redirect(url,status=307){return new Response(null,{status,headers:{Location:url}})}}export const after=()=>{};',
    '@/lib/team/access': 'export const teamActor=async()=>globalThis.__calendarOAuthFixture.actor;',
    '@/lib/team/service': `export const teamWrite=async(actor,execute)=>{const f=globalThis.__calendarOAuthFixture;return execute({teamGoogleCalendar:{findUnique:async()=>f.previous,upsert:async(data)=>{f.saved=data}},teamCalendarEvent:{count:async()=>f.externalEvents,updateMany:async()=>({count:0})}},{...actor,role:{owner:!f.revokeDuringWrite}})};`,
    '@/lib/team/google-calendar': `export const calendarOAuthClient=()=>({generateAuthUrl:options=>{globalThis.__calendarOAuthFixture.state=options.state;return 'https://accounts.google.com/o/oauth2/v2/auth?state='+options.state},getToken:async()=>({tokens:{id_token:'fixture-id-token',refresh_token:'fixture-refresh-token',scope:globalThis.__calendarOAuthFixture.scopes}}),verifyIdToken:async()=>({getPayload:()=>({email:'hymn@fixture.invalid',email_verified:true})})});export const encryptCalendarToken=()=> 'encrypted-fixture-token';export const syncGoogleCalendar=async()=>[];`,
    '@/lib/public-app-url': 'export const getPublicAppUrl=()=>"https://hymn.fixture";'
  };
  const output = await build({ stdin: { contents: `export{POST as connect}from'./app/api/team/google-calendar/connect/route';export{GET as callback}from'./app/api/team/google-calendar/callback/route';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'oauth-boundaries', setup(build) { build.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined); build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' })); } }] });
  const loaded = new Module(path.resolve('.tmp/calendar-oauth-fixture.cjs'), module); loaded.filename = path.resolve('.tmp/calendar-oauth-fixture.cjs'); loaded.paths = module.paths; loaded._compile(output.outputFiles[0].text, loaded.filename);
  const { connect, callback } = loaded.exports;
  const request = (body = 'workspace=workspace', origin = 'https://hymn.fixture', type = 'application/x-www-form-urlencoded') => new Request('https://hymn.fixture/api/team/google-calendar/connect', { method: 'POST', headers: { Origin: origin, 'Content-Type': type }, body });
  assert.equal((await connect(request('', 'https://attacker.invalid'))).status, 403);
  assert.equal((await connect(request('', 'https://hymn.fixture', 'application/json'))).status, 415);
  assert.equal((await connect(request('x'.repeat(8193)))).status, 413);
  fixture.actor.role.owner = false; assert.equal((await connect(request())).status, 403); fixture.actor.role.owner = true;
  assert.equal((await connect(request())).status, 303);
  const nonce = fixture.nonce, state = fixture.state;
  const callbackRequest = () => new Request(`https://hymn.fixture/api/team/google-calendar/callback?state=${state}&code=fixture-code`);
  fixture.nonce = 'wrong'; assert.equal((await callback(callbackRequest())).status, 400); assert.equal(fixture.saved, null);
  fixture.nonce = nonce; fixture.actor.userId = 2; assert.equal((await callback(callbackRequest())).status, 400); fixture.actor.userId = 1;
  fixture.nonce = nonce; fixture.scopes = 'openid email'; assert.equal((await callback(callbackRequest())).status, 400); assert.equal(fixture.saved, null);
  fixture.nonce = nonce; fixture.scopes += ' https://www.googleapis.com/auth/calendar.events'; fixture.revokeDuringWrite = true;
  assert.equal((await callback(callbackRequest())).status, 400); assert.equal(fixture.saved, null); fixture.revokeDuringWrite = false;
  fixture.nonce = nonce; fixture.previous = { accountEmail: 'different-host@fixture.invalid' }; fixture.externalEvents = 1;
  assert.equal((await callback(callbackRequest())).status, 400); assert.equal(fixture.saved, null);
  fixture.nonce = nonce; fixture.previous = null; fixture.externalEvents = 0;
  const success = await callback(callbackRequest()); assert.equal(success.status, 303); assert.match(success.headers.get('location'), /module=team-queue/);
  assert.equal(fixture.saved.create.accountEmail, 'hymn@fixture.invalid'); assert.equal(fixture.saved.create.refreshTokenEncrypted, 'encrypted-fixture-token'); assert.equal(fixture.nonce, '');
  assert.equal((await callback(callbackRequest())).status, 400, 'Consumed state cannot be replayed.');
  console.log('PASS Google Calendar OAuth boundaries: origin, content type, body size, owner access, signed state and nonce, session binding, required scopes, revoked ownership, hosting-account continuity, encrypted-token persistence and replay rejection. No Google account was contacted.');
})().catch(error => { console.error(error); process.exitCode = 1; });
