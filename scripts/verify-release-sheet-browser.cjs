const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function wav() {
  const data = Buffer.alloc(16044); data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
async function main() {
  const out = path.resolve('.cache/release-sheet-browser'); await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {PortalLayout} from './components/portal-layout';import './app/styles/landing.css';import './app/styles/portal.css';import './app/styles/workspace-enterprise.css';import './app/styles/dashboard-design-system.css';import './app/styles/sidebar-consistency.css';import './app/styles/workspace-navigation.css';import './app/styles/workspace-pages.css';import './app/styles/distribution-consistency.css';import './app/styles/release-navigation-header.css';import {ReleaseForm} from './components/release-form';createRoot(document.getElementById('root')).render(<div className=\"hymn-portal-root\"><PortalLayout>{window.fixtureShellOnly ? <article data-existing-dashboard>Existing page</article> : <main className=\"distribution-start-page\"><section className=\"shell\"><div><ReleaseForm initialStage={window.fixtureEntry ? 1 : 3} amendmentMode={window.fixtureAmendment} selectedPlan='one_time' prefillSuggestions={window.fixturePrefills || []} initialRelease={window.fixtureRelease}/></div></section></main>}</PortalLayout></div>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function usePathname(){return window.fixturePath || "/distribution/start"};export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
  const css = await require('postcss')([require('tailwindcss')({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
  await fs.writeFile(path.join(out,'global.css'),css.css);



  const browser=await chromium.launch();
  const fixtureRelease={id:25,userId:51,status:'draft',paymentStatus:'pending',releaseType:'single',releaseTitle:'Dreamy',trackName:'Dreamy',artistName:'Fixture Artist',labelName:'HYMN Music',contentType:'Original/Exclusive Licensed',primaryGenre:'Hip-Hop',secondaryGenre:'Alternative Hip-Hop',language:'Hindi',releaseDate:'2026-12-20',createdAt:'2026-11-03',copyrightOwner:'Fixture Artist',publishingRights:'Fixture Artist',artworkUrl:'/fixture-cover.png',platforms:['Spotify'],ownershipConfirmed:true,noUnauthorizedSamples:true,collaboratorsCredited:true,platformCompliant:true,hymnNotLiable:true,agreedToTerms:true,falseMetadataAcknowledged:true,tracks:[{id:400,trackNumber:1,trackTitle:'Dreamy',language:'Hindi',audioUrl:'/api/assets/185/download',artistProfileIds:[10],primaryArtist:'Fixture Artist',songwriters:'Fixture Writer',composers:'Fixture Writer',producers:'Fixture Producer',duration:'02:37'}]};
  const artist={id:10,name:'Fixture Artist',artistName:'Fixture Artist',spotifyUrl:'https://open.spotify.com/artist/7nQW2TLxs3otw6ZgYP6cjx'};
  try {for(const theme of ['light','dark'])for(const width of process.env.HYMN_SHEET_BROWSER_QUICK ? [390] : [1440,768,390,320]) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[],writes=[];let entry=false;
    page.on('pageerror',e=>errors.push(e.message));await page.route('https://hymn.fixture/**',async route=>{const req=route.request(),url=new URL(req.url());
      if(req.method()!=='GET')writes.push({url:url.pathname,body:req.postDataJSON()});
      if(req.resourceType()==='document'){const release=entry?{...fixtureRelease,artistName:'',tracks:[{...fixtureRelease.tracks[0],primaryArtist:'',artistProfileIds:[],audioUrl:''}]}:fixtureRelease;return route.fulfill({contentType:'text/html',body:`<html data-theme="${theme}"><body><div id="root"></div><script>window.fixtureRelease=${JSON.stringify(release)};window.fixtureEntry=${entry};window.fixtureAmendment=false</script></body></html>`});}
      if(url.pathname.startsWith('/api/assets/'))return route.fulfill({contentType:'audio/wav',body:wav()});
      if(url.pathname==='/fixture-cover.png')return route.fulfill({contentType:'image/png',body:await require('sharp')({create:{width:3000,height:3000,channels:3,background:'#405f82'}}).png().toBuffer()});
      if(url.pathname.startsWith('/assets/'))try{return await route.fulfill({body:await fs.readFile(path.join('public',url.pathname))});}catch{}
      if(req.method()==='PATCH')return route.fulfill({json:{savedAt:'2026-11-03T10:00:00.000Z',draft:{id:25,updatedAt:'2026-11-03T10:00:00.000Z'}}});
      return route.fulfill({json:{artists:[artist],profiles:[],sessions:[],requests:[],workspaces:[],notifications:[]}});
    });
    await page.goto('https://hymn.fixture/distribution/start');await page.addStyleTag({path:path.join(out,'global.css')});const layout=await fs.readFile('app/layout.tsx','utf8');for(const m of layout.matchAll(/import "\.\/styles\/([^"]+)"/g))await page.addStyleTag({path:'app/styles/'+m[1]});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
    await expect(page.locator('[data-release-section]')).toHaveCount(4);await expect(page.locator('[data-release-section="3"]').getByText('Already released?',{exact:true})).toHaveCount(1);await expect(page.locator('[data-release-section="2"]').getByText('Already released?',{exact:true})).toHaveCount(0);assert(parseFloat(await page.getByRole('button',{name:'Replace cover artwork',exact:true}).evaluate(el=>getComputedStyle(el).borderTopWidth))>=1);await expect(page.locator('.release-artist-stage,.release-audio-stage')).toHaveCount(0);
    const nodes=await page.locator('[data-release-section]').evaluateAll(els=>els.map(e=>e.dataset.releaseSection));assert.deepEqual(nodes,['3','4','2','5']);
    const nav=page.getByRole('navigation',{name:'Release sections',exact:true});await expect(nav).toHaveCount(1);
    for(const [id,label] of [[3,'Credits & tracks'],[4,'Cover artwork'],[2,'Release details'],[5,'Delivery']]){
      await page.locator(`[data-release-section="${id}"]`).evaluate(el=>el.scrollIntoView({block:'start'}));
      if(id===4)await expect(page.locator('.release-navigation-header')).toBeInViewport();
      await expect(nav.getByRole('button',{name:label,exact:false})).toHaveAttribute('aria-current','step');
    }
    await expect(page.locator('[data-release-section]')).toHaveCount(4);
    await page.locator('[data-release-section="2"]').evaluate(el=>el.scrollIntoView({block:'start'}));
    await page.locator('.release-navigation-header .release-workspace-state').getByRole('button',{name:'Review',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Review your release',exact:true});
    if(!await dialog.isVisible()){console.log('review status',await page.locator('[role="alert"]').allTextContents(),await page.locator('.release-editor-status').innerText());}
    await expect(dialog).toBeVisible();await expect(dialog.getByText('Dreamy',{exact:true}).first()).toBeVisible();
    assert.equal(await dialog.getByRole('button',{name:/Continue to Checkout|Submit your release|Confirm & Submit Release/}).getAttribute('form'),'release-distribution-form');
    await dialog.getByRole('button',{name:/Continue to Checkout|Submit your release|Confirm & Submit Release/}).click();
    const finalDialog=page.getByRole('dialog',{name:'One final confirmation',exact:true});await expect(finalDialog).toBeVisible();await expect(dialog).not.toBeVisible();await finalDialog.getByRole('button',{name:'Back to review',exact:true}).click();await expect(dialog).toBeVisible();
    await expect(page.locator('[data-release-section="7"]')).toHaveCount(0);await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
    await expect(page.locator('[data-release-section]')).toHaveCount(4);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
    assert(!writes.some(w=>/submit|create-order|verify-submit/.test(w.url)),'Scrolling and opening review never submit or start checkout');
    await page.screenshot({path:path.join(out,`${theme}-${width}-sheet.png`),fullPage:true});
    await page.locator('.release-navigation-header .release-workspace-state').getByRole('button',{name:'Review',exact:true}).click();await expect(dialog).toBeVisible();await page.screenshot({path:path.join(out,`${theme}-${width}-review.png`),fullPage:true});await dialog.getByRole('button',{name:'Edit artwork',exact:false}).click();await expect(dialog).not.toBeVisible();await expect(page.locator('[data-release-section="4"]')).toBeInViewport();
    if(theme==='light'&&[390,320].includes(width)){
      entry=true;await page.reload();await page.addStyleTag({path:path.join(out,'global.css')});for(const m of layout.matchAll(/import "\.\/styles\/([^"]+)"/g))await page.addStyleTag({path:'app/styles/'+m[1]});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
      await expect(page.locator('.release-artist-stage')).toBeVisible();await expect(page.getByRole('button',{name:'Continue to upload music',exact:true})).toHaveCount(0);await expect(page.locator('[data-release-section]')).toHaveCount(0);
      await page.locator('.release-artist-stage .artist-picker-add-trigger').click();await page.getByRole('button',{name:'Select Fixture Artist',exact:true}).click();await page.getByRole('button',{name:'Continue to upload music',exact:true}).click();
      await expect(page.locator('.release-audio-stage')).toBeVisible();await page.screenshot({path:path.join(out,`${width}-opening-music.png`),fullPage:true});await page.getByRole('button',{name:'Skip for now',exact:true}).click();
      await expect(page.locator('[data-release-section]')).toHaveCount(4);await expect(page.locator('.release-artist-stage,.release-audio-stage')).toHaveCount(0);await expect(page.getByRole('button',{name:'Continue to upload music',exact:true})).toHaveCount(0);
      await page.locator('.release-navigation-header .release-workspace-state').getByRole('button',{name:'Review',exact:true}).click();await expect(page.getByRole('dialog',{name:'Review your release',exact:true})).toHaveCount(0);await expect(page.locator('.release-workflow [role="alert"]').last()).toContainText(/Upload|audio/i);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log(`PASS opening screens ${width}px: artist mandatory, persisted selection, optional audio, no repeated entry screens and final audio validation retained`);
    }
    await page.close();console.log(`PASS ${theme} ${width}px: persistent sheet, scroll-synced blurred navigation, letter review popup, Escape/edit, form association, no accidental submit and no overflow`);
  }}finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
