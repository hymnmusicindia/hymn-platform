import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { configureCustomerFixtureBrowser, customerFixturePublicOrigin, customerFixtureHeaders } from './customer-fixture-browser';

const origin = 'http://127.0.0.1:35510';
const directory = '.cache/conversion-experience';
const routes = ['/', '/welcome', '/login', '/auth', '/customer-login', '/producer-login', '/producer-onboarding', '/distribution', '/distribution/start', '/music-distribution', '/pricing', '/first-release', '/first-release-free', '/beat-store', '/beatstore', '/studio', '/studio/readiness', '/studio/apply', '/services', '/contact', '/consultation', '/partnership-program', '/referrals', '/about', '/mission', '/faq', '/join', '/team/join'];
async function main() {
  mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch();
  const results: Array<{route:string;status:number;url:string;errors:string[];overflow:number[]}> = process.env.ENTRY_AUDIT_ROUTES && existsSync(`${directory}/entries.json`) ? JSON.parse(readFileSync(`${directory}/entries.json`,'utf8')) : [];
  try {
    for (const route of process.env.ENTRY_AUDIT_ROUTES?.split(',') || routes) {
      for (let index=results.length-1;index>=0;index--) if (results[index].route === route) results.splice(index,1);
      const context = await browser.newContext({ viewport: { width:1440, height:1000 }, reducedMotion:'reduce', serviceWorkers:'block', extraHTTPHeaders:customerFixtureHeaders });
      await configureCustomerFixtureBrowser(context);
      await context.addInitScript('window.__name = fn => fn');
      const page = await context.newPage(); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      page.setDefaultNavigationTimeout(180000);
      let status = 0;
      try {
        // Inspect the absolute public redirect without navigating to a live host.
        let target = origin + route;
        if (route === '/join' && customerFixturePublicOrigin !== origin) {
          const response = await context.request.get(target, {maxRedirects:0});
          assert.ok([302,303,307,308].includes(response.status()));
          const destination = new URL(response.headers().location);
          assert.equal(destination.origin,customerFixturePublicOrigin);
          target = origin + destination.pathname + destination.search;
        }
        for (let attempt = 0; attempt < 3; attempt++) {
          try { status = (await page.goto(target, {waitUntil:'domcontentloaded'}))?.status() || 0; break; }
          catch (error) { if (attempt === 2 || !/ERR_CONNECTION|ERR_EMPTY|ERR_ABORTED/.test(String(error))) throw error; await page.waitForTimeout(3000); }
        }
        const aliases: Record<string,string> = {'/auth':'/login','/customer-login':'/login','/producer-login':'/producer-onboarding','/distribution':'/distribution/start','/first-release-free':'/first-release','/beatstore':'/beat-store','/join':'/login','/studio/apply':'/login'};
        if (aliases[route]) await page.waitForURL(url => url.pathname === aliases[route], {waitUntil:'domcontentloaded',timeout:180000});
        await page.waitForLoadState('networkidle', {timeout:2000}).catch(() => {});
        const overflow: number[] = [];
        for (const width of [1440,390,320]) { await page.setViewportSize({width,height:1000}); await page.waitForTimeout(500); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) overflow.push(width); }
        results.push({route,status,url:new URL(page.url()).pathname,errors,overflow});
        if (['/','/welcome','/pricing','/producer-onboarding','/first-release'].includes(route)) await page.screenshot({path:`${directory}/entry-${route.replace(/[^a-z0-9]/g,'') || 'home'}-320.png`,fullPage:true,timeout:30000}).catch(() => {});
      } catch (error) { results.push({route,status,url:page.url(),errors:[...errors,String(error)],overflow:[]}); }
      finally { await context.close(); writeFileSync(`${directory}/entries.json`,JSON.stringify(results,null,2)); }
      console.log(JSON.stringify(results.at(-1)));
    }
    assert.equal(results.filter(result => result.status >= 400 || !result.status || result.errors.length || result.overflow.length).length,0,'Review entry-point failures in entries.json');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
