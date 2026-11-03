import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
async function main() {
  const browser = await chromium.launch(); mkdirSync('.cache/referral-studio', { recursive: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' }); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const base = process.env.WORKSPACE_PREVIEW_URL || 'http://localhost:3015';
    let network = true, failed = false;
    await page.route('**/api/referrals/calculator', route => route.fulfill({ status: failed ? 503 : 200, json: failed ? { error: 'Unavailable' } : { policy: { enabled: true, mode: 'net', rateBps: 200, networkEnabled: network } } }));
    await page.route('**/api/promotions/first-release', r => r.fulfill({ json: { authenticated: false, reason: 'authentication_required' } }));
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 }); await page.goto(`${base}/referrals`, { timeout: 120000 });
      const calc = page.locator('.referral-calculator'); await expect(calc.locator('output')).toHaveText('₹600.00');
      await expect(calc.locator('.earn-branches')).toContainText('eligible HYMN net');
      await expect(calc.locator('.earn-branch-node')).toHaveCount(6);
      if (width === 1440) {
        expect(await calc.locator('.earn-workbench').evaluate(n => n.getBoundingClientRect().height)).toBeLessThan(660);
        expect(await calc.locator('.earn-result').evaluate(n => n.getBoundingClientRect().height)).toBeLessThan(600);
      }
      await calc.getByRole('spinbutton', { name: 'Paying referrals', exact: true }).fill('10'); await expect(calc.locator('output')).toHaveText('₹240.00');
      await calc.getByRole('button', { name: 'Increase Studio purchases per person', exact: true }).click(); await expect(calc.locator('output')).toHaveText('₹300.00');
      await calc.getByRole('button', { name: 'Increase Renewals purchases per person', exact: true }).click(); await expect(calc.locator('output')).toHaveText('₹500.00');
      await calc.getByRole('button', { name: 'Studio', exact: true }).click(); await calc.getByRole('spinbutton', { name: 'Estimated eligible amount per purchase', exact: true }).fill('500'); await expect(calc.locator('output')).toHaveText('₹540.00');
      if (width < 620) {
        const clearance = await page.evaluate(() => ({ header: document.querySelector('[data-site-header]')!.getBoundingClientRect().bottom, total: document.querySelector('.earn-mobile-summary')!.getBoundingClientRect().top }));
        expect(clearance.total).toBeGreaterThanOrEqual(clearance.header + 6);
        await page.screenshot({ path: `.cache/referral-studio/mobile-safe-header-${width}.png` });
      }
      for (const theme of ['light', 'dark']) {
        await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
        expect(await calc.evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
        await calc.screenshot({ path: `.cache/referral-studio/mix-${theme}-${width}.png` });
      }
      await calc.getByRole('button', { name: 'Your network', exact: true }).click();
      await calc.getByRole('spinbutton', { name: 'Buyers per referral', exact: true }).fill('2');
      await expect(calc.locator('.earn-tree-level')).toHaveCount(3); await expect(calc.locator('output')).not.toHaveText('₹540.00');
      await calc.getByText('See levels 4–7', { exact: true }).click(); await expect(calc.locator('.earn-deep-levels > div')).toHaveCount(4);
      await calc.screenshot({ path: `.cache/referral-studio/network-${width}.png` });
      await calc.getByRole('spinbutton', { name: 'Paying referrals', exact: true }).fill('0'); await expect(calc.locator('output')).toHaveText('₹0.00');
      await page.evaluate(() => window.dispatchEvent(new Event('hymn-open-subscriptions')));
      const dialog = page.getByRole('dialog', { name: 'Subscriptions', exact: true }); await expect(dialog).toBeVisible();
      const label = dialog.locator('.subscription-comparison-card').last(); await label.scrollIntoViewIfNeeded();
      await label.getByRole('button', { name: 'Add one extra artist', exact: true }).click(); await expect(label.locator('.subscription-price strong')).toHaveText('₹2,249');
      await label.locator('input[type=number]').fill('8'); await expect(label.locator('.subscription-price strong')).toHaveText('₹3,899');
      await expect(label.getByRole('link')).toHaveAttribute('href', '/checkout?product=subscription-yearly_plus&extraArtists=8');
      const slider = label.getByRole('slider', { name: 'Extra artist slots', exact: true }); await slider.focus(); await page.keyboard.press('Home'); await expect(label.locator('.subscription-price strong')).toHaveText('₹1,999'); await page.keyboard.press('ArrowRight'); await expect(label.locator('.subscription-price strong')).toHaveText('₹2,249');
      await label.locator('input[type=number]').fill('60'); await expect(slider).toHaveAttribute('max', '60'); await label.locator('input[type=number]').fill('20'); await expect(slider).toHaveAttribute('max', '60');
      expect(await label.evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true); await label.screenshot({ path: `.cache/referral-studio/label-${width}.png` }); await page.keyboard.press('Escape');
    }
    network = false; await page.reload(); const calc = page.locator('.referral-calculator'); await expect(calc.locator('output')).toHaveText('₹600.00'); await calc.getByRole('button', { name: 'Your network', exact: true }).click(); await calc.getByRole('spinbutton', { name: 'Buyers per referral', exact: true }).fill('5'); await expect(calc.locator('output')).toHaveText('₹600.00'); await expect(calc.locator('.earn-network-status')).toBeVisible();
    failed = true; await page.reload(); await expect(calc.getByText('Estimates are temporarily unavailable.')).toBeVisible(); await expect(calc.locator('output')).toHaveCount(0); failed = false; await calc.getByRole('button', { name: 'Try again', exact: true }).click(); await expect(calc.locator('output')).toHaveText('₹600.00');
    expect(errors).toEqual([]); console.log('PASS visual referral studio: five income sources, renewals, edited net assumptions, seven-level network, disabled policy, load failure/retry, zero input, slider keyboard controls, stable ranges, both themes and 320/390/768/1440px.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
