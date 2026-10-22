const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const { chromium, expect } = require('@playwright/test');
(async () => {
  const out = path.resolve('.cache/artist-amendment-browser'); await fs.mkdir(out, { recursive: true });
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseChangeRequestQueue} from './components/release-change-request-queue';createRoot(document.getElementById('root')).render(<ReleaseChangeRequestQueue initialRequests={[{id:25,requestType:'metadata_update',status:'approved',reason:'Correct the artist Spotify profile',submittedAt:'2026-10-22T10:00:00Z',release:{title:'Tere Bin Jiyun Kaise Bata',artistName:'Deepan Aggarwal',status:'LIVE'},events:[]}]}/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const css = await postcss([tailwind({ content: ['components/release-change-request-queue.tsx', 'components/workspace-records.tsx'], theme: { extend: {} }, plugins: [] })]).process('@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined });
  await fs.writeFile(path.join(out, 'ui.css'), css.css + await fs.readFile('app/styles/workspace-system.css', 'utf8'));
  const server = http.createServer(async (req, res) => {
    const file = req.url === '/ui.js' ? 'ui.js' : req.url === '/ui.css' ? 'ui.css' : null;
    res.setHeader('Content-Type', file?.endsWith('js') ? 'application/javascript' : file ? 'text/css' : 'text/html');
    res.end(file ? await fs.readFile(path.join(out, file)) : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><style>body{margin:0;padding:16px;background:#161d26;color:#edf2fa;font-family:Arial;--card:#202731;--border:#465368;--text-muted:#b7c1cf;--text-soft:#b7c1cf;--bg-soft:#1b232e}button{border:1px solid #465368;padding:10px;border-radius:12px}.surface-card{padding:20px;border:1px solid #465368;border-radius:18px;background:#202731}.input{max-width:100%;background:#161d26;padding:10px;border-radius:10px}.btn-primary{background:#edf2fa;color:#17202d}button:disabled{opacity:.4}</style></head><body><div id="root"></div><script src="/ui.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const browser = await chromium.launch();
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); let previews = 0, sends = 0;
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/admin/release-change-requests/25/amendment', async route => {
        const body = route.request().postDataJSON();
        if (body.action === 'preview') { previews++; return route.fulfill({ json: { revision: String(previews).padStart(64, '0'), issues: previews === 1 ? [{ message: 'Restore the original audio master' }] : [], locked: { upc: '3473620314135', isrc: 'INDN22602494' }, payload: { pin: '[REDACTED]', releasePreviouslyReleased: 'Yes', artists: [{ spotify_url: 'https://open.spotify.com/artist/0cevmXPSNfo7KO9xeE7M3m' }] } } }); }
        sends++; expect(body.previewRevision).toBe(String(previews).padStart(64, '0'));
        return sends === 1 ? route.fulfill({ status: 409, json: { error: 'The amendment changed. Preview again.' } }) : route.fulfill({ json: { submitted: true, request: { id: 25, status: 'submitted_to_partner' } } });
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('button', { name: 'Inspect request', exact: true }).click();
      const preview = page.getByRole('button', { name: 'Preview amendment', exact: true });
      await expect(page.getByRole('button', { name: 'Send approved amendment' })).toHaveCount(0);
      await preview.click(); const send = page.getByRole('button', { name: 'Send approved amendment' }); await expect(send).toBeDisabled();
      await preview.click(); await expect(send).toBeEnabled();
      await expect(page.locator('pre')).toContainText('3473620314135'); await expect(page.locator('pre')).toContainText('[REDACTED]');
      await page.screenshot({ path: path.join(out, `${width}-amendment.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await send.click(); await expect(page.getByText('The amendment changed. Preview again.', { exact: true })).toBeVisible();
      await preview.click(); await send.click(); await expect(send).toHaveCount(0); await expect(page.getByText('Amendment accepted. Monitoring the assigned identifiers and profile mapping.', { exact: true })).toBeVisible();
      expect(sends).toBe(2); expect(errors).toEqual([]); await page.close(); console.log(`PASS ${width}px amendment queue: preview-first, blocked invalid payload, locked codes, revision binding, stale preview handling and accepted replay UI.`);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
