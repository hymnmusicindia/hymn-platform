const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function wav() {
  const data = Buffer.alloc(16044); data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
async function main() {
  const out = path.resolve('.cache/submission-feedback'); await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseForm} from './components/release-form';createRoot(document.getElementById('root')).render(<ReleaseForm initialStage={7} amendmentMode={window.fixtureAmendment} selectedPlan='one_time' initialRelease={window.fixtureRelease}/>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
  const css = await require('postcss')([require('tailwindcss')({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
  await fs.writeFile(path.join(out,'global.css'),css.css);


  const browser=await chromium.launch();
  try{for(const {width,draft} of [{width:1440,draft:false},{width:390,draft:false},{width:1440,draft:true},{width:390,draft:true}]){
    const release={id:25,userId:51,status:draft?'draft':'changes_requested',paymentStatus:draft?'pending':'paid',releaseType:'single',wizardFormatIntent:'single',releaseTitle:'Dreamy',trackName:'Dreamy',artistName:'Fixture Artist',labelName:'HYMN Music',contentType:'Original/Exclusive Licensed',primaryGenre:'Hip-Hop',secondaryGenre:'Alternative Hip-Hop',language:'Hindi',releaseDate:'2026-10-19',createdAt:'2026-10-16',copyrightOwner:'Fixture Artist',publishingRights:'Fixture Artist',artworkUrl:'/fixture-cover.jpg',platforms:['Spotify'],ownershipConfirmed:true,noUnauthorizedSamples:true,collaboratorsCredited:true,platformCompliant:true,hymnNotLiable:true,agreedToTerms:true,falseMetadataAcknowledged:true,tracks:[{id:400,trackNumber:1,trackTitle:'Dreamy',language:'Hindi',audioUrl:'/api/assets/185/download',artistProfileIds:[10],primaryArtist:'Fixture Artist',songwriters:'Fixture Writer',composers:'Fixture Writer',producers:'Fixture Producer',duration:'02:37'}]};
    const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];let writes=0,held,finishRequest;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://hymn.fixture/**',async route=>{const request=route.request(),url=new URL(request.url());
      if(request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.fixtureRelease='+JSON.stringify(release)+';window.fixtureAmendment=false</script>'});
      if(url.pathname.startsWith('/api/assets/'))return route.fulfill({contentType:'audio/wav',body:wav()});
      if(url.pathname==='/api/distribution/save-draft')return route.fulfill({json:{release:{...release,draftVersion:'2026-10-28T10:00:00.000Z'}}});
      if(url.pathname==='/api/distribution/review-confirm')return route.fulfill({json:{updatedAt:'2026-10-28T10:00:00.000Z'}});
      if(url.pathname==='/api/distribution/payment/create-order')return route.fulfill({json:{requiresPayment:false,orderId:'order_fixture_123',subscriptionCovered:true}});
      if(url.pathname==='/api/distribution/update-release'||url.pathname==='/api/distribution/payment/verify-submit'){writes++;held=route;await new Promise(resolve=>finishRequest=resolve);return}
      if(url.pathname.includes('artist-verification'))return route.fulfill({json:{artists:[]}});
      return route.fulfill({json:{artists:[{id:10,name:'Fixture Artist'}],profiles:[],sessions:[],requests:[]}});
    });
    await page.goto('https://hymn.fixture/');await page.addStyleTag({path:path.join(out,'global.css')});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
    const submit=page.locator('button[type=submit].release-footer-action.is-primary');await expect(submit).toBeEnabled();await submit.click();
    const dialog=page.getByRole('dialog',{name:'One final confirmation'});await expect(dialog).toBeVisible();expect(writes).toBe(0);expect(await dialog.locator('..').evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('blur(10px)');
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(writes).toBe(0);await expect(submit).toBeFocused();
    await submit.click();await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));await dialog.getByRole('button',{name:/I agree/}).evaluate(button=>{button.click();button.click();});await expect(dialog).toHaveCount(0);
    await expect.poll(()=>writes).toBe(1);await page.clock.runFor(1200);
    const progress=page.locator('[aria-labelledby=release-upload-title] [role=progressbar]');expect(Number(await progress.getAttribute('aria-valuenow'))).toBeLessThan(50);
    await page.clock.runFor(3000);expect(Number(await progress.getAttribute('aria-valuenow'))).toBeLessThan(90);
    await page.clock.fastForward(60000);await expect(page.getByRole('heading',{name:'Initialising...'})).toBeVisible();await expect(progress).not.toHaveAttribute('aria-valuenow');expect(writes).toBe(1);
    await held.fulfill({json:{release:{...release,status:'under_review'}}});finishRequest();await expect(page.getByRole('heading',{name:'Submission confirmed'})).toBeVisible();await expect(progress).toHaveAttribute('aria-valuenow','100');await page.clock.runFor(500);await expect(page.locator('[data-release-review-confirmation]')).toBeVisible();expect(writes).toBe(1);expect(errors).toEqual([]);
    console.log('PASS '+width+'px '+(draft?'new release':'corrections')+': final popup, blur, Escape/focus restoration, no submit before agreement, single submission, gradual progress, delayed fallback and confirmed receipt.');await page.close();
  }}finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
