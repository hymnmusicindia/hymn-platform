const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  assert.match(fs.readFileSync('components/release-portal.tsx', 'utf8'), /useState<"grid" \| "list">\("grid"\)/, 'Release catalogue must open in its artwork card view');
  assert.match(fs.readFileSync('components/workspace-records.tsx', 'utf8'), /import "\.\/workspace-records\.css"/, 'Records must own their styles outside DashboardFrame');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Deliberately omit workspace-system.css: the public distribution shell does not load DashboardFrame.
    const css = fs.readFileSync('components/workspace-records.css', 'utf8');
    for (const width of [1200, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:16px}${css}</style><main class="release-portal-page"><div class="workspace-records"><div class="records-scroll"><table><thead><tr><th>Release</th><th>Status</th></tr></thead><tbody><tr><td data-primary="true" data-label="Release"><div class="record-identity"><img width="320" height="320" alt="Cover" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'/%3E"><div><strong>Yudeee</strong><small>NZLDR / single</small></div></div></td><td data-label="Status">Changes requested</td></tr></tbody></table></div></div></main>`);
      const result = await page.evaluate(() => ({
        artwork: document.querySelector('img').getBoundingClientRect().width,
        identity: getComputedStyle(document.querySelector('.record-identity')).display,
        row: getComputedStyle(document.querySelector('tbody tr')).display,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      assert.equal(result.artwork, 42, 'Covers stay thumbnails even when their source is large');
      assert.equal(result.identity, 'flex');
      assert.equal(result.row, width < 600 ? 'block' : 'table-row');
      assert.equal(result.overflow, false);
      console.log(`PASS independent release list styles at ${width}px`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
