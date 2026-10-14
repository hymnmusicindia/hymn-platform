const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hymn-curation-invite-'));
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseCurationInvitation} from './components/release-curation-invitation';const root=createRoot(document.getElementById('root'));window.showInvite=()=>root.render(<ReleaseCurationInvitation releaseId={83} context={{genre:"Indie Pop",mood:"Romantic",releaseType:"Single"}}/>);window.hideInvite=()=>root.render(null);window.showInvite();`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, outfile: path.join(temp,'invite.js'), jsx: 'automatic', plugins: [{ name: 'link-fixture', setup(b) { b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `import React from 'react';export default function Link(props){return React.createElement('a',props)}`, resolveDir: process.cwd() })); } }] });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://hymn.fixture/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/playlist-reviews') return route.fulfill({ json: { recommendations: [{ id: 1, name:'Dusk Till Dawn', image:'1', reason:'Explore a late-night listening mood' }, { id: 2, name:'Indie Hits', image:'2', reason:'Explore independent voices' }] } });
      if (url.pathname.startsWith('/assets/playlist-images/previews/')) return route.fulfill({ body:await fs.readFile(path.join('public',url.pathname)), contentType:'image/webp' });
      return route.fulfill({ body: '<style>body{margin:0;background:#11151b;font-family:Arial}*{box-sizing:border-box}button,a,input{font-family:inherit}#root{min-height:100vh}</style><div id="root"></div>', contentType: 'text/html' });
    });
    await page.goto('https://hymn.fixture/');
    await page.addStyleTag({ path: path.join(temp,'invite.css') });
    await page.addScriptTag({ path: path.join(temp,'invite.js') });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('button', { name: /Dusk Till Dawn/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find curators for my song' })).toHaveAttribute('href', '/dashboard/playlists?releaseId=83&playlistId=1');
    await page.getByRole('button', { name: /Indie Hits/ }).click();
    await expect(page.getByRole('link', { name: 'Find curators for my song' })).toHaveAttribute('href', '/dashboard/playlists?releaseId=83&playlistId=2');
    const previewDir = process.argv.includes('--preview-dir') ? process.argv[process.argv.indexOf('--preview-dir')+1] : temp;
    await fs.mkdir(previewDir,{recursive:true});
    for (const width of [1100,390]) {
      await page.setViewportSize({width,height:900});
      await expect(page.getByAltText('Indie Hits playlist')).toBeVisible();
      if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Invitation overflow');
      await page.screenshot({path:path.join(previewDir,`playlist-curation-invitation-${width}.png`),fullPage:true});
    }
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => window.hideInvite()); await page.evaluate(() => window.showInvite());
    await page.waitForTimeout(3700); await expect(page.getByRole('dialog')).toHaveCount(0);
    console.log('PASS delayed visual invitation, selectable recommendations, CTA handoff, mobile overflow, Escape dismissal and session deduplication. Samples: '+previewDir);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
