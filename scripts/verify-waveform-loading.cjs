const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { build } = require('esbuild'), { chromium, expect } = require('@playwright/test');
(async () => {
  const out = path.resolve('.cache/waveform-loading'); await fs.mkdir(out, { recursive: true });
  await build({ stdin: { contents: `import'./components/beat-player.css';import React from'react';import{createRoot}from'react-dom/client';import{PlaybackWaveform}from'./components/playback-waveform';function App(){const[url,setUrl]=React.useState('');window.selectTrack=setUrl;return url?<PlaybackWaveform dataUrl={url} title="Selected beat" currentTime={12} duration={120} seek={()=>{}}/>:null}createRoot(document.getElementById('root')).render(<App/>);`, loader: 'tsx', resolveDir: process.cwd() }, outfile: path.join(out, 'ui.js'), bundle: true, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); const requests = [], counts = new Map();
    const envelope = id => ({ version: 1, duration: 120, peaks: Array.from({ length: 128 }, (_, i) => (i * 17 + Number(id) * 13) % 256) });
    await page.route('https://hymn.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
      requests.push(url.pathname); const count = (counts.get(url.pathname) || 0) + 1; counts.set(url.pathname, count);
      const id = url.pathname.split('/').at(-2);
      if (id === '2') await new Promise(resolve => setTimeout(resolve, 400));
      if (id === '4' && count === 1) return route.fulfill({ status: 202, headers: { 'Retry-After': '1' }, json: { state: 'busy' } });
      if (id === '5' && count === 1) return route.fulfill({ status: 503, headers: { 'Retry-After': '1' }, json: { state: 'retry' } });
      if (id === '5' && count === 2) return route.fulfill({ body: '{invalid', contentType: 'application/json' });
      if (id === '6') return route.fulfill({ status: 404 });
      return route.fulfill({ json: envelope(id) });
    });
    const boot = async () => {
      await page.goto('https://hymn.test/');
      await page.evaluate(() => { window.OfflineAudioContext = class { constructor() { throw Error('Browser decoding must never run'); } }; Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } }); });
      await page.addStyleTag({ path: path.join(out, 'ui.css') }); await page.addScriptTag({ path: path.join(out, 'ui.js') }); await page.waitForFunction(() => window.selectTrack);
    };
    const select = id => page.evaluate(id => window.selectTrack(`/api/beats/${id}/waveform?source=master`), id);
    const ready = () => expect(page.locator('[data-waveform-ready=true]')).toBeVisible();
    await boot(); assert.equal(requests.length, 0);
    await select(1); await ready(); assert.equal(requests.length, 1);
    await select(2); await expect.poll(() => counts.get('/api/beats/2/waveform')).toBe(1);
    await select(3); await ready(); await page.waitForTimeout(500);
    const peaks = await page.locator('.hymn-waveform-upcoming rect').evaluateAll(nodes => nodes.map(node => node.getAttribute('height')));
    await select(1); await ready(); assert.equal(counts.get('/api/beats/1/waveform'), 1, 'Memory cache should render without another request');
    await boot(); await select(1); await ready(); assert.equal(counts.get('/api/beats/1/waveform'), 1, 'Recent envelopes should survive reload');
    await select(3); await ready(); assert.deepEqual(await page.locator('.hymn-waveform-upcoming rect').evaluateAll(nodes => nodes.map(node => node.getAttribute('height'))), peaks, 'Late old response must not replace selected waveform');
    await select(4); await expect(page.locator('[data-waveform-state=loading]')).toBeVisible(); await expect(page.locator('.hymn-player-loading-waveform')).toHaveCSS('opacity', '0.55'); await expect(page.locator('.hymn-player-loading-waveform rect').first()).toHaveCSS('animation-name', 'hymn-wave-loading'); await ready(); await expect(page.locator('.hymn-player-loading-waveform')).toHaveCSS('opacity', '0'); await expect(page.locator('.hymn-player-song-waveform')).toHaveCSS('opacity', '1'); assert.equal(counts.get('/api/beats/4/waveform'), 2);
    await select(5); await ready(); assert.equal(counts.get('/api/beats/5/waveform'), 3, 'Transient server errors and invalid data must recover');
    await select(6); await expect(page.locator('[data-waveform-state=unavailable]')).toBeVisible(); assert.equal(counts.get('/api/beats/6/waveform'), 1);
    for (let id = 10; id < 40; id++) { await select(id); await ready(); }
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hymn:selected-waveforms:v1')).length), 24, 'Persistent cache must remain bounded');
    await select(1); await ready(); assert.equal(counts.get('/api/beats/1/waveform'), 2, 'Evicted envelopes reload on selection');
    assert(requests.every(url => /^\/api\/beats\/\d+\/waveform$/.test(url)), 'Only selected-waveform endpoints may be fetched');
    await page.close();
    console.log('PASS selected waveform loading: no eager loads, no audio downloads/browser decoding, Save-Data support, memory/persistent cache, track-switch isolation, busy/error recovery, explicit unavailable state and 24-entry cache bound');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
