const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { build } = require('esbuild'), postcss = require('postcss'), tailwind = require('tailwindcss');
const { chromium } = require('@playwright/test');
const { textContrast } = require('./lib/text-contrast.cjs');
(async () => {
    const out = path.resolve('.cache/release-theme');
    await fs.mkdir(out, { recursive: true });
    await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ReleaseForm}from'./components/release-form';const release={id:42,status:'draft',releaseTitle:'ONLY FEELINGS',trackName:'ONLY FEELINGS',artistName:'SHIVAM08',releaseType:'single',labelName:'HYMN Music',contentType:'Non-Exclusive Licensed',copyrightOwner:'Test artist',publishingRights:'Test artist',metadata:{},tracks:[],createdAt:'2026-10-30',artworkUrl:null};createRoot(document.getElementById('root')).render(<main className="hymn-portal-root hymn-landing"><div className="distribution-start-page"><ReleaseForm selectedPlan="one_time" userName="Test Artist" initialRelease={release} initialStage={window.fixtureStage}/></div></main>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next', setup(b) { b.onResolve({ filter: /^next\// }, a => ({ path: a.path, namespace: 'fixture' })); b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'next/navigation' ? 'export const usePathname=()=>"/distribution/start";export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){},replace(){},refresh(){}});' : 'import React from "react";export default function Element({prefetch,fill,priority,children,...p}){return ' + (a.path === 'next/image' ? '<img {...p}/>' : '<a {...p}>{children}</a>') + '}', loader: 'tsx', resolveDir: process.cwd() })); } }] });
    const layout = await fs.readFile('app/layout.tsx', 'utf8');
    const css = (await Promise.all([...layout.matchAll(/import ["'](\.[^"']+\.css)["']/g)].map(m => fs.readFile(path.resolve('app', m[1]), 'utf8')))).join('\n');
    const compiled = await postcss([tailwind(path.resolve('tailwind.config.ts'))]).process(css, { from: path.resolve('app/globals.css') });
    const browser = await chromium.launch();
    try {
        for (const theme of ['light', 'dark'])
            for (const width of [1440, 390, 320])
                for (const stage of [0, 1, 2, 3, 4, 5, 7]) {
                    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
                    const errors = [];
                    page.on('pageerror', e => errors.push(e.message));
                    await page.route('https://hymn.test/**', r => r.request().resourceType() === 'document' ? r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : r.fulfill({ json: { items: [], artists: [], releases: [], countries: [], stores: [], queue: {} } }));
                    await page.goto('https://hymn.test/distribution/start');
                    await page.evaluate(({ theme, stage }) => { document.documentElement.dataset.theme = theme; window.fixtureStage = stage; }, { theme, stage });
                    await page.addStyleTag({ content: compiled.css });
                    await page.addStyleTag({ path: path.join(out, 'ui.css') });
                    await page.addScriptTag({ path: path.join(out, 'ui.js') });
                    await page.waitForSelector('.release-workflow');
                    assert.deepEqual(errors, []);
                    if (stage === 5)
                        assert.ok(await page.getByText('HYMN requires your licence or beat agreement for non-exclusive content.').isVisible());
                    const { failures, checked } = await page.evaluate(source => { const contrast = (0, eval)('(' + source + ')'); const failures = []; let checked = 0; for (const el of document.querySelectorAll('.release-workflow h1,.release-workflow h2,.release-workflow h3,.release-workflow p,.release-workflow dt,.release-workflow dd,.release-workflow label,.release-workflow button,.release-workflow input:not([type=checkbox]),.release-workflow span')) {
                        if (!el.getClientRects().length || el.matches(':disabled'))
                            continue;
                        const text = el.innerText || el.value;
                        if (!text?.trim())
                            continue;
                        const result = contrast(el);
                        checked++;
                        if (result.ratio < 4.5)
                            failures.push({ text: text.slice(0, 90), ...result });
                    } return { failures, checked }; }, textContrast.toString());
                    assert.ok(checked > 5);
                    if (failures.length)
                        console.log(JSON.stringify(failures, null, 2));
                    assert.deepEqual(failures, [], theme + ' ' + width + ' stage ' + stage);
                    for (const control of await page.locator('.release-footer-action:not(:disabled),.record-review-identity button,input.field').all()) {
                        if (!await control.isVisible())
                            continue;
                        await control.hover();
                        assert.ok((await control.evaluate(textContrast)).ratio >= 4.5, 'hover ' + theme + ' ' + stage);
                        await control.focus();
                        assert.ok((await control.evaluate(textContrast)).ratio >= 4.5, 'focus ' + theme + ' ' + stage);
                    }
                    await page.screenshot({ path: path.join(out, theme + '-' + width + '-' + stage + '.png'), fullPage: true });
                    console.log('PASS ' + theme + ' ' + width + 'px release stage ' + stage + ' ' + checked + ' text/control contrast checks');
                    await page.close();
                }
    }
    finally {
        await browser.close();
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
