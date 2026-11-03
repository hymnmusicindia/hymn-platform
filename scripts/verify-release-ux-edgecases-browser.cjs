const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function wav() {
  const data = Buffer.alloc(16044); data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
async function main() {
  const out = path.resolve('.cache/release-ux-edgecases'); await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {PortalLayout} from './components/portal-layout';import './app/styles/landing.css';import './app/styles/portal.css';import './app/styles/workspace-enterprise.css';import './app/styles/dashboard-design-system.css';import './app/styles/sidebar-consistency.css';import './app/styles/workspace-navigation.css';import './app/styles/workspace-pages.css';import './app/styles/distribution-consistency.css';import './app/styles/release-navigation-header.css';import {ReleaseForm} from './components/release-form';createRoot(document.getElementById('root')).render(<div className=\"hymn-portal-root\"><PortalLayout>{window.fixtureShellOnly ? <article data-existing-dashboard>Existing page</article> : <main className=\"distribution-start-page\"><section className=\"shell\"><div><ReleaseForm initialStage={window.fixtureEntry ? 1 : 3} amendmentMode={window.fixtureAmendment} selectedPlan='one_time' prefillSuggestions={window.fixturePrefills || []} initialRelease={window.fixtureRelease}/></div></section></main>}</PortalLayout></div>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function usePathname(){return window.fixturePath || "/distribution/start"};export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
  const css = await require('postcss')([require('tailwindcss')({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
  await fs.writeFile(path.join(out,'global.css'),css.css);



  const browser=await chromium.launch();
  const base={id:25,userId:51,status:'draft',paymentStatus:'pending',releaseType:'single',releaseTitle:'Dreamy',trackName:'Dreamy',artistName:'Fixture Artist',labelName:'HYMN Music',contentType:'Original/Exclusive Licensed',primaryGenre:'Hip-Hop',secondaryGenre:'Alternative Hip-Hop',language:'Hindi',releaseDate:'2026-12-20',createdAt:'2026-11-03',copyrightOwner:'Typed Owner',publishingRights:'Typed Master',artworkUrl:'/fixture-cover.png',platforms:['Spotify'],ownershipConfirmed:true,noUnauthorizedSamples:true,collaboratorsCredited:true,platformCompliant:true,hymnNotLiable:true,agreedToTerms:true,falseMetadataAcknowledged:true,tracks:[{id:400,trackNumber:1,trackTitle:'Dreamy',language:'Hindi',audioUrl:'/api/assets/185/download',artistProfileIds:[10],primaryArtist:'Fixture Artist',songwriters:'Fixture Writer',composers:'Fixture Writer',producers:'Fixture Producer',duration:'02:37'}]};
  const artist={id:10,name:'Fixture Artist',artistName:'Fixture Artist'};
  try{for(const theme of ['light','dark'])for(const width of [1440,390,320])for(const mode of ['missing','prefill','instrumental','existing','licensed','taxonomy']){
    const release=JSON.parse(JSON.stringify(base)),suggestions=[];
    if(mode==='missing')Object.assign(release.tracks[0],{language:'',trackTitle:'',songwriters:'',composers:'',audioUrl:''});
    if(mode==='instrumental')Object.assign(release.tracks[0],{language:'',version:'Instrumental'});
    if(mode==='licensed')release.contentType='Non-Exclusive Licensed';
    if(mode==='taxonomy'){release.secondaryGenre='Baroque';release.language='Unknown language';}
    if(mode==='existing'){release.releasePreviouslyReleased=true;release.tracks[0].isrc='INDN22600001';release.tracks.push({...release.tracks[0],id:401,trackNumber:2,trackTitle:'Second Track',isrc:''});}
    if(mode==='prefill'){
      release.language='English';for(const[field,value]of Object.entries({language:'Hindi',primaryGenre:'Hip-Hop',secondaryGenre:'Alternative Hip-Hop',copyrightOwner:'Previous Owner',publishingRights:'Previous Master'}))suggestions.push({field,value,source:'PREVIOUS_RELEASE',confidence:'SUGGESTION'});
    }
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://hymn.fixture/**',async route=>{const req=route.request(),u=new URL(req.url());if(req.method()!=='GET')writes.push(u.pathname);
      if(req.resourceType()==='document')return route.fulfill({contentType:'text/html',body:`<html data-theme="${theme}"><body><div id="root"></div><script>window.fixtureRelease=${JSON.stringify(release)};window.fixturePrefills=${JSON.stringify(suggestions)};window.fixtureEntry=false;window.fixtureAmendment=false</script></body></html>`});
      if(u.pathname.startsWith('/api/assets/'))return route.fulfill({contentType:'audio/wav',body:wav()});
      if(u.pathname==='/fixture-cover.png')return route.fulfill({contentType:'image/png',body:await require('sharp')({create:{width:3000,height:3000,channels:3,background:'#405f82'}}).png().toBuffer()});
      if(u.pathname.startsWith('/assets/'))try{return await route.fulfill({body:await fs.readFile(path.join('public',u.pathname))});}catch{}
      if(req.method()==='PATCH')return route.fulfill({json:{savedAt:'2026-11-03T10:00:00.000Z',draft:{id:25,updatedAt:'2026-11-03T10:00:00.000Z'}}});return route.fulfill({json:{artists:[artist],profiles:[],sessions:[],requests:[],notifications:[]}});
    });
    await page.goto('https://hymn.fixture/distribution/start');await page.addStyleTag({path:path.join(out,'global.css')});const layout=await fs.readFile('app/layout.tsx','utf8');for(const m of layout.matchAll(/import "\.\/styles\/([^"]+)"/g))await page.addStyleTag({path:'app/styles/'+m[1]});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
    await expect(page.locator('[data-release-section]')).toHaveCount(4);
    const review=()=>page.locator('.release-navigation-header .release-workspace-state').getByRole('button',{name:'Review',exact:true}).click();await review();
    if(mode==='missing'){
      const message=page.locator('#release-field-error-track-0-title-language');await expect(message).toBeVisible();await expect(message).toContainText('Select a language for Track 1.');
      const group=message.locator('..');const button=group.getByRole('button',{name:'Select track language',exact:true});await expect(button).toHaveAttribute('aria-invalid','true');await expect(button).toHaveAttribute('aria-describedby',/release-field-error-track-0-title-language/);
      await expect(page.locator('#release-field-error-track-0-title')).toContainText(/title/i);await expect(page.locator('#release-field-error-track-0-contributors')).toContainText(/songwriter/i);await expect(page.locator('#release-field-error-track-0-audio')).toContainText(/audio/i);
      await expect(page.locator('.release-workflow-content > p[role="alert"]')).toHaveCount(0);await button.click();await page.getByRole('dialog',{name:'Choose track language',exact:true}).getByRole('button',{name:'English',exact:true}).click();await expect(message).toHaveCount(0);await expect(page.locator('[data-release-section="3"]').getByRole('button',{name:'English',exact:true})).not.toHaveAttribute('aria-invalid','true');
    }else if(mode==='prefill'){
      const panel=page.locator('details').filter({has:page.getByText('Suggested details',{exact:true})});await expect(panel).toHaveAttribute('open','');
      const languageRow=panel.locator('[class*="release_prefill_panel_item"]').filter({has:page.getByText('Release language',{exact:true})});await expect(languageRow).toContainText('Current: English');await languageRow.getByRole('button',{name:'Keep current',exact:true}).click();
      await panel.getByRole('button',{name:'Confirm 2 matching details',exact:true}).click();await expect(panel).toContainText('2 to review');await expect(panel.getByRole('button',{name:/Confirm \d+ matching/})).toHaveCount(0);
      await panel.getByRole('button',{name:'Keep current',exact:true}).first().click();await panel.getByRole('button',{name:'Keep current',exact:true}).click();await expect(panel).toHaveCount(0);await expect(page.getByLabel(/^C-Line/)).toHaveValue('Typed Owner');await expect(page.getByLabel(/^P-Line/)).toHaveValue('Typed Master');await review();await expect(page.getByRole('dialog',{name:'Review your release',exact:true})).toBeVisible();
    }else if(mode==='instrumental'){
      await expect(page.locator('#release-field-error-track-0-title-language')).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Review your release',exact:true})).toBeVisible();
    }else if(mode==='existing'){
      await expect(page.locator('[data-release-section="3"] #release-field-error-existing-upc')).toBeVisible();await expect(page.locator('#release-field-error-track-1-isrc')).toContainText('Track 2');await expect(page.locator('#release-field-error-track-0-isrc')).toHaveCount(0);await expect(page.locator('#release-field-error-track-1-isrc').locator('..').getByRole('textbox')).toHaveAttribute('aria-invalid','true');
    }else if(mode==='taxonomy'){
      await expect(page.locator('#release-field-error-genre-picker')).toContainText('matching subgenre');await expect(page.locator('#release-field-error-language')).toContainText('supported release language');await expect(page.getByRole('dialog',{name:'Review your release',exact:true})).toHaveCount(0);
    }else{
      await expect(page.locator('#release-field-error-rights-document')).toBeVisible();await expect(page.getByRole('checkbox',{name:'YouTube Content ID',exact:true})).toBeDisabled();await expect(page.getByRole('dialog',{name:'Review your release',exact:true})).toHaveCount(0);
    }
    await page.screenshot({path:path.join(out,`${theme}-${width}-${mode}.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);assert(!writes.some(url=>/submit|create-order|verify-submit/.test(url)));await page.close();console.log(`PASS ${theme} ${width}px ${mode}: contextual field feedback, preserved values, provider rules and no accidental submission`);
  }}finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
