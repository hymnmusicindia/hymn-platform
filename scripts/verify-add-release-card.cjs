const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'hymn-add-release-'));
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AddReleaseCard} from './components/add-release-card';createRoot(document.getElementById('root')).render(<div className="release-library-grid"><AddReleaseCard/><article className="existing">Existing release</article></div>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(output,'card.js'), jsx:'automatic', plugins:[{name:'link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'import React from "react";export default function Link(props){return React.createElement("a",props)}',resolveDir:process.cwd()}));}}] });
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:0;padding:24px;background:#202227;font-family:Arial;--text:#f3f5f8;--text-muted:#b2bac7;--text-soft:#8d98a9;--border:#35373e;--card:#23252b;--bg-soft:#1b1e24}a{text-decoration:none}.release-library-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;max-width:900px}.existing{min-height:380px;border:1px solid var(--border);color:var(--text);padding:20px}@media(max-width:767px){.release-summary-tile{display:grid;grid-template-columns:84px minmax(0,1fr);column-gap:12px;max-width:none;height:auto;padding:10px}.release-summary-tile>div:first-child{grid-column:1;grid-row:1/span 4;width:84px}.release-summary-tile>div:nth-child(2){grid-column:2;grid-row:1;margin-top:0}.release-summary-tile>h3{grid-column:2;grid-row:2;margin-top:6px}.release-summary-tile>p{grid-column:2;grid-row:3}.release-summary-tile>div:nth-of-type(3){grid-column:2;grid-row:4;margin-top:6px}}'});
    await page.addStyleTag({path:path.join(output,'card.css')});
    await page.addScriptTag({path:path.join(output,'card.js')});
    const card=page.getByRole('link',{name:'Add your release — open distribution portal'});
    await expect(card).toHaveAttribute('href','/distribution');
    await expect(page.locator('.release-library-grid > :first-child')).toHaveAttribute('href','/distribution');
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});
      await expect(card.getByRole('heading',{name:'Add your release'})).toBeVisible();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await card.focus();
      assert.equal(await card.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
      await page.screenshot({path:path.join(output,`card-${width}.png`)});
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await card.hover();
    assert.equal(await card.locator('span').first().evaluate(el=>getComputedStyle(el).transform),'none');
    // The card is an action, not a synthetic release, and cannot alter catalogue counts.
    const source=await fs.readFile('components/release-portal.tsx','utf8');
    assert.ok(source.indexOf('<AddReleaseCard />')<source.indexOf('{visibleReleases.map'));
    console.log('PASS first position, portal destination, responsive layout, keyboard focus and reduced motion. Previews: '+output);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
