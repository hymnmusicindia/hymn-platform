const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'hymn-release-sections-'));
  await build({ stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ReleaseSectionTabs} from './components/release-section-tabs';import {ProviderCorrectionWorkspace} from './components/provider-correction-workspace';const items=[{key:'information',label:'Metadata'},{key:'splits',label:'Splits'},{key:'overview',label:'Overview'},{key:'tracks',label:'Tracks',count:1},{key:'corrections',label:'Correction requests',count:1,attention:true},{key:'activity',label:'History'}];function App(){const [active,setActive]=useState('information');return <><ReleaseSectionTabs items={items} active={active} onChange={setActive} panelId="panel"/><div id="panel" role="tabpanel" aria-label={active} tabIndex={0}>{active==='corrections'?<ProviderCorrectionWorkspace release={{status:'changes_requested',releaseTitle:'Ye Zindagi Na Milegi Tujhe Phir Kabhi',tracks:[{trackTitle:'Ye Zindagi Na Milegi Tujhe Phir Kabhi',primaryArtist:'Deepan Aggarwal'}],reviewIssues:{fields:[{field:'tracks.0.trackLanguage',label:'Track 1 — DireNote correction',note:'INCORRECT TRACK LANGUAGE'}]}}} onFix={field=>window.fixedField=field}/>:active}</div></>};createRoot(document.getElementById('root')).render(<App/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(output, 'tabs.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({ content: 'body{margin:0;padding:16px;background:#1d2025;color:#f4f4f4;font-family:Arial;--bg:#1d2025;--bg-soft:#23272d;--card:#292d33;--border:#3b4048;--text:#f4f4f4;--text-muted:#b8bdc6;--text-soft:#969ca7}*{box-sizing:border-box}#root{max-width:1000px;margin:auto}' });
    await page.addStyleTag({ path: path.join(output, 'tabs.css') });
    await page.addScriptTag({ path: path.join(output, 'tabs.js') });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const metadata = page.getByRole('tab', { name: 'Metadata', exact: true });
      await metadata.click();await metadata.focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: 'Splits', exact: true })).toBeFocused();
      await expect(page.getByRole('tab', { name: 'Splits', exact: true })).toHaveAttribute('aria-selected','true');
      await page.keyboard.press('End');
      await expect(page.getByRole('tab', { name: 'History', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowRight');await expect(metadata).toBeFocused();
      await page.getByRole('tab', { name: /Correction requests/ }).click();
      await expect(page.getByRole('heading', { name: 'Corrections to complete' })).toBeVisible();
      await page.getByRole('button', { name: 'Fix Track 1' }).click();
      assert.equal(await page.evaluate(() => window.fixedField), 'tracks.0.trackLanguage');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow');
      assert.equal(await page.locator('[role=tab][tabindex="0"]').count(), 1);
      await page.screenshot({ path: path.join(output, `tabs-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('PASS tabs: click, selection, arrow/Home/End navigation, wrapping, roving focus, correction action, mobile overflow. Previews: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
