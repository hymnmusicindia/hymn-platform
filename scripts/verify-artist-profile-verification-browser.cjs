const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const { chromium, expect } = require('@playwright/test');

(async () => {
  const out = path.resolve('.cache/artist-verification-browser');
  await fs.mkdir(out, { recursive: true });
  const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';import {useArtistProfileVerification} from './components/distribution/artist-profile-verification';function App(){const check=useArtistProfileVerification();const [result,setResult]=React.useState('');return <><button onClick={async()=>setResult(String(await check.verify(42,[10])))}>Submit release</button><p>{result}</p>{check.dialog}</>}createRoot(document.getElementById('root')).render(<App/>);`;
  await build({ stdin: { contents: fixture, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const css = await postcss([tailwind({ content: ['components/distribution/artist-profile-verification.tsx'], theme: { extend: {} }, plugins: [] })]).process('@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined });
  await fs.writeFile(path.join(out, 'ui.css'), css.css);
  const server = http.createServer(async (req, res) => {
    const file = req.url === '/ui.js' ? 'ui.js' : req.url === '/ui.css' ? 'ui.css' : null;
    res.setHeader('Content-Type', file?.endsWith('js') ? 'application/javascript' : file ? 'text/css' : 'text/html');
    res.end(file ? await fs.readFile(path.join(out, file)) : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><style>body{margin:0;background:#161d26;font-family:Arial;--card:#202731;--border:#465368;--text:#edf2fa;--text-muted:#b7c1cf}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid white;outline-offset:3px}</style></head><body><div id="root"></div><script src="/ui.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const original = 'https://open.spotify.com/artist/52BkE1owdr1Oz5duroCyHL';
  const corrected = 'https://open.spotify.com/artist/66x9igCk2Vdjrhm1ULpe6r';
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage(); const errors = []; let approvals = 0;
      page.on('pageerror', error => errors.push(error.message));
      await context.route('https://open.spotify.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Fixture Spotify artist</h1>' }));
      await page.route('**/api/distribution/artist-verification', async route => {
        const body = route.request().postDataJSON();
        if (body.action === 'approve') {
          expect(body.approvals[0].spotifyUrl).toBe(corrected);
          expect(body.approvals[0].openedSpotifyUrl).toBe(corrected);
          expect(body.approvals[0].approved).toBe(true); approvals++;
          return route.fulfill({ json: { releaseId: 42, artists: [] } });
        }
        return route.fulfill({ json: { releaseId: 42, artists: [{ artistCardId: 10, name: 'Fixture Artist', fingerprint: 'a'.repeat(64), spotifyUrl: original, appleUrl: null, youtubeUrl: null, instagramUrl: null }] } });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('button', { name: 'Submit release', exact: true }).click();
      const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
      const confirm = dialog.getByRole('button', { name: 'Confirm and continue' });
      const checkbox = dialog.getByRole('checkbox'); await expect(checkbox).toBeDisabled(); await expect(confirm).toBeDisabled();
      const open = dialog.getByRole('link', { name: 'Open Spotify profile' });
      await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
      const popup = await Promise.all([page.waitForEvent('popup'), open.click()]); await popup[0].close();
      await checkbox.check(); await expect(confirm).toBeEnabled();
      await dialog.getByRole('button', { name: 'Wrong link? Edit' }).click(); await expect(confirm).toBeDisabled();
      await dialog.getByLabel('Spotify artist link', { exact: true }).fill('https://open.spotify.com/album/wrong');
      await expect(open).toHaveCount(0); await expect(checkbox).toBeDisabled();
      await dialog.getByLabel('Spotify artist link', { exact: true }).fill(corrected);
      await expect(open).toHaveAttribute('href', corrected); await expect(checkbox).toBeDisabled();
      const nextPopup = await Promise.all([page.waitForEvent('popup'), open.click()]); await nextPopup[0].close();
      await checkbox.check();
      await page.screenshot({ path: path.join(out, `${width}-verification.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const bounds = await dialog.boundingBox(); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.width).toBeLessThanOrEqual(width);
      await confirm.click(); await expect(dialog).not.toBeVisible(); await expect(page.getByText('true', { exact: true })).toBeVisible(); expect(approvals).toBe(1);
      await page.getByRole('button', { name: 'Submit release', exact: true }).click(); await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(page.getByText('false', { exact: true })).toBeVisible();
      expect(errors).toEqual([]); await context.close();
      console.log(`PASS ${width}px: open-before-approval, corrected-link recheck, valid URL target, cancellation, responsive dialog, and explicit consent.`);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
