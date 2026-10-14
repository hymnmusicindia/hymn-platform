const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const css = ['app/styles/product-ui.css','app/styles/dashboard.css','app/styles/workspace-system.css','app/styles/release-catalogue-compact.css'].map(p => readFileSync(p,'utf8')).join('\n');
    for (const width of [900,1200]) {
      await page.setViewportSize({width,height:900});
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:20px}.release-library-grid{display:grid}.release-summary-tile{display:flex;flex-direction:column}.release-summary-artwork{width:100%}${css}</style><main class="workspace-v2"><div class="release-library-grid">${Array.from({length:8},(_,i)=>`<article class="release-summary-tile"><div class="release-summary-artwork"></div><div class="release-summary-meta-row"><span class="release-summary-badge">Under review</span></div><h3 class="release-summary-title">Release ${i}</h3><p class="release-summary-subtitle">Single · Artist</p><div class="release-summary-actions"><a class="release-summary-action-button">Manage</a></div></article>`).join('')}</div></main>`);
      const result = await page.evaluate(() => {
        const card = document.querySelector('.release-summary-tile').getBoundingClientRect();
        const art = document.querySelector('.release-summary-artwork').getBoundingClientRect();
        return {width:card.width, square:Math.abs(art.width-art.height)<1, badge:getComputedStyle(document.querySelector('.release-summary-badge')).borderRadius, columns:getComputedStyle(document.querySelector('.release-library-grid')).gridTemplateColumns.split(' ').length, overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.ok(result.width < 220); assert.ok(result.square); assert.equal(result.badge,'3px'); assert.ok(result.columns >= (width===900?4:5)); assert.equal(result.overflow,false);
      console.log(`PASS compact release catalogue at ${width}px (${result.columns} cards per row)`);
    }
    assert.ok(!readFileSync('components/release-summary-card.tsx','utf8').includes('release-summary-date'), 'Card-only timing copy removed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
