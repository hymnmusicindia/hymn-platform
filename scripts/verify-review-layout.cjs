const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');

// Layout-only fixture: no customer session, database, or submission is used.
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const css = ['app/styles/product-ui.css', 'app/styles/release-record-review.css']
      .map(path => readFileSync(path, 'utf8')).join('\n');
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<style>body{margin:0;background:#202328}*{box-sizing:border-box}.release-premium-editor{padding:20px;max-width:1000px;margin:auto}${css}</style>
        <main class="release-workflow release-premium-editor is-review-mode" style="display:grid;grid-template-columns:132px minmax(0,1fr)"><nav class="release-workflow-nav" aria-label="Release sections"><button>Details</button><button>Tracks</button><button>Artwork</button><button>Rights</button><button aria-current="step">Review</button></nav><div class="release-workflow-content"><section class="release-record-review">
        <header class="record-review-heading"><div><p>YOUR NEXT RELEASE</p><h2>Ready for the world?</h2></div><span>Ready for review</span></header>
        <article class="record-review-card"><div class="record-review-cover">Artwork</div><div class="record-review-identity"><p>SINGLE · 1 TRACK</p><h3>Ye Zindagi Na Milegi Tujhe Phir Kabhi</h3><span>Deepan Aggarwal</span><dl><div><dt>Release date</dt><dd>After approval</dd></div><div><dt>Label</dt><dd>HYMN</dd></div></dl><button>Edit artwork →</button></div></article>
        <div class="record-review-details">${['Release details','Rights & ownership','Delivery'].map(title => `<section><header><h3>${title}</h3><button>Edit →</button></header><dl><div><dt>Language</dt><dd>Hindi</dd></div><div><dt>Territories</dt><dd>Worldwide</dd></div></dl></section>`).join('')}</div>
        <div class="review-confirmation record-review-confirmation"><label><input type="checkbox"><span><strong>One final confirmation</strong><span>I have checked the music, credits, rights and delivery details, and I have authority to distribute this release.</span></span></label></div>
        </section></div></main>`);
      const result = await page.evaluate(() => {
        const panel = document.querySelector('.record-review-confirmation');
        const label = panel.querySelector('label');
        const content = document.querySelector('.release-workflow-content').getBoundingClientRect();
        const main = document.querySelector('main').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth,
          contentOffset: content.left - main.left - parseFloat(getComputedStyle(document.querySelector('main')).paddingLeft) - parseFloat(getComputedStyle(document.querySelector('main')).borderLeftWidth || '0'),
          toolbar: getComputedStyle(document.querySelector('.release-workflow-nav')).display,
          display: getComputedStyle(panel).display,
          labelOffset: label.getBoundingClientRect().left - panel.getBoundingClientRect().left,
          titleSize: parseFloat(getComputedStyle(document.querySelector('.record-review-identity h3')).fontSize) };
      });
      assert.equal(result.overflow, false, `Horizontal overflow at ${width}px`);
      assert.ok(Math.abs(result.contentOffset) <= 1, 'Review must not reserve an empty left rail');
      assert.equal(result.toolbar, 'flex', 'Section shortcuts must remain visible');
      assert.equal(result.display, 'block', 'Legacy confirmation grid must be removed');
      assert.ok(result.labelOffset < 30, 'Confirmation must start at the left, not the second column');
      assert.ok(result.titleSize <= 30, 'Release title must remain compact');
      console.log(`Review layout passed at ${width}px`);
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
