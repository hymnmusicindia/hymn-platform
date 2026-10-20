const assert = require('node:assert/strict');
(async () => {
  const origin = new URL(process.argv[2] || 'https://hymnmusic.fun');
  const response = await fetch(new URL('/distribution/start', origin), { cache:'no-store', signal:AbortSignal.timeout(20000) });
  assert(response.ok, `Distribution page returned HTTP ${response.status}`);
  const html = await response.text();
  const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  const chunks = sources.filter(source => /distribution.*start.*page-/.test(decodeURIComponent(source)));
  assert(chunks.length, 'Could not locate the deployed distribution page bundle');
  for (const chunk of chunks) {
    const result = await fetch(new URL(chunk, origin), {cache:'no-store', signal:AbortSignal.timeout(20000)});
    assert(result.ok, `Distribution bundle returned HTTP ${result.status}`);
    const source = await result.text();
    const stale = source.includes('required to save') || source.includes('Enter your album or track title before uploading or saving.');
    console.log(`${stale?'STALE':'CURRENT'} ${new URL(chunk,origin).pathname}`);
    assert(!stale, 'The live bundle still contains the removed title gate. Git push has not reached this deployment.');
  }
})().catch(error => { console.error(error.message); process.exitCode=1; });
