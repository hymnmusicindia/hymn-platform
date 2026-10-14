const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hymn-curation-invite-'));
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseCurationInvitation} from './components/release-curation-invitation';const root=createRoot(document.getElementById('root'));window.showInvite=()=>root.render(<ReleaseCurationInvitation releaseId={83}/>);window.hideInvite=()=>root.render(null);window.showInvite();`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: path.join(temp,'invite.js'), jsx: 'automatic', plugins: [{ name: 'link-fixture', setup(b) { b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Link(props){return React.createElement('a',props)}`, resolveDir: process.cwd() })); } }] });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://hymn.fixture/**', route => route.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' }));
    await page.goto('https://hymn.fixture/');
    await page.addStyleTag({ path: path.join(temp,'invite.css') });
    await page.addScriptTag({ path: path.join(temp,'invite.js') });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('link', { name: 'Explore playlists' })).toHaveAttribute('href', '/dashboard/playlists?releaseId=83');
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => window.hideInvite()); await page.evaluate(() => window.showInvite());
    await page.waitForTimeout(3700); await expect(page.getByRole('dialog')).toHaveCount(0);
    console.log('PASS delayed invitation, dedicated-page release link, Escape dismissal and session-level deduplication.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
