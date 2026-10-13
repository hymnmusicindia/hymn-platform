const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const http = require('node:http');
(async () => {
  await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {usePathname} from 'next/navigation';import {WorkspacePageTransition} from './components/workspace-page-transition';import {WorkspaceDestinations} from './components/workspace-destinations';function App(){const path=usePathname();return <><aside><WorkspaceDestinations homeActive={path==='/'} overviewActive={path==='/dashboard'} overviewHref='/dashboard'/></aside><main className={path==='/'?'landing-canvas':'portal-workspace'}>{path==='/'?'Home content':'Dashboard content'}</main><WorkspacePageTransition/></>;}createRoot(document.getElementById('app')).render(<App/>);`, loader: 'tsx', resolveDir: process.cwd() }, outfile: '.cache/workspace-swipe-test.js', bundle: true, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'router-fixture', setup(b) {
    b.onResolve({ filter: /^next\/(link|navigation)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'jsx', resolveDir: process.cwd(), contents: a.path.endsWith('navigation') ? `import {useSyncExternalStore} from 'react';export function usePathname(){return useSyncExternalStore(fn=>{window.addEventListener('popstate',fn);return ()=>window.removeEventListener('popstate',fn)},()=>location.pathname)}` : `import React from 'react';export default function Link({href,onClick,children,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'))}}>{children}</a>}` }));
  } }] });
  const css = readFileSync('app/styles/workspace-page-transition.css', 'utf8');
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/bundle.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/bundle.js' ? readFileSync('.cache/workspace-swipe-test.js') : `<style>${css}</style><div id="app"></div><script src="/bundle.js"></script>`); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.workspaceSwipe), undefined);
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-workspace-swipe', 'right');
    assert.equal(await page.locator('main').evaluate(n => getComputedStyle(n).animationName), 'workspace-swipe-right');
    assert.equal(await page.locator('aside').evaluate(n => getComputedStyle(n).animationName), 'none');
    await expect(page.locator('html')).not.toHaveAttribute('data-workspace-swipe');
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-workspace-swipe', 'left');
    assert.equal(await page.locator('main').evaluate(n => getComputedStyle(n).animationName), 'workspace-swipe-left');
    await expect(page.locator('html')).not.toHaveAttribute('data-workspace-swipe');
    await page.goBack();
    await expect(page.locator('html')).toHaveAttribute('data-workspace-swipe', 'right');
    await expect(page.locator('html')).not.toHaveAttribute('data-workspace-swipe');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.locator('main')).toHaveText('Home content');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.workspaceSwipe), undefined);
    assert.equal(await page.locator('main').evaluate(n => n.getAnimations().length), 0);
    console.log('Dashboard label, right/left slides, stationary sidebar, history navigation, cleanup and reduced motion passed.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
