const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function audioFixture() {
  const rate = 16000, count = rate * 12, bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (let sample = 0; sample < count; sample++) { const envelope = .08 + .65 * Math.sin(sample / rate * 2.4) ** 2; bytes.writeInt16LE(Math.round(Math.sin(sample / rate * Math.PI * 440) * envelope * 12000), 44 + sample * 2); }
  return bytes;
}
(async () => {
  const out = path.resolve('.cache/premium-player'); await fs.mkdir(out, { recursive: true }); await fs.mkdir('artifacts', { recursive: true });
  await build({ entryPoints: ['lib/waveform-generator.ts'], outfile: path.join(out, 'generator.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  const fixturePath = path.join(out, 'fixture.wav'); await fs.writeFile(fixturePath, audioFixture());
  const fixtureHandle = await fs.open(fixturePath, 'r');
  const envelope = await require(path.join(out, 'generator.cjs')).generateWaveform(fixtureHandle); await fixtureHandle.close();
  await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{BeatPreviewPlayerProvider,useBeatPreviewPlayer}from'./components/beat-preview-player';const beat=id=>({id,title:id===1?'Midnight Motion':'The Next Chapter',previewUrl:'/preview'+id+'.wav',fileUrl:'/preview'+id+'.wav',coverImage:'/cover.svg',producer:{name:'HYMN Sessions',slug:'hymn-sessions'},bpm:92,price:499,mp3Price:499,availableLicenses:['mp3'],startingPrice:499});function Test(){const p=useBeatPreviewPlayer();window.player=p;return <main style={{padding:40,color:'#1b1d24',fontFamily:'Arial'}}><p style={{letterSpacing:3,fontSize:11}}>HYMN / LISTENING ROOM</p><h1 style={{fontSize:38,marginTop:20}}>A little after midnight.</h1><p style={{color:'#687080',marginTop:12}}>Your next idea starts with a sound.</p><button style={{marginTop:30,padding:'12px 20px',border:'1px solid #ccc',borderRadius:24}} onClick={()=>p.playBeat(beat(1),[beat(1),beat(2)])}>Listen to Midnight Motion</button></main>}createRoot(document.getElementById('root')).render(<BeatPreviewPlayerProvider><Test/></BeatPreviewPlayerProvider>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next', setup(b) { b.onResolve({ filter: /^next\// }, a => ({ path: a.path, namespace: 'mock' })); b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'import React from "react";export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>};export const usePathname=()=>"/beat-store";export const useRouter=()=>({});', loader: 'tsx', resolveDir: process.cwd() })); } }] });
  const layout = await fs.readFile('app/layout.tsx', 'utf8');
  const globalStyles = await Promise.all([...layout.matchAll(/import\s+"(\.\/[^"\n]+\.css)"/g)].map(match => fs.readFile(path.join('app', match[1]), 'utf8')));
  const css = await require('postcss')([require('tailwindcss')({ content: ['./components/**/*.{ts,tsx}'], theme: { extend: {} }, plugins: [] })]).process(globalStyles.join('\n'), { from: 'app/globals.css' });
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 860 }, hasTouch: width <= 900, isMobile: width <= 600 });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const waveformRequests = [], audioFetches = [];
      await page.route('https://hymn.test/**', route => {
        const url = new URL(route.request().url());
        if (/\/waveform$/.test(url.pathname)) { waveformRequests.push(url.pathname); return route.fulfill({ json: envelope }); }
        if (/preview\d\.wav/.test(url.pathname) && route.request().resourceType() === 'fetch') audioFetches.push(url.pathname);
        if (/preview\d\.wav/.test(url.pathname)) { const bytes = audioFixture(); const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/); if (range) { const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1; return route.fulfill({ status: 206, contentType: 'audio/wav', headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Accept-Ranges': 'bytes' }, body: bytes.subarray(start, end + 1) }); } return route.fulfill({ contentType: 'audio/wav', body: bytes }); }
        if (url.pathname === '/cover.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#726250"/><stop offset="1" stop-color="#171b30"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><circle cx="60" cy="60" r="42" fill="none" stroke="#d6b585" stroke-width="2"/><circle cx="60" cy="60" r="27" fill="none" stroke="#d6b585"/><circle cx="60" cy="60" r="5" fill="#f1e4bb"/></svg>' });
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { items: [], liked: false } });
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#f1f2f4"><div id="root"></div></body>' });
      });
      await page.goto('https://hymn.test/');
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.getElementById('root').className = 'hymn-portal-root hymn-landing'; });
      await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedLink = text; } } }); });
      await page.addStyleTag({ content: css.css }); await page.addStyleTag({ path: path.join(out, 'ui.css') }); await page.addScriptTag({ path: path.join(out, 'ui.js') });
      assert.equal(waveformRequests.length, 0, 'Catalogue must not fetch waveforms before playback');
      await page.getByRole('button', { name: 'Listen to Midnight Motion', exact: true }).click();
      const player = page.getByRole('complementary', { name: 'Now playing', exact: true });
      await expect(player).toBeVisible(); await expect.poll(() => page.evaluate(() => window.player.playing)).toBe(true);
      await expect(page.locator('[data-waveform-ready=true]')).toBeVisible();
      assert.deepEqual(waveformRequests, ['/api/beats/1/waveform'], 'Only the active beat loads peaks');
      assert.deepEqual(audioFetches, [], 'Waveform must not download another copy of the audio');
      await expect(page.locator('.hymn-player-playhead')).toHaveCSS('width', '1px');
      assert((await player.evaluate(node => getComputedStyle(node).backdropFilter)).includes('blur(28px)'), 'Player must have frosted blur');
      await expect(page.locator('.hymn-waveform-played')).toHaveCSS('fill', 'rgb(255, 255, 255)');
      await expect(page.locator('.hymn-waveform-upcoming')).toHaveCSS('fill', 'rgb(119, 119, 124)');
      assert((await page.locator('.hymn-player-waveform > svg').evaluate(node => getComputedStyle(node).maskImage)).includes('linear-gradient'), 'Waveform edges must fade');
      const distinct = await page.locator('.hymn-player-waveform svg g').first().locator('rect').evaluateAll(nodes => new Set(nodes.map(node => node.getAttribute('height'))).size); assert(distinct > 10, 'Real audio should produce distinct waveform peaks');
      await page.getByRole('button', { name: 'Pause Midnight Motion', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.player.playing)).toBe(false);
      if (width <= 900) {
        const bounds = await player.boundingBox();
        assert(860 - bounds.y - bounds.height >= 47, 'Touch player must sit at least 48px above the bottom edge');
        const touch = await page.context().newCDPSession(page);
        const range = await page.getByRole('slider', { name: 'Seek Midnight Motion', exact: true }).boundingBox();
        assert(range.height >= 43, 'Waveform needs a usable finger target');
        const y = range.y + range.height / 2;
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: range.x + range.width * .2, y }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: range.x + range.width * .75, y }] });
        await expect.poll(() => page.getByRole('slider', { name: 'Seek Midnight Motion', exact: true }).inputValue().then(Number)).toBeGreaterThan(8);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(() => page.evaluate(() => window.player.currentTime)).toBeGreaterThan(8);
        // Pointer capture must retain the gesture when a finger leaves the waveform.
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: range.x + range.width * .5, y }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: range.x - 12, y: y - 16 }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(() => page.evaluate(() => window.player.currentTime)).toBeLessThan(.2);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: range.x + range.width * .6, y }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await expect.poll(() => page.evaluate(() => window.player.currentTime)).toBeLessThan(.2);
        await touch.detach();
        console.log(`PASS ${width}px touch player: raised position, finger drag, out-of-bounds capture and cancelled gesture`);
      }
      const slider = page.getByRole('slider', { name: 'Seek Midnight Motion', exact: true }); await slider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await expect.poll(() => page.evaluate(() => window.player.currentTime)).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Share Midnight Motion', exact: true }).focus(); await slider.click();
      await expect(page.locator('.hymn-player-waveform')).toHaveCSS('outline-style', 'none');
      await page.getByRole('button', { name: 'Play Midnight Motion', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.player.playing)).toBe(true);
      await page.getByRole('button', { name: 'Share Midnight Motion', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.copiedLink)).toBe('https://hymn.test/beat-store/producers/hymn-sessions#beat-1');
      await page.getByRole('button', { name: 'More beat actions', exact: true }).click();
      const actions = page.getByRole('dialog', { name: 'Beat actions for Midnight Motion', exact: true }); await expect(actions).toBeVisible();
      const box = await actions.boundingBox(); assert(box.x >= -1 && box.x + box.width <= width + 1, 'Actions panel must remain inside the viewport');
      await expect(actions.getByRole('button', { name: /Download free personal-use/ })).toBeVisible(); await expect(actions.getByRole('slider', { name: 'Preview volume' })).toBeVisible();
      const volume = actions.getByRole('slider', { name: 'Preview volume' });
      await expect(volume).toHaveCSS('accent-color', 'rgb(255, 255, 255)');
      await expect(volume).toHaveCSS('background-size', '100% 2px');
      await expect(volume).toHaveCSS('height', '24px');
      await volume.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
      await expect.poll(() => page.evaluate(() => window.player.volume)).toBe(0.01);
      await page.keyboard.press('End'); await expect.poll(() => page.evaluate(() => window.player.volume)).toBe(1);
      await page.keyboard.press('Escape'); await expect(actions).toBeHidden(); await expect(page.getByRole('button', { name: 'More beat actions', exact: true })).toBeFocused();
      await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.sharedData = data; } }));
      await page.getByRole('button', { name: 'Share Midnight Motion', exact: true }).click(); assert.equal((await page.evaluate(() => window.sharedData)).title, 'Midnight Motion');
      await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('blocked'); } } }); });
      await page.getByRole('button', { name: 'Share Midnight Motion', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Share beat link' })).toHaveValue('https://hymn.test/beat-store/producers/hymn-sessions#beat-1'); await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Open licence options for Midnight Motion', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Licence Midnight Motion', exact: true })).toBeVisible(); await page.keyboard.press('Escape');
      await expect(player).toHaveAttribute('data-collapsed', 'false');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      await expect(page.getByRole('status').filter({ hasText: 'Copy the beat link' })).toBeHidden({ timeout: 6000 });
      await page.screenshot({ path: `artifacts/premium-player-${width}.png`, animations: 'disabled' });
      await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(player).toHaveCSS('animation-name', 'none');
      if (width > 900) { await page.locator('.hymn-player-transport').getByRole('button', { name: 'Next beat', exact: true }).click(); await expect(page.getByRole('button', { name: 'Open licence options for The Next Chapter', exact: true })).toBeVisible(); }
      assert.deepEqual(errors, []); await page.close(); console.log(`PASS ${width}px premium player: real audio/waveform, keyboard seek, pause/resume, sharing, actions, licensing, reduced motion and viewport fit`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
