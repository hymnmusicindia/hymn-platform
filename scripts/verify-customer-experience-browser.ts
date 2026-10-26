import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';
import jwt from 'jsonwebtoken';

const origin = 'http://127.0.0.1:35510';
const root = '.cache/customer-experience';
const output = process.env.CUSTOMER_AUDIT_OUTPUT || 'audit';
assert.match(output, /^[a-z0-9-]+$/);
const selectedRoutes = process.env.CUSTOMER_AUDIT_ROUTES?.split(',');
const fixture = JSON.parse(readFileSync(`${root}/fixture.json`, 'utf8'));
const live = fixture.releases.find((r: { status: string }) => r.status === 'LIVE').id;
const draft = fixture.releases.find((r: { status: string }) => r.status === 'DRAFT').id;
const routes = [
  '/', '/dashboard', '/dashboard/releases', `/dashboard/releases/${live}`, `/dashboard/releases/${draft}`, `/dashboard/releases/${live}/qc-report`,
  '/audio-library', '/distribution/start', `/distribution/start?edit=${draft}`, '/analytics', '/dashboard/playlists', '/first-release',
  ...['promotions', 'content-id', 'collaborators', 'purchases', 'messages', 'support', 'settings', 'subscription', 'referral', 'account'].map(tab => `/dashboard?tab=${tab}`),
  '/payout', '/royalty-payouts', '/beat-store', `/beat-store/producers/${fixture.producerSlug}`, `/p/${fixture.producerSlug}`,
  '/checkout?product=beatstore', '/checkout?product=subscription-yearly', `/licenses/${fixture.purchaseId}`, '/studio', '/studio/readiness', '/studio/genres/hip-hop', `/studio/engineers/${fixture.engineerSlug}`, `/studio/start?listing=${fixture.listingPublicId}`, `/studio/orders/${fixture.studioOrderPublicId}`, '/dashboard/studio', '/studio/apply', '/managed-services', '/contributors/claim', '/producer-onboarding',
  '/services', '/distribution', '/first-release-free', '/contact', '/faq', '/about', '/mission', '/partnership-program', '/policies', '/privacy-policy', '/terms-of-service',
];
type Finding = { route: string; width: number; url: string; status: number; heading: string[]; errors: string[]; apiErrors: string[]; overflow: unknown[]; sharp: unknown[]; unnamed: unknown[]; brokenImages: unknown[] };
async function inspect(page: Page, route: string, status: number, errors: string[], apiErrors: string[]): Promise<Finding> {
  return page.evaluate(({ route, status, errors, apiErrors }) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0 || s.visibility === 'hidden' || s.display === 'none' || el.closest('[inert],[aria-hidden=true],[hidden]')) return false;
      for (let parent: Element | null = el; parent; parent = parent.parentElement) {
        if (getComputedStyle(parent).opacity === '0') return false;
        if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector('summary')?.contains(el)) return false;
      }
      return true;
    };
    const name = (el: Element) => (el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLElement).innerText || '').trim().slice(0, 100);
    const describe = (el: Element) => ({ tag: el.tagName, class: el.className?.toString().slice(0, 150), text: name(el) });
    const actionable = [...document.querySelectorAll('button,a[class],input[type=submit],summary')].filter(visible);
    return {
      route, width: innerWidth, url: location.pathname + location.search, status,
      heading: [...document.querySelectorAll('h1,h2')].filter(visible).slice(0, 6).map(e => (e.textContent || '').trim()), errors, apiErrors,
      overflow: document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [{ tag: 'DOCUMENT', width: document.documentElement.scrollWidth }, ...[...document.querySelectorAll('main *, .dashboard-main *')].filter(e => visible(e) && e.getBoundingClientRect().right > innerWidth + 2 && !e.closest('[role=dialog],dialog,[aria-hidden=true]')).slice(0, 12).map(describe)],
      sharp: actionable.filter(el => { const s = getComputedStyle(el); const colored = !['rgba(0, 0, 0, 0)', 'transparent'].includes(s.backgroundColor) || s.backgroundImage !== 'none' || parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) > 0; return colored && parseFloat(s.borderTopLeftRadius) < 3 && !el.closest('[role=tablist]') && !el.matches('[role=tab]'); }).map(el => ({ ...describe(el), radius: getComputedStyle(el).borderTopLeftRadius, background: getComputedStyle(el).backgroundColor })).slice(0, 20),
      unnamed: [...document.querySelectorAll('button')].filter(e => visible(e) && !name(e) && !e.getAttribute('aria-labelledby')).map(describe).slice(0, 10),
      brokenImages: [...document.images].filter(img => visible(img) && img.complete && img.naturalWidth === 0).map(img => ({ src: img.getAttribute('src'), alt: img.alt })).slice(0, 8),
    };
  }, { route, status, errors, apiErrors });
}
async function main() {
  mkdirSync(root, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results: Finding[] = process.env.CUSTOMER_AUDIT_RESUME==='true'&&existsSync(`${root}/${output}.json`)?JSON.parse(readFileSync(`${root}/${output}.json`,'utf8')):[];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  // tsx preserves helper names in functions serialised by Playwright.
  await context.addInitScript('window.__name = fn => fn');
  await context.addCookies([{ name: 'hymn_session', value: jwt.sign({ sub: fixture.customer.id, name: fixture.customer.name, email: fixture.customer.email, role: 'customer' }, 'customer-experience-local-fixture-secret', { expiresIn: '2h' }), url: origin }]);
  await context.addInitScript(() => { try{localStorage.setItem('hymn-theme', 'dark');}catch{} });
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(180000);
  let errors: string[] = [], apiErrors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 500 || r.status() >= 400 && r.url().includes('/api/')) apiErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  async function navigate(route: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await page.goto(origin + route, { waitUntil: 'domcontentloaded' }); }
      catch (error) {
        if (attempt === 2 || !/ERR_CONNECTION_REFUSED|ERR_ABORTED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE/.test(String(error))) throw error;
        // Next development can restart between cold route compilations. Retry
        // the read-only view once the local server is accepting requests again.
        for (let wait = 0; wait < 120; wait++) {
          try { if ((await fetch(`${origin}/api/workspaces`, { signal: AbortSignal.timeout(2000) })).status === 401) break; } catch {}
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    throw Error('Customer audit server did not recover.');
  }
  try {
    for (const route of routes) {
      if(process.env.CUSTOMER_AUDIT_RESUME==='true'&&results.some(row=>row.route===route&&row.width===390&&!row.errors.length))continue;
      if (selectedRoutes && !selectedRoutes.includes(route)) continue;
      if (process.env.CUSTOMER_AUDIT_FILTER && !route.includes(process.env.CUSTOMER_AUDIT_FILTER)) continue;
      for(let index=results.length-1;index>=0;index--)if(results[index].route===route)results.splice(index,1);
      errors = []; apiErrors = [];
      await page.setViewportSize({ width: 1440, height: 1000 });
      let status = 0;
      try {
        const response = await navigate(route); status = response?.status() || 0;
        if (route === '/distribution') await page.waitForURL('**/distribution/start', { timeout: 120000,waitUntil:'domcontentloaded' });
        if (route === '/royalty-payouts') await page.waitForURL('**/payout', { timeout: 120000,waitUntil:'domcontentloaded' });
        if (route === '/first-release-free') await page.waitForURL('**/first-release', { timeout: 120000,waitUntil:'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: Number(process.env.CUSTOMER_AUDIT_IDLE_MS||20000) }).catch(() => undefined);
        const reviewLater = page.getByRole('button', { name: 'Review later', exact: true });
        if (await reviewLater.isVisible()) await reviewLater.click();
        if (route.startsWith('/distribution/start') && await page.locator('.release-journey-intro').count()) await page.locator('.release-journey-intro').waitFor({ state: 'hidden', timeout: 15000 });
        if(route === '/dashboard?tab=support')await page.locator('.support-history[aria-busy=true]').waitFor({state:'hidden',timeout:90000});
        if (route === '/dashboard?tab=referral') await page.locator('.referral-loading').waitFor({ state: 'hidden', timeout: 120000 });
        await page.waitForTimeout(300);
        const desktop = await inspect(page, route, status, [...errors], [...apiErrors]); results.push(desktop);
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(120);
        results.push(await inspect(page, route, status, [...errors], [...apiErrors]));
        if (['/dashboard', '/dashboard/releases', '/dashboard?tab=support', '/dashboard?tab=promotions', '/payout', '/beat-store', '/studio', '/distribution/start', '/dashboard?tab=settings'].includes(route)) {
          const slug = route.replace(/[^a-z0-9]+/gi, '-'); await page.screenshot({ path: `${root}/${slug}-mobile.png`, fullPage: true, caret: 'initial' });
          await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: `${root}/${slug}-desktop.png`, fullPage: true, caret: 'initial' });
        }
        console.log(JSON.stringify({ route, status, headings: desktop.heading.slice(0, 2), errors: errors.length, apiErrors, sharp: desktop.sharp.length, mobileOverflow: results.at(-1)?.overflow.length }));
      } catch (e) { results.push({ route, width: 1440, url: page.url(), status, heading: [], errors: [e instanceof Error ? e.message : String(e)], apiErrors, overflow: [], sharp: [], unnamed: [], brokenImages: [] }); console.log(`FAIL ${route}`); }
      writeFileSync(`${root}/${output}.json`, JSON.stringify(results, null, 2));
    }
    if (!process.env.CUSTOMER_AUDIT_FILTER && !selectedRoutes) {
      // Customer identities must still fail every privileged pathway after presentation fixes.
      for (const route of ['/api/admin/producer-applications', '/api/team/creator-applications', `/api/releases/${fixture.privateReleaseId}/corrections`]) {
        const response = await context.request.get(origin + route, { timeout: 120000 }); assert.ok([401, 403, 404].includes(response.status()), `${route} must remain protected, received ${response.status()}`);
      }
    }
    const summary = { pages: new Set(results.map(r => r.route)).size, views: results.length, failed: results.filter(r => r.status >= 400 || r.errors.length).map(r => ({ route: r.route, errors: r.errors })), apiErrors: results.filter(r => r.apiErrors.length), brokenImages: results.filter(r => r.brokenImages.length), unnamed: results.filter(r => r.unnamed.length), overflow: results.filter(r => r.overflow.length).map(r => ({ route: r.route, width: r.width })), sharp: results.filter(r => r.sharp.length).map(r => ({ route: r.route, width: r.width, count: r.sharp.length })) };
    writeFileSync(`${root}/${output}-summary.json`, JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
    if (!process.argv.includes('--report')) assert.equal(summary.failed.length + summary.apiErrors.length + summary.brokenImages.length + summary.unnamed.length + summary.overflow.length, 0, 'Resolve customer render, API, image, accessible-name and viewport errors.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
