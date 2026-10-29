const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('@playwright/test');
const { textContrast } = require('./lib/text-contrast.cjs');

async function main() {
  const out = path.resolve('.cache/theme-components');
  await fs.mkdir(out, { recursive: true });
  await build({ stdin: { contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{MusicLifecycleBanner}from'./components/music-lifecycle-banner';
    import{HomeReviewsCarousel}from'./components/home-reviews-carousel';
    import team from './components/team/workspace.module.css';
    import admin from './components/admin-workspace.module.css';
    import calls from './components/team/call-report.module.css';import list from './components/beat-card.module.css';import tile from './components/beat-store-card.module.css';
    const reviews=[{id:1,rating:5,body:'A clear release journey from start to finish.',featured:true,featuredOrder:1,purchaseType:'distribution',user:{id:1,name:'Test artist',avatar:null}},{id:2,rating:5,body:null,featured:false,featuredOrder:2,purchaseType:'beat',user:{id:2,name:'Test producer',avatar:null}}];
    createRoot(document.getElementById('root')).render(<main className="hymn-landing"><article className={list.card}><div><h3>Beat list view</h3><p className={list.producer}>Producer name</p></div><button className={list.licence}>Choose licence</button></article><article className={tile.card}><h3>Beat cover view</h3><p className={tile.producer}>Producer name</p><button className={tile.price}>Buy beat</button></article><MusicLifecycleBanner/><HomeReviewsCarousel reviews={reviews}/><section className={team.workspace} data-dashboard-surface="team"><aside className={team.sidebar}><nav><button aria-current="page">Home</button><button>Contacts and growth</button></nav></aside><div><h1>Call reports</h1><p>Contact notes and next actions</p><button className={team.primary}>Create report</button><input aria-label="Report subject" defaultValue="Customer follow-up"/><textarea aria-label="Call notes" defaultValue="Discuss the next release"/><div className={calls.sheet}><h2>Customer history</h2><p>Saved reports stay with the contact.</p></div></div></section><section className={admin.workspace} data-dashboard-surface="admin"><h1>Release operations</h1><p>Review submissions and delivery</p><button>Refresh releases</button><input className="field" aria-label="Search releases" defaultValue="Search catalogue"/></section><section className="distribution-workflow"><h2>Release details</h2><p style={{color:'var(--text-muted)'}}>Track credits and artwork</p><button className="btn-outline">Back</button><button className="btn-primary">Save and continue</button></section><section className="hymn-overlay"><div className="surface-card"><h2>Confirm your changes</h2><p>Review the details before continuing.</p><button className="btn-outline">Cancel</button></div></section></main>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, external: ['/assets/*'], outfile: path.join(out, 'fixture.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next-fixture', setup(b) { b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'mock' })); b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'import React from"react";export default function Link({prefetch,children,...p}){return <a {...p}>{children}</a>}', loader: 'tsx', resolveDir: process.cwd() })); } }] });
  const layout = await fs.readFile('app/layout.tsx', 'utf8');
  const globalCss = (await Promise.all([...layout.matchAll(/import ["'](\.[^"']+\.css)["']/g)].map(m => fs.readFile(path.resolve('app', m[1]), 'utf8')))).join('\n');
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await page.setContent(`<html data-theme="${theme}"><body><div id="root"></div></body></html>`);
      await page.addStyleTag({ content: globalCss });
      await page.addStyleTag({ path: path.join(out, 'fixture.css') });
      await page.addScriptTag({ path: path.join(out, 'fixture.js') });
      await page.getByRole('heading', { name: 'Call reports', exact: true }).waitFor();
      for (const locator of [page.getByRole('heading'), page.locator('p,blockquote,input,textarea'), page.getByRole('link'), page.getByRole('button'), page.locator('article footer strong,article footer small')]) {
        for (const element of await locator.all()) {
          if (!await element.isVisible()) continue;
          const result = await element.evaluate(textContrast);
          assert.ok(result.ratio >= 4.5, `${theme} ${width} ${await element.textContent()} ${JSON.stringify(result)}`);
        }
      }
      const action = page.getByRole('button', { name: 'Create report' });
      await action.hover();assert.ok((await action.evaluate(textContrast)).ratio >= 4.5);
      await action.focus();assert.ok((await action.evaluate(textContrast)).ratio >= 4.5);
      await page.screenshot({ path: path.join(out, `${theme}-${width}.png`), fullPage: true });
      console.log(`PASS ${theme} ${width}px real reviews, workflow, admin/team controls, distribution and overlay contrast`);
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
