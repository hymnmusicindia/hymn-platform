const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { build } = require('esbuild'), postcss = require('postcss'), tailwind = require('tailwindcss');
const { chromium } = require('@playwright/test');
const { textContrast } = require('./lib/text-contrast.cjs');
(async () => {
    const out = path.resolve('.cache/mobile-layout');
    await fs.mkdir(out, { recursive: true });
    await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ReleaseQcReportView}from'./components/release-qc-report';import{PortalLayout}from'./components/portal-layout';import{WorkspaceRecords}from'./components/workspace-records';const long='Rights-holder-identifier-'+('longidentifier'.repeat(18));const match={title:'A matched recording with a long title '+long,artists:['Matched Artist'],isrc:'INTEST2600001',label:long,score:97,startMs:1200,endMs:4400,referenceStartMs:2000,referenceEndMs:5200,rightsOwners:[long],distributors:[long],policies:['Review licence evidence'],spotifyUrl:'https://open.spotify.com/track/test',youtubeUrl:'https://youtube.com/watch?v=test'};const report={version:1,releaseId:42,attemptId:1,currentUpc:'3473620321225',sourceUpc:'3473620321225',fetchedAt:'2026-10-30T12:00:00Z',provenance:'partner_supplied',verified:true,tracks:[{localTrackId:1,trackNumber:1,title:'ONLY FEELINGS '+long,isrc:'INTEST2600001',sourceIsrc:'INTEST2600001',scanned:true,analysisAvailable:true,matches:[match],isrcLookup:long,upcLookup:long,aiPrediction:'Not supplied',notes:[]}]};createRoot(document.getElementById('root')).render(<div className="hymn-portal-root"><PortalLayout user={{name:'Test Artist',role:'customer'}}><ReleaseQcReportView release={{id:42,title:'ONLY FEELINGS',upc:'3473620321225',status:'changes_requested',correctionReason:'Review the requested evidence: https://hymn.test/report/'+long,tracks:[{id:1,audioUrl:'/api/assets/1/download'}]}} report={report}/><section aria-label="Record browser mobile fixture"><WorkspaceRecords rows={[{id:1,name:long,email:long+'@example.com'}]} columns={[{key:'art',label:'Artwork',render:r=><img className="record-art" src="/fixture-cover.svg" alt="Record artwork"/>},{key:'name',label:'Customer',primary:true,render:r=><strong>{r.name}</strong>},{key:'email',label:'Contact',render:r=><span>{r.email}</span>}]} rowKey={r=>r.id} searchText={r=>r.name}/></section></PortalLayout></div>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next', setup(b) { b.onResolve({ filter: /^next\// }, a => ({ path: a.path, namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'next/navigation' ? 'export const usePathname=()=>"/dashboard/releases/42/qc-report";export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){},replace(){},refresh(){}});' : 'import React from "react";export default function Element({prefetch,fill,priority,children,...p}){return ' + (a.path === 'next/image' ? '<img {...p}/>' : '<a {...p}>{children}</a>') + '}', loader: 'tsx', resolveDir: process.cwd() })); } }] });
    const layout = await fs.readFile('app/layout.tsx', 'utf8');
    const css = (await Promise.all([...layout.matchAll(/import ["'](\.[^"']+\.css)["']/g)].map(m => fs.readFile(path.resolve('app', m[1]), 'utf8')))).join('\n');
    const compiled = await postcss([tailwind(path.resolve('tailwind.config.ts'))]).process(css, { from: path.resolve('app/globals.css') });
    const browser = await chromium.launch();
    try {
        for (const theme of ['light', 'dark'])
            for (const width of [1440, 768, 390, 320]) {
                const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
                await page.route('https://hymn.test/**', r => r.request().resourceType() === 'document' ? r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : r.fulfill({ json: { items: [] } }));
                await page.goto('https://hymn.test/dashboard/releases/42/qc-report');
                await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
                await page.addStyleTag({ content: compiled.css });
                await page.addStyleTag({ path: path.join(out, 'ui.css') });
                await page.addScriptTag({ path: path.join(out, 'ui.js') });
                await page.getByRole('heading', { name: 'ONLY FEELINGS', exact: true }).waitFor();
                assert.equal(await page.getByRole('link', { name: 'Download report', exact: true }).getAttribute('href'), '/api/releases/42/qc-report?download=1');
                assert.equal(await page.getByRole('link', { name: 'Review corrections', exact: true }).getAttribute('href'), '/dashboard/releases/42?tab=corrections');
                await page.locator('main details').evaluateAll(nodes => nodes.forEach(n => n.open = true));
                assert.ok((await page.getByAltText('Record artwork').boundingBox()).width<=48);const failures = await page.evaluate(() => { const result = []; for (const e of document.querySelectorAll('.landing-page-content main,.landing-page-content main *,[aria-label="Record browser mobile fixture"] *')) {
                    if (e.closest('svg') || !e.getClientRects().length || getComputedStyle(e).display === 'none')
                        continue;
                    const r = e.getBoundingClientRect();
                    if (r.width > innerWidth + 1 || r.right > innerWidth + 1 || r.left < -1)
                        result.push({ tag: e.tagName, cls: String(e.className), text: e.textContent.slice(0, 60), left: r.left, right: r.right, width: r.width });
                } return result; });
                if (failures.length)
                    console.log(JSON.stringify(failures.slice(0, 15), null, 2));
                assert.deepEqual(failures, [], theme + ' ' + width + ' content must fit viewport');
                if (width <= 768)
                    for (const a of await page.locator('.records-pagination button,.records-pagination select' + (width <= 390 ? ',main>header a' : '')).all()) {
                        const r = await a.boundingBox();
                        assert.ok(r.height >= 44 && r.width >= 44);
                    }
                const contrastFailures = await page.evaluate(source => { const check = (0, eval)('(' + source + ')'); return [...document.querySelectorAll('main h1,main h2,main h3,main p,main dt,main dd,main summary,main a')].filter(e => e.getClientRects().length).map(e => ({ text: e.textContent.slice(0, 60), ...check(e) })).filter(r => r.ratio < 4.5); }, textContrast.toString());
                assert.deepEqual(contrastFailures, []);
                await page.screenshot({ path: path.join(out, theme + '-' + width + '.png'), fullPage: true });
                if (width === 390)
                    await page.screenshot({ path: path.join(out, theme + '-' + width + '-viewport.png') });
                console.log('PASS ' + theme + ' ' + width + 'px QC report, long evidence, expanded matches, audio controls and record browser');
                await page.close();
            }
    }
    finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
