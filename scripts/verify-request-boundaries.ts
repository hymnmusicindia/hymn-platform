import assert from 'node:assert/strict';
import { readJsonBody, RequestBodyError } from '../lib/request-body';
import { getPublicAppUrl } from '../lib/public-app-url';

const request = (body: string | Uint8Array, headers: Record<string, string> = {}) => new Request('https://hymn.fixture/api/auth/team-email', { method: 'POST', headers, body });
async function rejected(input: Request, limit: number, status: number) {
  await assert.rejects(() => readJsonBody(input, limit), error => error instanceof RequestBodyError && error.status === status);
}
async function main() {
  assert.deepEqual(await readJsonBody(request('{"name":"Artist"}'), 17), { name: 'Artist' });
  await rejected(request('{"name":"Artist"}', { 'content-length': '5000' }), 4096, 413);
  await rejected(request(' '.repeat(4097)), 4096, 413);
  await rejected(request('{"name":"🎵🎵"}'), 15, 413);
  await rejected(request('{'), 100, 400);
  await rejected(request(new Uint8Array([0xff])), 100, 400);
  await rejected(new Request('https://hymn.fixture'), 100, 400);
  let cancelled = false;
  const chunks = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(' '.repeat(4096))); controller.enqueue(new TextEncoder().encode('x')); }, cancel() { cancelled = true; } });
  await rejected(new Request('https://hymn.fixture', { method: 'POST', body: chunks, duplex: 'half' } as RequestInit), 4096, 413);
  assert(cancelled, 'Oversized streamed input is cancelled without consuming the rest');
  const unicode = new TextEncoder().encode('{"name":"🎵"}');
  const split = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of unicode) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  assert.deepEqual(await readJsonBody(new Request('https://hymn.fixture', { method: 'POST', body: split, duplex: 'half' } as RequestInit), 100), { name: '🎵' });
  const keys = ['NODE_ENV','NEXT_PUBLIC_APP_URL','APP_URL','PUBLIC_SITE_URL','NEXT_PUBLIC_SITE_URL'];
  const env = process.env as Record<string, string | undefined>;
  const previous = Object.fromEntries(keys.map(key => [key, env[key]]));
  try {
    for (const key of keys) delete env[key];
    env.NODE_ENV = 'production';
    for (const host of ['localhost','localhost.','127.0.0.1','[::1]','[0:0:0:0:0:0:0:1]','preview.local.']) assert.equal(getPublicAppUrl(`http://${host}:3000`), 'https://hymnmusic.fun', host);
    env.NEXT_PUBLIC_APP_URL = 'https://hymnmusic.fun/path';
    assert.equal(getPublicAppUrl('http://[::1]:3000'), 'https://hymnmusic.fun');
    delete env.NEXT_PUBLIC_APP_URL; env.NODE_ENV = 'development';
    assert.equal(getPublicAppUrl('http://[::1]:3000'), 'http://[::1]:3000');
  } finally { for (const key of keys) { if (previous[key] === undefined) delete env[key]; else env[key] = previous[key]; } }
  console.log('PASS request boundaries: exact byte limit, absent/oversized length, chunked cancellation, split Unicode, invalid JSON/UTF-8, empty body and production IPv4/IPv6/trailing-dot loopback URLs.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
