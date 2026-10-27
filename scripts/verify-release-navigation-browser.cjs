const fs = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function wav() {
  const data = Buffer.alloc(16044); data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8); data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22); data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34); data.write('data',36); data.writeUInt32LE(16000,40); return data;
}
async function main() {
  const out = path.resolve('.cache/release-navigation'); await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {PortalLayout} from './components/portal-layout';import './app/styles/landing.css';import './app/styles/portal.css';import './app/styles/workspace-enterprise.css';import './app/styles/dashboard-design-system.css';import './app/styles/sidebar-consistency.css';import './app/styles/workspace-navigation.css';import './app/styles/workspace-pages.css';import './app/styles/distribution-consistency.css';import './app/styles/release-navigation-header.css';import {ReleaseForm} from './components/release-form';createRoot(document.getElementById('root')).render(<div className=\"hymn-portal-root\"><PortalLayout>{window.fixtureShellOnly ? <article data-existing-dashboard>Existing page</article> : <main className=\"distribution-start-page\"><section className=\"shell\"><div><ReleaseForm initialStage={3} amendmentMode={window.fixtureAmendment} selectedPlan='one_time' initialRelease={window.fixtureRelease}/></div></section></main>}</PortalLayout></div>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function usePathname(){return window.fixturePath || "/distribution/start"};export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
  const css = await require('postcss')([require('tailwindcss')({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
  await fs.writeFile(path.join(out,'global.css'),css.css);



  const browser=await chromium.launch();
  try {for(const width of [1440,390,320]) {
    const draft=true;
    const release={id:25,userId:51,status:draft?'draft':'changes_requested',paymentStatus:draft?'pending':'paid',releaseType:'single',wizardFormatIntent:'single',releaseTitle:'Dreamy',trackName:'Dreamy',artistName:'Fixture Artist',labelName:'HYMN Music',contentType:'Original/Exclusive Licensed',primaryGenre:'Hip-Hop',secondaryGenre:'Alternative Hip-Hop',language:'Hindi',releaseDate:'2026-10-19',createdAt:'2026-10-16',copyrightOwner:'Fixture Artist',publishingRights:'Fixture Artist',artworkUrl:'/fixture-cover.jpg',platforms:['Spotify'],ownershipConfirmed:true,noUnauthorizedSamples:true,collaboratorsCredited:true,platformCompliant:true,hymnNotLiable:true,agreedToTerms:true,falseMetadataAcknowledged:true,tracks:[{id:400,trackNumber:1,trackTitle:'Dreamy',language:'Hindi',audioUrl:'/api/assets/185/download',artistProfileIds:[10],primaryArtist:'Fixture Artist',songwriters:'Fixture Writer',composers:'Fixture Writer',producers:'Fixture Producer',duration:'02:37'}]};
    const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://hymn.fixture/**',route=>{const req=route.request();const url=new URL(req.url());
      if(req.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.fixtureRelease='+JSON.stringify(release)+';window.fixtureAmendment=false</script>'});
      if(url.pathname.startsWith('/api/assets/'))return route.fulfill({contentType:'audio/wav',body:wav()});
      if(url.pathname.includes('save-draft'))return route.fulfill({json:{release:{...release,draftVersion:'2026-10-28T10:00:00.000Z'}}});
      return route.fulfill({json:{artists:[{id:10,name:'Fixture Artist'}],profiles:[],sessions:[],requests:[]}});
    });
    await page.goto('https://hymn.fixture/distribution/start');await page.addStyleTag({path:path.join(out,'global.css')});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
    const nav=page.getByRole('navigation',{name:'Release sections',exact:true});await expect(nav).toHaveCount(1);await expect(nav).toBeVisible();
    await expect(page.locator('.release-navigation-header').getByRole('navigation')).toHaveCount(1);
    await expect(page.locator('.release-workflow > .release-stage-menu')).toHaveCount(0);
    await expect(nav.getByRole('button',{name:'Credits & tracks',exact:true})).toHaveAttribute('aria-current','step');
    const checkBounds=async()=>{const bounds=await page.evaluate(()=>{const n=document.querySelector('.release-navigation-header').getBoundingClientRect();const c=document.querySelector('.release-workflow-content').getBoundingClientRect();return {bottom:n.bottom,top:c.top,overflow:document.documentElement.scrollWidth>innerWidth+1}});expect(bounds.bottom).toBeLessThanOrEqual(bounds.top);expect(bounds.overflow).toBe(false)};
    await checkBounds();
    await nav.getByRole('button',{name:/Cover artwork/}).click();await expect(nav.getByRole('button',{name:/Cover artwork/})).toHaveAttribute('aria-current','step');await checkBounds();
    await expect(nav.getByRole('button',{name:/Cover artwork/})).toBeEnabled();await nav.getByRole('button',{name:/Cover artwork/}).focus();await page.keyboard.press('ArrowRight');await expect(nav.getByRole('button',{name:/Credits & tracks/})).toHaveAttribute('aria-current','step');
    await expect(page.locator('.landing-rail')).toHaveCount(1);await expect(page.locator('.dashboard-os-sidebar')).toHaveCount(0);
    if(width<1024)await page.getByRole('button',{name:/Explore HYMN/}).click();
    await expect(page.getByRole('navigation',{name:'HYMN services'})).toBeVisible();await expect(page.getByRole('link',{name:'Add release',exact:true})).toBeVisible();
    if(width<1024)await page.locator('#landing-navigation').getByRole('button',{name:'Close navigation',exact:true}).click();await expect(nav.getByRole('button',{name:/Credits & tracks/})).toBeEnabled();
    await page.screenshot({path:path.join(out,'release-navigation-'+width+'.png'),fullPage:true});expect(errors).toEqual([]);await page.close();console.log('PASS '+width+'px: homepage sidebar, single header navigation, metadata clearance, keyboard navigation and no overflow.');
  }
    for(const pathname of ['/distribution','/audio-library','/studio','/dashboard','/dashboard/customer','/producer/dashboard','/producer-dashboard','/dashboard/admin']) {
      const page=await browser.newPage({viewport:{width:1440,height:900}});
      await page.route('https://hymn.fixture/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>window.fixtureShellOnly=true;window.fixturePath='+JSON.stringify(pathname)+'</script>'}));
      await page.goto('https://hymn.fixture'+pathname);await page.addStyleTag({path:path.join(out,'global.css')});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
      await expect(page.locator('[data-existing-dashboard]')).toBeVisible();
      const dashboard=pathname.includes('dashboard');await expect(page.locator('.landing-rail')).toHaveCount(dashboard?0:1);await expect(page.locator('.release-navigation-header')).toHaveCount(0);
      await page.close();console.log('PASS '+pathname+': '+(dashboard?'existing dashboard frame preserved':'homepage service sidebar reused'));
    }
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
