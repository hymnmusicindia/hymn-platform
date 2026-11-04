const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
(async () => {
 const dir = path.resolve('.cache/music-app-update'); await fs.mkdir(dir, { recursive: true });
 await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MusicAppUpdate} from './components/music-app-update';createRoot(document.getElementById('root')).render(<MusicAppUpdate/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(dir, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
 const css = await fs.readFile('app/styles/theme-tokens.css', 'utf8');
 const server = http.createServer(async (req, res) => {
  if (req.url === '/ui.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await fs.readFile(path.join(dir, 'ui.js'))); }
  else if (req.url === '/api/music/app-release') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ version: '1.0.5', versionCode: 6 })); }
  else { res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}*{box-sizing:border-box}body{margin:0;font:14px Arial}</style><div id="root"></div><script src="/ui.js"></script>`); }
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const browser = await chromium.launch();
 try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) {
   const context = await browser.newContext({ userAgent: 'Android HYMNMusic/1.0.4', viewport: { width, height: 740 } });
   const page = await context.newPage(); await page.goto(origin); await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
   await expect(page.getByRole('dialog')).toBeVisible();
   await expect(page.getByRole('link', { name: 'Download update' })).toHaveAttribute('href', '/music/app/download');
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
   await page.getByRole('button', { name: 'Later' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.reload(); await page.waitForTimeout(150); await expect(page.getByRole('dialog')).toHaveCount(0);
   await context.close();
  }
  for (const userAgent of ['Android Chrome', 'Android HYMNMusic/1.0.5', 'Android HYMNMusic/2.0.0']) {
   const context = await browser.newContext({ userAgent }); const page = await context.newPage(); await page.goto(origin); await page.waitForTimeout(150); await expect(page.getByRole('dialog')).toHaveCount(0); await context.close();
  }
  const context = await browser.newContext({ userAgent: 'Android HYMNMusic/1.0.4' });
  const page = await context.newPage(); await page.route('**/api/music/app-release', route => route.fulfill({ status: 503, body: '{}' })); await page.goto(origin); await page.waitForTimeout(150); await expect(page.getByRole('dialog')).toHaveCount(0); await context.close();
  console.log('PASS Android update prompt: older versions only, correct APK link, current/newer/browser exclusion, light/dark 320/390/1440px layout, dismissal persistence and outage recovery without blocking work.');
 } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
