import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
async function main() {
 const browser = await chromium.launch();
 mkdirSync('.cache/label-referral-browser', { recursive: true });
 try {
  const page = await browser.newPage({ reducedMotion: 'reduce' }); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const base = process.env.WORKSPACE_PREVIEW_URL || 'http://localhost:3015';
  await page.route('**/api/promotions/first-release', r => r.fulfill({ json: { authenticated: false, reason: 'authentication_required' } }));
  for (const width of [1440, 768, 390, 320]) {
   await page.setViewportSize({ width, height: 900 });
   await page.goto(`${base}/referrals`, { timeout: 120000 });
   const calculator = page.locator('.referral-calculator');
   await expect(calculator.locator('output')).toContainText('999.5');
   await calculator.getByLabel('Eligible paid purchases').fill('50');
   await expect(calculator.locator('output')).toContainText('4,997.5');
   await calculator.getByLabel('What would your friends choose?').selectOption('yearly');
   await expect(calculator.locator('output')).toContainText('3,846.5');
   await calculator.getByLabel('Eligible paid purchases').fill('0');
   await expect(calculator.locator('output')).toContainText('0');
   for (const theme of ['light', 'dark']) {
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
    expect(await calculator.evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
    await calculator.screenshot({ path: `.cache/label-referral-browser/calculator-${theme}-${width}.png` });
   }
   await page.evaluate(() => window.dispatchEvent(new Event('hymn-open-subscriptions')));
   const dialog = page.getByRole('dialog', { name: 'Subscriptions', exact: true }); await expect(dialog).toBeVisible();
   const label = dialog.locator('.subscription-comparison-card').last();
   await label.scrollIntoViewIfNeeded();
   await label.getByRole('button', { name: 'Add one extra artist', exact: true }).click();
   await expect(label.locator('.subscription-price strong')).toHaveText('₹2,249');
   await expect(label.getByRole('link')).toHaveAttribute('href', '/checkout?product=subscription-yearly_plus&extraArtists=1');
   await label.locator('input[type=number]').fill('8');
   await expect(label.locator('.subscription-price strong')).toHaveText('₹3,899');
   await expect(label).toContainText('5% off extras');
   await expect(label.getByRole('link')).toHaveAttribute('href', '/checkout?product=subscription-yearly_plus&extraArtists=8');
   expect(await label.evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
   await label.screenshot({ path: `.cache/label-referral-browser/label-${width}.png` });
   await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  }
  expect(errors).toEqual([]); console.log('Calculator estimates, zero purchases, typed inputs, slot quotes, discount, checkout links and overflow passed at 320/390/768/1440px in both themes.');
 } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
