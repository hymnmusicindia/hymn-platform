const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync } = require('node:fs');
(async () => {
  const fixture = `
    import React from 'react';import {createRoot} from 'react-dom/client';import {usePathname} from 'next/navigation';import {WorkspacePageTransition} from './components/workspace-page-transition';
    function App(){const path=usePathname();return <>
      {!window.pending && <header className="hymn-studio-header">HYMN Header</header>}
      {window.pending ? <main><aside>Incomplete sidebar</aside><div className="portal-workspace">Intermediate layout</div><div data-workspace-loading>Opening your HYMN workspace</div></main>
        : <main className={path==='/'?'hymn-landing':'hymn-portal-root'}>
          <aside><span>Library</span><span>Distribution</span><span>Beatstore</span></aside>
          <a href={path==='/'?'/dashboard':'/'} onClick={e=>{e.preventDefault();window.pending=true;history.pushState(null,'',e.currentTarget.href);window.dispatchEvent(new Event('popstate'));setTimeout(()=>{window.pending=false;window.dispatchEvent(new Event('popstate'))},600)}}>Switch</a>
          <div className={path==='/'?'landing-canvas':'portal-workspace'}><div data-workspace-page={path==='/'?'home':'dashboard'}>{path==='/'?'Home content':'Dashboard content'}</div></div>
        </main>}
      <WorkspacePageTransition/></>};createRoot(document.getElementById('app')).render(<App/>);`;
  await build({ stdin: { contents: fixture, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: '.cache/workspace-delayed-swipe.js', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'mock-router', setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ resolveDir: process.cwd(), contents: `import {useSyncExternalStore} from 'react';export function usePathname(){const snapshot=useSyncExternalStore(fn=>{window.addEventListener('popstate',fn);return ()=>window.removeEventListener('popstate',fn)},()=>location.pathname+'|'+Boolean(window.pending));return snapshot.split('|')[0]}` }));
  } }] });
  const css = readFileSync('app/styles/workspace-page-transition.css', 'utf8');
  const server = http.createServer((req,res) => { res.setHeader('Content-Type', req.url === '/bundle.js' ? 'application/javascript' : 'text/html');res.end(req.url === '/bundle.js' ? readFileSync('.cache/workspace-delayed-swipe.js') : `<style>${css}</style><div id="app"></div><script src="/bundle.js"></script>`); });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => { window.swipes = []; new MutationObserver(() => { const direction = document.documentElement.dataset.workspaceSwipe; if (direction) window.swipes.push(direction); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-workspace-swipe'] }); });
    for (const direction of ['right','left']) {
      await page.getByRole('link',{name:'Switch',exact:true}).click();
      await expect(page.locator('[data-workspace-loading]')).toBeHidden();
      await expect(page.locator('[data-workspace-transition-snapshot]')).toBeVisible();
      await expect(page.locator('[data-workspace-transition-snapshot] header')).toHaveText('HYMN Header');
      await expect(page.locator('[data-workspace-transition-snapshot] aside')).toContainText('Distribution');
      assert.equal(await page.locator('[data-workspace-transition-snapshot] header').evaluate(n => getComputedStyle(n).animationName), 'none');
      assert.equal(await page.locator('[data-workspace-transition-snapshot] aside').evaluate(n => getComputedStyle(n).animationName), 'none');
      assert.equal(await page.locator('html').getAttribute('data-workspace-swipe'), null, 'Do not animate the loading fallback');
      await expect.poll(() => page.evaluate(d => window.swipes.includes(d), direction)).toBe(true);
      assert.equal(await page.locator('header').evaluate(n => getComputedStyle(n).animationName), 'none');
      assert.equal(await page.locator('aside').evaluate(n => getComputedStyle(n).animationName), 'none');
      assert.equal(await page.locator('.portal-workspace,.landing-canvas').evaluate(n => getComputedStyle(n).animationName), 'none');
      await expect(page.locator('[data-workspace-transition-snapshot]')).toHaveCount(0);
      await expect(page.locator('html')).not.toHaveAttribute('data-workspace-navigation');
      await expect(page.locator('html')).not.toHaveAttribute('data-workspace-swipe');
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByRole('link',{name:'Switch',exact:true}).click();
    await expect(page.locator('[data-workspace-loading]')).toBeHidden();
    await expect(page.locator('.portal-workspace')).toHaveText('Dashboard content');
    await expect(page.locator('[data-workspace-transition-snapshot]')).toHaveCount(0);
    assert.equal(await page.locator('html').getAttribute('data-workspace-swipe'),null);
    await page.evaluate(() => { const loader = document.createElement('div'); loader.dataset.workspaceLoading = ''; loader.textContent = 'Other page loading'; document.body.appendChild(loader); });
    await expect(page.getByText('Other page loading', { exact: true })).toBeVisible();
    console.log('Delayed Home/Dashboard transitions retain the source page, hide only scoped loaders, animate after content arrives, and respect reduced motion.');
  } finally { await browser.close();await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
