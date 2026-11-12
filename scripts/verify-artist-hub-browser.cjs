const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

(async () => {
  const out = path.resolve('.cache/artist-hub-browser'); await fs.mkdir(out, { recursive: true });
  await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ArtistHub}from'./components/artist-hub';import{KycEvidence}from'./components/kyc-evidence';createRoot(document.getElementById('root')).render(window.fixtureKyc?<KycEvidence/>:<ArtistHub/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next', setup(b) { b.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: 'mock' })); b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path.endsWith('navigation') ? 'export const useSearchParams=()=>new URLSearchParams(window.location.search);' : args.path.endsWith('link') ? `import React from'react';export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}` : `import React from'react';export default function Image(props){return <img {...props}/>}`, loader: 'tsx', resolveDir: process.cwd() })); } }] });
  const globalFiles = [...(await fs.readFile('app/layout.tsx', 'utf8')).matchAll(/import ["'](\.[^"']+\.css)["']/g)].map(match => path.resolve('app', match[1]));
  const globalCss = (await Promise.all(globalFiles.map(file => fs.readFile(file, 'utf8')))).join('\n');
  const fixture = { handle: '@fixture#1234', payout: { status: 'verified' }, cards: [{ id: 10, name: 'Aurora Long Artist Name', spotifyUrl: 'https://open.spotify.com/artist/52BkE1owdr1Oz5duroCyHL', appleUrl: null, instagramUrl: null, youtubeUrl: null, hubIdentityId: null, managed: false, confirmations: 0 }], requests: [{ id: 20, releaseId: 30, identityId: 40, title: 'Midnight Stories', uploader: '@collaborator#4321', revision: 'a'.repeat(64), status: 'pending', intervention: 'none' }], outgoing: [], cases: [], releasesForSplits: [{ id: 30, title: 'Midnight Stories', hasAgreement: false, recipients: [{ userId: 1, name: 'Artist One', handle: '@one#1111' }, { userId: 2, name: 'Artist Two', handle: '@two#2222' }, { userId: 3, name: 'Artist Three', handle: '@three#3333' }] }] };
  const browser = await chromium.launch();
  try {
    for (const theme of ['light', 'dark']) for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } }); const errors = [], actions = []; let failure = false;
      page.on('pageerror', cause => errors.push(cause.message));
      await page.route('http://artist-hub.fixture/assets/hymn-logo-320.webp', async route => route.fulfill({ contentType: 'image/webp', body: await fs.readFile('public/assets/hymn-logo-320.webp') }));
      await page.route('**/api/artist-hub', async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: fixture });
        const body = route.request().postDataJSON(); actions.push(body);
        if (failure) { failure = false; return route.fulfill({ status: 409, json: { error: 'This release changed. Refresh before deciding.' } }); }
        return route.fulfill({ json: body.action === 'lookup' ? { matches: [{ id: 40, name: 'Connected Artist', spotifyUrl: fixture.cards[0].spotifyUrl, appleUrl: null }] } : {} });
      });
      await page.setContent(`<html data-theme="${theme}"><head><base href="http://artist-hub.fixture/"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px"><div id="root"></div></body></html>`);
      await page.addStyleTag({ content: globalCss }); await page.addStyleTag({ path: path.join(out, 'ui.css') }); await page.addScriptTag({ path: path.join(out, 'ui.js') });
      await expect(page.getByRole('heading', { name: 'Artist profiles', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      let dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Connect artist', exact: true })).toBeDisabled();
      await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: 'Connect artist', exact: true }).click();
      await expect(dialog).toHaveCount(0); assert.equal(actions.at(-1).action, 'enroll');
      await page.getByRole('button', { name: 'Collaborations · 1' }).click(); await page.getByRole('button', { name: 'Review & approve' }).click();
      dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: 'Approve participation', exact: true })).toBeDisabled();
      await dialog.getByRole('checkbox').check(); failure = true; await dialog.getByRole('button', { name: 'Approve participation', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('release changed'); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
      await page.getByRole('button', { name: 'Decline', exact: true }).click(); dialog = page.getByRole('dialog'); await dialog.getByLabel('Reason', { exact: true }).selectOption('The wrong artist profile was selected'); await dialog.getByRole('button', { name: 'Decline participation', exact: true }).click(); assert.equal(actions.at(-1).decision, 'rejected');
      await page.getByRole('button', { name: 'Royalties & verification' }).click(); await page.getByRole('button', { name: 'Propose shares' }).click(); dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Total: 100%', { exact: true })).toBeVisible(); await dialog.getByRole('checkbox').check(); await dialog.getByRole('button', { name: 'Send proposal', exact: true }).click();
      assert.equal(actions.at(-1).shares.reduce((sum, row) => sum + row.basisPoints, 0), 10000);
      await page.getByRole('button', { name: 'Artist profiles', exact: true }).click(); await page.getByLabel('Find a HYMN artist').fill('@connected#1234'); await page.getByRole('button', { name: 'Find artist', exact: true }).click(); await expect(page.getByText('Connected Artist', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'This is my artist', exact: true }).click(); dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: 'Open case', exact: true })).toBeDisabled();
      await dialog.getByLabel('Details', { exact: true }).fill('I need to move my existing artist profile.'); await page.screenshot({ path: path.join(out, `${theme}-${width}-case.png`), fullPage: true });
      await page.keyboard.press('Tab'); const focusedInside = await dialog.evaluate(el => el.contains(document.activeElement)); assert(focusedInside, 'Dialog contains keyboard focus');
      await page.keyboard.press('Escape'); await page.screenshot({ path: path.join(out, `${theme}-${width}-profiles.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `No horizontal overflow at ${width}`); assert.deepEqual(errors, []);
      await page.close();
    }
    const kycPage = await browser.newPage({viewport:{width:390,height:900}}); let assetId=100; const submissions=[];
    await kycPage.route('**/api/payout/verification', route => { if(route.request().method()==='GET') return route.fulfill({json:{status:'not_started',documentType:'government_id',identityAssetId:null,beneficiaryAssetId:null}}); const body=route.request().postDataJSON();submissions.push(body); return route.fulfill({json:{status:body.submit?'submitted':'draft'}}); });
    await kycPage.route('**/api/assets', route => route.fulfill({json:{asset:{id:assetId++}}}));
    await kycPage.setContent('<html><head><base href="http://artist-hub.fixture/"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px"><div id="root"></div></body></html>');
    await kycPage.evaluate(()=>window.fixtureKyc=true); await kycPage.addStyleTag({content:globalCss});await kycPage.addStyleTag({path:path.join(out,'ui.css')});await kycPage.addScriptTag({path:path.join(out,'ui.js')});
    await expect(kycPage.getByRole('heading',{name:'Supporting documents'})).toBeVisible();await expect(kycPage.getByRole('button',{name:'Submit evidence'})).toBeDisabled();
    await kycPage.getByLabel('Upload Identity document',{exact:true}).setInputFiles({name:'identity.png',mimeType:'image/png',buffer:Buffer.from('browser-fixture')});
    await expect(kycPage.getByRole('link',{name:'View private document'})).toHaveCount(1);
    await expect(kycPage.getByLabel('Upload Bank / UPI beneficiary evidence',{exact:true})).toBeEnabled();
    await kycPage.getByLabel('Upload Bank / UPI beneficiary evidence',{exact:true}).setInputFiles({name:'bank.png',mimeType:'image/png',buffer:Buffer.from('browser-fixture-two')});
    await expect(kycPage.getByRole('link',{name:'View private document'})).toHaveCount(2);await kycPage.getByRole('checkbox').check();await kycPage.getByRole('button',{name:'Submit evidence'}).click();
    await expect(kycPage.getByText('Evidence received. HYMN will notify you about the review.')).toBeVisible();assert.equal(submissions.at(-1).consent,true);assert.equal(submissions.at(-1).identityAssetId,100);assert.equal(submissions.at(-1).beneficiaryAssetId,101);
    await kycPage.screenshot({path:path.join(out,'kyc-390.png'),fullPage:true});await kycPage.close();
    console.log('PASS Artist Hub light/dark desktop/390px/320px, enrollment, consent, stale decisions, rejection, equal shares, lookup, case dialog, focus and overflow.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
