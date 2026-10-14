const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const css = ['release-catalogue-compact','product-ui','workspace-pages','workspace-system'].map(name => readFileSync(`app/styles/${name}.css`, 'utf8')).join('\n');
    for (const width of [390, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;--border:#484d57;--bg-soft:#202328;--text:#f4f5f7;--text-muted:#b9c0cb}${css}</style><main class="workspace-v2 hymn-portal-root"><div class="hymn-portal"><div class="release-catalogue-filters">${Array.from({length:5},()=>'<label class="release-filter-control"><span class="release-filter-label">Status</span><select class="field"><option>All statuses</option><option>Under review</option></select></label>').join('')}<div class="release-filter-count"><p class="release-results-count"><strong>5</strong> of 5 releases</p></div></div></div></main>`);
      const result = await page.locator('select').first().evaluate(el => {
        const style = getComputedStyle(el), option = getComputedStyle(el.options[0]);
        return { color:style.color, background:style.backgroundColor, optionColor:option.color, optionBackground:option.backgroundColor, border:getComputedStyle(el.closest('label')).borderTopWidth, overflow:document.documentElement.scrollWidth>innerWidth };
      });
      assert.equal(result.color, 'rgb(244, 245, 247)');
      assert.equal(result.background, 'rgb(36, 39, 44)');
      assert.equal(result.optionColor, result.color);
      assert.equal(result.optionBackground, result.background);
      assert.equal(result.border, '1px');
      assert.equal(result.overflow, false);
      console.log(`PASS release filter contrast and layout at ${width}px`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
