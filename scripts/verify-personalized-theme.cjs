const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const postcss = require('postcss');const tailwind = require('tailwindcss');
const { chromium, expect } = require('@playwright/test');
const { textContrast } = require('./lib/text-contrast.cjs');

async function main() {
  const out = path.resolve('.cache/personalized-theme');await fs.mkdir(out, { recursive: true });
  await build({ stdin: { contents: `
    import React from 'react';import{createRoot}from'react-dom/client';
    import{getReleasePortalBadgeStyle}from'./lib/release-portal';import{HomeGoalWorkspace}from'./components/home-goal-workspace';import{MusicLifecycleBanner}from'./components/music-lifecycle-banner';
    import{BeatPreviewPlayerProvider,useBeatPreviewPlayer}from'./components/beat-preview-player';import{ReleaseActionsMenu}from'./components/release-actions-menu';import{InternalWorkspaceSwitcher}from'./components/internal-workspace-switcher';import{FinalReleaseConfirmation}from'./components/final-release-confirmation';
    const beat={id:1,title:'Theme test beat',producer:{name:'Test producer',slug:'test'},bpm:85,keySignature:'G Minor',price:120,generalPrice:120,stemPrice:1299,exclusivePrice:0,availableLicenses:['mp3','wav'],sampleDeclaration:'original',sampleDisclosure:null};
    function Launch(){const player=useBeatPreviewPlayer();const[confirm,setConfirm]=React.useState(false);return <><button onClick={()=>player.openLicensing(beat)}>Open test licence</button><button onClick={()=>player.playBeat(beat)}>Show test player</button><button onClick={()=>setConfirm(true)}>Open test confirmation</button><FinalReleaseConfirmation open={confirm} onClose={()=>setConfirm(false)} onAgree={()=>{window.agreed=true;setConfirm(false)}}/><InternalWorkspaceSwitcher current="team" name="Team workspace"/></>}
    createRoot(document.getElementById('root')).render(<main className="hymn-landing"><BeatPreviewPlayerProvider><Launch/><div aria-label="Release status examples">{['draft','scheduled','rejected','changes_requested','review','partially_live','released'].map(stage=><span key={stage} style={getReleasePortalBadgeStyle(stage)}>{stage}</span>)}</div><div style={{position:'relative',height:70}}><ReleaseActionsMenu title="Test release" canDelete={true} busy={false} onDuplicate={()=>{}} onDelete={()=>{}} onBlockedDelete={()=>{}}/></div><HomeGoalWorkspace userId={1} name="Test Artist" banners={{journey:<MusicLifecycleBanner/>,studio:<section className="home-path-studio home-studio-editorial"><div><p className="landing-eyebrow">Studio</p><h2>Your sound. Release-ready.</h2><p>Give your next record its finishing touch.</p><a href="/studio">Explore studio services</a></div></section>}}/></BeatPreviewPlayerProvider></main>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(out, 'ui.js'), external: ['/assets/*'], jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next-fixture', setup(b) {
    b.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /^next\/link$/, namespace: 'fixture' }, () => ({ contents: 'import React from"react";export default function Link({prefetch,children,...p}){return <a {...p}>{children}</a>}', loader: 'tsx', resolveDir: process.cwd() }));
    b.onLoad({ filter: /^next\/image$/, namespace: 'fixture' }, () => ({ contents: 'import React from"react";export default function Image({fill,priority,...p}){return <img {...p}/>}', loader: 'tsx', resolveDir: process.cwd() }));
    b.onLoad({ filter: /^next\/navigation$/, namespace: 'fixture' }, () => ({ contents: 'export const usePathname=()=>"/";export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){},refresh(){}});' }));
  } }] });
  const layout = await fs.readFile('app/layout.tsx', 'utf8');
  const css = (await Promise.all([...layout.matchAll(/import ["'](\.[^"']+\.css)["']/g)].map(m => fs.readFile(path.resolve('app', m[1]), 'utf8')))).join('\n');
  const compiledCss = await postcss([tailwind(path.resolve('tailwind.config.ts'))]).process(css, { from: path.resolve('app/globals.css') });
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await page.route('https://hymn.local/', r => r.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
      await page.route('**/api/workspaces',r=>r.fulfill({json:{items:[]}}));
      await page.route('**/api/onboarding-agent', r => r.fulfill({ json: { state: { goalId: 'studio', version: 1, plan: { steps: [{ id: 'choose-service', title: 'Choose the service you need', description: 'Review the studio services currently available.', status: 'pending', action_target: '/studio', action_label: 'Explore services' }] } }, goalOptions: [{ id: 'studio', label: 'Studio' }], goalLimit: 1 } }));
      await page.route('**/api/user/onboarding-preferences', r => r.fulfill({ json: { preferences: { onboardingUserType: 'artist' } } }));
      await page.goto('https://hymn.local/');await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      await page.addStyleTag({ content: compiledCss.css });await page.addStyleTag({ path: path.join(out, 'ui.css') });await page.addScriptTag({ path: path.join(out, 'ui.js') });
      await page.getByRole('button', { name: 'Open goal guide' }).click();
      for (const selector of ['.home-goal-feature h2','.home-goal-feature>p','.home-path-popup-heading','.home-goal-primary','.home-path-studio h2','.home-path-studio p','.home-personalized-feed a']) {
        for (const element of await page.locator(selector).all()) if (await element.isVisible()) assert.ok((await element.evaluate(textContrast)).ratio >= 4.5, `${theme} ${width} ${selector}`);
      }
      for(const badge of await page.locator('[aria-label="Release status examples"] span').all())assert.ok((await badge.evaluate(textContrast)).ratio>=4.5,theme+' status '+await badge.textContent());
      const surface = await page.locator('.home-goal-workspace').evaluate(e => ({ background: getComputedStyle(e).backgroundColor, text: getComputedStyle(e).color }));assert.notEqual(surface.background, surface.text);
      await page.screenshot({ path: path.join(out, `${theme}-${width}-guide.png`), fullPage: true });
      await page.getByRole('button', { name: 'Close goal guide' }).click();
      const dots = page.getByRole('button', { name: /Actions for Test release/ });
      await expect(dots).toBeVisible();assert.ok((await dots.evaluate(textContrast)).ratio >= 4.5);
      await dots.click();await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Open test licence' }).click();
      await expect(page.getByRole('dialog', { name: 'Licence Theme test beat' })).toBeVisible();
      const backdrop = await page.locator('.beat-licence-backdrop').evaluate(e => ({ background: getComputedStyle(e).backgroundColor, blur: getComputedStyle(e).backdropFilter }));assert.match(backdrop.blur, /blur\(12px\)/);
      const bounds=await page.locator('.beat-licence-backdrop').boundingBox();assert.ok(bounds&&bounds.width===width&&bounds.height===900);
      assert.ok(Number(backdrop.background.match(/[\d.]+/g).at(-1)) <= .4);
      assert.equal(await page.locator('.beat-licence-layer').evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)');
      for (const element of await page.locator('.beat-licence-panel h2,.beat-licence-panel h3,.beat-licence-panel p,.beat-licence-panel button').all()) if (await element.isVisible()) assert.ok((await element.evaluate(textContrast)).ratio >= 4.5, `${theme} licence ${await element.textContent()} ${JSON.stringify(await element.evaluate(textContrast))}`);
      await page.getByRole('button', { name: /^WAV,/ }).click();await expect(page.getByRole('heading', { name: 'WAV Licence', exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(out, `${theme}-${width}-licence.png`), fullPage: true });
      await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      await page.getByRole('button',{name:'Open test confirmation'}).click();await expect(page.getByRole('dialog')).toBeVisible();
      for(const element of await page.getByRole('dialog').locator('h2,p,button').all())if(await element.isVisible())assert.ok((await element.evaluate(textContrast)).ratio>=4.5,theme+' confirmation '+await element.textContent());
      await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
      assert.ok((await page.getByRole('combobox',{name:'Switch internal workspace'}).evaluate(textContrast)).ratio>=4.5);
      await page.getByRole('button',{name:'Show test player'}).click();await expect(page.locator('.beat-player-surface')).toBeVisible();
      for(const element of await page.locator('.beat-player-surface button,.beat-player-surface span').all())if(await element.isVisible()&&await element.getAttribute('disabled')===null)assert.ok((await element.evaluate(textContrast)).ratio>=4.5,theme+' player '+await element.getAttribute('aria-label')+' '+await element.getAttribute('class')+' '+JSON.stringify(await element.evaluate(textContrast)));
      await page.screenshot({path:path.join(out,theme+'-'+width+'-player.png'),fullPage:true});
      console.log(`PASS ${theme} ${width}px signed-in home, portalled guide, release controls and translucent licence picker`);await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error);process.exitCode = 1; });
