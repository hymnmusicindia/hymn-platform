const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

async function main() {
  const out = path.resolve('.cache/income-explorer');
  await fs.mkdir(out, { recursive: true });
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {IncomeSources} from './components/income-sources';createRoot(document.getElementById('root')).render(<IncomeSources onDistribution={()=>document.getElementById('distribution-payouts').scrollIntoView()}/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const keys = ['artist_royalty', 'studio', 'producer_beat_sales', 'other', 'referral', 'curator'];
  const labels = ['Distribution royalties', 'Mixing & mastering gigs', 'Beat sales', 'Other wallet income', 'Referral commissions', 'Playlist curator reviews'];
  const fixture = () => ({ sources: keys.map((key, index) => ({ key, label: labels[index], earned: [10000, 5000, 2000, 0, 2000, 1000][index], available: [9000, 4000.25, 2000, 0, 1800, 500][index], held: index === 4 ? 200 : 0, paid: 0, minimum: index === 0 ? 105 : index > 3 ? 1500 : 3000, currency: index === 0 ? 'USD' : 'INR', route: index === 4 ? 'referral' : index === 5 ? 'curator' : 'wallet', requestPending: false })), checkoutCredit: 75.50, reconciliationRequired: false });
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      let data = fixture(), fail = false, historyFail = false, result = 'accepted';
      const writes = [], errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://income.fixture/**', async route => {
        const req = route.request(), url = new URL(req.url());
        if (req.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: '<html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><section id="distribution-payouts"><h2>Distribution payouts</h2></section></html>' });
        if (url.pathname === '/api/payout/income') return route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : data });
        if (url.pathname.endsWith('/history')) {
          if (historyFail) return route.fulfill({ status: 503, json: {} });
          const source = url.searchParams.get('source'), older = url.searchParams.has('before');
          return route.fulfill({ json: { source, entries: [{ id: older ? 19 : 20, date: '2026-11-12T00:00:00Z', label: older ? 'Older earning credit' : `Verified ${source} credit`, amount: older ? -25.5 : 1000.25, status: 'AVAILABLE' }], withdrawals: [], nextCursor: older ? null : 20 } });
        }
        if (req.method() === 'POST') {
          writes.push({ path: url.pathname, body: req.postDataJSON() });
          await new Promise(resolve => setTimeout(resolve, 150));
          if (result === 'unknown') return route.abort();
          if (result === 'rejected') return route.fulfill({ status: 400, json: { error: 'Verify your payout destination.' } });
          fail = true;
          return route.fulfill({ status: 201, json: url.pathname.includes('referrals') ? { payout: { id: 91 } } : { request: { id: 92 } } });
        }
        throw Error(`Unexpected API ${url.pathname}`);
      });
      async function mount() {
        await page.goto('https://income.fixture/');
        await page.addStyleTag({ content: '*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Arial;background:#0f141c;color:#eef2f8;--text:#eef2f8;--text-muted:#a6b2c4;--text-soft:#a6b2c4;--bg:#0f141c;--bg-soft:#161f2b;--card:#1b2532;--card-strong:#1b2532;--border:#334153;--accent:#98baff;--danger:#ff9ca5}button,input{font:inherit}#root{max-width:1240px;margin:auto}' });
        await page.addStyleTag({ path: path.join(out, 'ui.css') });
        await page.addScriptTag({ path: path.join(out, 'ui.js') });
        await expect(page.getByRole('heading', { name: 'Your income, in perspective.' })).toBeVisible();
        await expect(page.getByRole('checkbox')).toHaveCount(6);
      }
      const details = () => page.getByRole('region', { name: 'Selected income source details' });
      const explore = label => page.getByRole('button', { name: `Explore ${label}`, exact: true }).click();
      const refresh = async () => { await page.getByRole('button', { name: 'Refresh income sources' }).click(); await expect(page.getByRole('button', { name: 'Refresh income sources' })).toBeEnabled(); };
      await mount();
      await expect(page.getByRole('button', { name: 'Distribution royalties: 50% of total income' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('checkbox', { name: 'Include Distribution royalties', exact: true }).uncheck();
      await expect(page.getByRole('button', { name: 'Mixing & mastering gigs: 25% of total income' })).toHaveCount(1);
      await expect(page.getByText(/Grey represents 50%/)).toBeVisible();
      await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
      await expect(details()).toContainText('Choose an income source');
      await expect(page.locator('svg path[role=button]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Select all', exact: true }).click();
      // Click the visible 25% wedge through the actual pointer hit area.
      const chart = await page.getByRole('group', { name: 'Income composition chart' }).boundingBox();
      const turn = .625 * 2 * Math.PI - Math.PI / 2;
      await page.mouse.click(chart.x + chart.width / 2 + Math.cos(turn) * chart.width * 89 / 240, chart.y + chart.height / 2 + Math.sin(turn) * chart.height * 89 / 240);
      await expect(details().getByRole('heading', { name: labels[1], exact: true })).toBeVisible();
      await expect(details()).toContainText('Verified studio credit');
      await details().getByRole('button', { name: 'Load older earnings' }).click();
      await expect(details()).toContainText('Older earning credit');
      await expect(details().getByRole('button', { name: 'Load older earnings' })).toHaveCount(0);
      assert.equal(writes.length, 0, 'chart filtering and browsing never withdraw funds');
      await page.screenshot({ path: path.join(out, `${width}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px overflow`);
      await details().getByRole('button', { name: 'Review withdrawal', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('₹80.01');
      await page.getByRole('button', { name: 'Close withdrawal review' }).click();
      assert.equal(writes.length, 0, 'closing confirmation is read-only');
      result = 'rejected';
      await details().getByRole('button', { name: 'Review withdrawal', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm withdrawal', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Verify your payout destination.' })).toBeVisible();
      result = 'accepted';
      await details().getByRole('button', { name: 'Review withdrawal', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm withdrawal', exact: true }).dblclick();
      await expect(page.getByRole('status').filter({ hasText: 'Withdrawal accepted.' })).toBeVisible();
      assert.equal(writes.length, 2, 'one POST per confirmation, including double click');
      assert.deepEqual(writes[1].body, { sourceType: 'studio', amount: 4000.25 });
      await expect(details().getByRole('button', { name: 'Review withdrawal', exact: true })).toBeDisabled();
      await explore(labels[2]);
      await expect(details()).toContainText('withdrawal is already in progress');
      await explore(labels[4]);
      await expect(details().getByRole('button', { name: 'Review withdrawal', exact: true })).toBeEnabled();
      // Held referral commissions do not block independent cleared commissions.
      result = 'unknown';
      await details().getByRole('button', { name: 'Review withdrawal', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm withdrawal', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'outcome is unconfirmed' })).toBeVisible();
      await expect(details().getByRole('button', { name: 'Review withdrawal', exact: true })).toBeDisabled();
      fail = false; data = fixture(); data.reconciliationRequired = true;
      await refresh(); await explore(labels[1]);
      await expect(details()).toContainText('Finance reconciliation is required');
      await explore(labels[5]); await expect(details().getByRole('link', { name: 'View curator settlements' })).toBeVisible();
      historyFail = true; await explore(labels[2]);
      await expect(details().getByRole('alert')).toContainText('History is unavailable');
      historyFail = false; await details().getByRole('button', { name: 'Retry history' }).click();
      await expect(details()).toContainText('Verified producer_beat_sales credit');
      data = fixture(); data.sources.forEach(row => { row.earned = 0; row.available = 0; });
      await refresh(); await expect(page.locator('svg path[role=button]')).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Income composition chart' })).toContainText('NO EARNINGS YET');
      data.sources[1].earned = 100; data.sources[2].earned = -25;
      await refresh(); await expect(page.getByRole('button', { name: 'Mixing & mastering gigs: 100% of total income' })).toHaveCount(1);
      await expect(page.getByText(/Net negative source adjustments:/)).toBeVisible();
      await page.getByRole('button', { name: 'Mixing & mastering gigs: 100% of total income' }).focus(); await page.keyboard.press('Enter');
      await expect(details().getByRole('heading', { name: labels[1], exact: true })).toBeVisible();
      // A malformed refresh retains the last verified view.
      data.sources.push({ ...data.sources[0] }); await refresh();
      await expect(page.getByRole('alert').filter({ hasText: 'Could not refresh income.' })).toBeVisible();
      await expect(page.locator('svg path[role=button]')).toHaveCount(1);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`Income explorer ${width}px: chart, filters, history, holds, fees, confirmation, duplicate-click and uncertain-write checks passed`);
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
