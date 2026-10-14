const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const sharp = require('sharp');
const { File } = require('node:buffer');
let signedIn = true, allowed = true, writes = 0, saved;
const mocks = {
  'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
  'sharp': sharp,
  '@/lib/access': { requireUser: async () => signedIn ? { user: { id: 51 } } : { error: Response.json({}, { status: 401 }) } },
  '@/lib/public-app-url': { getPublicAppUrl: () => 'https://hymn.fixture' },
  '@/lib/rate-limit': { consumeRateLimit: async () => ({ allowed }) },
  '@/lib/storage': { saveUploadedFile: async (file, directory) => { writes++; assert.equal(directory, 'site/playlists/51'); saved = Buffer.from(await file.arrayBuffer()); return '/api/public-uploads/site/playlists/51/12345678-1234-1234-1234-123456789abc.webp'; } },
};
const sandbox = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Request, Response, URL, Buffer, File, console };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/playlist-reviews/cover/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, sandbox);
const { POST } = sandbox.exports;
function request(bytes, type = 'image/png', origin = 'https://hymn.fixture') {
  const form = new FormData(); form.set('image', new File([bytes], 'cover.png', { type }));
  return new Request('https://hymn.fixture/api/playlist-reviews/cover', { method: 'POST', headers: { origin }, body: form });
}
(async () => {
  const image = await sharp({ create: { width: 2000, height: 2000, channels: 3, background: '#384869' } }).png().toBuffer();
  signedIn = false; assert.equal((await POST(request(image))).status, 401);
  signedIn = true; assert.equal((await POST(request(image, 'image/png', 'https://evil.example'))).status, 403);
  allowed = false; assert.equal((await POST(request(image))).status, 429); allowed = true;
  assert.equal((await POST(request(Buffer.from('not an image')))).status, 400);
  assert.equal((await POST(request(image, 'image/svg+xml'))).status, 400);
  assert.equal(writes, 0);
  const response = await POST(request(image)); assert.equal(response.status, 200); assert.equal(writes, 1);
  const metadata = await sharp(saved).metadata(); assert.equal(metadata.width, 960); assert.equal(metadata.height, 960); assert.equal(metadata.format, 'webp');
  assert.ok(saved.length < image.length);
  console.log('PASS curator cover: auth, origin, rate limit, real raster validation, square compressed WebP, account-scoped storage.');
})().catch(error => { console.error(error); process.exitCode = 1; });
