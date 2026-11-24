// Exercise the real widget with a browser clock; no production support requests.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

(async () => {
  const out = path.resolve('.tmp/support-launcher');
  await fs.mkdir(out, { recursive: true });
  await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{SupportChatWidget}from'./components/support-chat-widget';createRoot(document.getElementById('root')).render(<SupportChatWidget userId={null}/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next', setup(b) {
    b.onResolve({ filter: /^next\/(link|navigation)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'next/link' ? `import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}` : `export const usePathname=()=>'/';`, resolveDir: process.cwd(), loader: 'tsx' }));
  } }] });
  const browser = await chromium.launch();
  try {
    for (const reduced of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      const errors = []; let requests = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install();
      await page.route('https://hymn.test/', route => route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><button id="outside">Continue browsing</button><div id="root"></div>' }));
      await page.route('**/api/support-chat**', route => { requests++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: false, phone: '', releases: [], hasMore: false }) }); });
      await page.goto('https://hymn.test/');
      await page.addStyleTag({ content: '*{box-sizing:border-box}body{margin:0;font-family:Arial;--bg:#f6f7f9;--card:#fff;--text:#192330;--text-muted:#4c5b6d;--border:#cbd3de;--bg-soft:#edf0f4;--focus:#2357a0;background:var(--bg);color:var(--text)}' });
      await page.addStyleTag({ path: path.join(out, 'ui.css') });
      await page.addScriptTag({ path: path.join(out, 'ui.js') });
      const dock = page.locator('[data-support-mode]');
      await expect(dock).toHaveAttribute('data-support-mode', 'hidden');
      await expect(page.getByRole('button', { name: 'Reveal HYMN support', exact: true })).toBeVisible();
      await page.clock.fastForward(4600);
      await expect(dock).toHaveAttribute('data-support-mode', 'greeting');
      await page.clock.runFor(800);
      await expect(page.getByRole('button', { name: /Hi, how can I help you/ })).toBeVisible();
      assert.equal(requests, 0, 'Invitations never call support APIs or open a chat');
      await page.screenshot({ path: path.join(out, reduced ? 'reduced-greeting.png' : 'greeting.png') });
      await page.clock.fastForward(7100);
      await expect(dock).toHaveAttribute('data-support-mode', 'hidden');
      await page.clock.fastForward(70100);
      await expect(dock).toHaveAttribute('data-support-mode', reduced ? 'hidden' : 'peek');
      if (!reduced) {
        await page.clock.runFor(800);
        await page.screenshot({ path: path.join(out, 'peek.png') });
        await page.clock.fastForward(4100);
        await expect(dock).toHaveAttribute('data-support-mode', 'hidden');
      }
      await page.getByRole('button', { name: 'Reveal HYMN support', exact: true }).click();
      await page.clock.runFor(800);
      const launcher = page.getByRole('button', { name: 'Open HYMN support', exact: true });
      await expect(launcher).toBeFocused();
      await page.clock.fastForward(20000);
      await expect(dock).toHaveAttribute('data-support-mode', 'visible');
      await launcher.click();
      await expect(page.getByRole('dialog', { name: 'HYMN Support' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(launcher).toBeFocused();
      await page.getByRole('button', { name: 'Hide HYMN support', exact: true }).click();
      await expect(dock).toHaveAttribute('data-support-mode', 'hidden');
      await page.locator('#outside').focus();
      await page.clock.fastForward(160000);
      await expect(dock).toHaveAttribute('data-support-mode', 'hidden');
      assert.equal(await page.evaluate(() => sessionStorage.getItem('hymn-support-dismissed-v1')), '1');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`PASS ${reduced ? 'reduced' : 'normal'} motion: greeting, auto-tuck, bounded peeks, keyboard focus, manual reveal, dismissal and no unsolicited requests.`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
