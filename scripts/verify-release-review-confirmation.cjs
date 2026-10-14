const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'hymn-review-confirmation-'));
  await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ReleaseReviewConfirmation} from './components/release-review-confirmation'; const release={id:81,releaseTitle:'Ye Zindagi Na Milegi Tujhe Phir Kabhi — Extended Edition',artistName:'Deepan Aggarwal',releaseType:'single',releaseDate:'2026-11-06',primaryGenre:'Indian',language:'Hindi',tracks:[{id:1}],artworkUrl:''};createRoot(document.getElementById('root')).render(<ReleaseReviewConfirmation release={release} onReset={()=>window.resetCount=(window.resetCount||0)+1}/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(output, 'review.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'fixture-link', setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'import React from "react"; export default function Link(props){return React.createElement("a",props)}', resolveDir: process.cwd() }));
  }}] });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<html><body><div class="hymn-portal-root"><div class="hymn-portal"><div class="hymn-portal-frame"><div class="portal-workspace"><div class="portal-page-content"><main class="distribution-start-page"><section class="shell"><div id="root"></div></section></main></div></div></div></div></div></body></html>`);
    await page.addStyleTag({ content: `*{box-sizing:border-box}body{margin:0;font-family:Arial;background:#191b21;--text:#f3f5f8;--text-muted:#b2bac7;--text-soft:#909cac;--border:#363b44;--bg:#191b21;--bg-soft:#22262d;--card:#252931;--success:#8fc9ae;--success-soft:#21382e}h1,h2,h3,p,dl{margin:0}a{color:inherit;text-decoration:none}button{font:inherit}.portal-workspace{display:flex;flex-direction:column}.portal-page-content{min-width:0}.distribution-start-page{padding:0}.shell{width:100%;margin:0}@media(min-width:1024px){body{height:100dvh;overflow:hidden}}` });
    await page.addStyleTag({ path: 'app/styles/workspace-pages.css' });
    await page.addStyleTag({ path: path.join(output, 'review.css') });
    await page.addScriptTag({ path: path.join(output, 'review.js') });
    const heading = page.getByRole('heading', { name: 'Your release is under review', exact: true });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.locator('[aria-current="step"]')).toContainText('HYMN review');
    await expect(page.getByRole('link', { name: 'Track your release' })).toHaveAttribute('href', '/dashboard/releases?releaseId=81');
    for (const [width, height] of [[1440,600],[1024,768],[768,700],[390,844],[320,568]]) {
      await page.setViewportSize({ width, height });
      await expect(page.getByRole('heading', { name: /Ye Zindagi/ })).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}`);
      const scroller = page.locator('.portal-page-content');
      if (width >= 1024) {
        assert.equal(await scroller.evaluate(el => getComputedStyle(el).overflowY), 'auto');
        await scroller.evaluate(el => { el.scrollTop = 0; });
        await scroller.hover();
        await page.mouse.wheel(0, 600);
        await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
        await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
        assert.ok(await scroller.evaluate(el => el.scrollTop > 0), `Desktop review must actually scroll at ${width}`);
      }
      const faq = page.locator('summary').filter({ hasText: 'When will my release go live?' });
      await faq.click();
      await expect(page.getByText(/Your requested release date is not a guarantee/)).toBeVisible();
      await faq.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(/Your requested release date is not a guarantee/)).not.toBeVisible();
      const reset = page.getByRole('button', { name: 'Submit another release' });
      await reset.scrollIntoViewIfNeeded();
      await expect(reset).toBeInViewport();
      await reset.click();
      await page.evaluate(() => { document.querySelector('.portal-page-content').scrollTop=0; window.scrollTo(0,0); });
      await page.screenshot({ path: path.join(output, `review-${width}.png`), fullPage: width < 1024 });
      console.log(`PASS ${width}x${height}: scroll, full title, actions, FAQ and overflow`);
    }
    assert.equal(await page.evaluate(() => window.resetCount), 5);
    assert.deepEqual(errors, []);
    console.log('Previews: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
