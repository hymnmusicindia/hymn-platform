import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { cronRequestHeaders, startCronScheduler } from './cron-scheduler';

async function main() {
  process.env.NODE_ENV = 'production';
  const publicOrigin = `https://${process.env.CANONICAL_HOST?.trim() || 'hymnmusic.fun'}`;
  const loopback = 'http://127.0.0.1:3000';
  const url = `${loopback}/api/cron/team-appointments`;
  const oldResult = await proxy(new NextRequest(url, { headers: { host: '127.0.0.1:3000', authorization: 'Bearer fixture' } }));
  assert.equal(oldResult.status, 308, 'The previous loopback request hit the canonical redirect.');
  let calls = 0, fallbacks = 0;
  const worker = startCronScheduler({ port: 3000, secret: 'fixture', origin: loopback, fallbackOrigin: publicOrigin, now: () => 0, random: () => 0, onFallback: () => { fallbacks++; }, fetcher: async (input, init) => {
    calls++;
    assert.equal(init?.redirect, 'error', 'Never follow redirects carrying the cron credential.');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer fixture');
    assert.equal(headers.get('x-forwarded-host'), new URL(publicOrigin).host);
    assert.equal(headers.get('x-forwarded-proto'), 'https');
    headers.set('host', '127.0.0.1:3000');
    const response = await proxy(new NextRequest(String(input), { headers }));
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.status, 200, 'Forwarded canonical context must reach the cron endpoint without redirecting.');
    return Response.json({ success: true });
  } });
  await new Promise(resolve => setTimeout(resolve, 30));
  worker.stop(); assert.equal(calls, 1); assert.equal(fallbacks, 0);
  for (const host of ['localhost', '[::1]']) assert.equal(cronRequestHeaders(`http://${host}:3000`, publicOrigin, 'fixture')['x-forwarded-host'], new URL(publicOrigin).host);
  const external = cronRequestHeaders(publicOrigin, publicOrigin, 'fixture');
  assert.equal(external['x-forwarded-host'], undefined, 'Public fallback calls must use their real proxy headers.');
  assert.equal(external['x-forwarded-proto'], undefined);
  console.log('PASS cron Hostinger proxy: reproduced old 308, authenticated loopback reaches handler, no fallback, redirects disabled, IPv4/IPv6 and untouched public fallback headers.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
