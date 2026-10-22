const fs = require('node:fs/promises');
const path = require('node:path');
const {build} = require('esbuild');
const {chromium, expect} = require('@playwright/test');
(async()=>{
 const out=path.resolve('.tmp/distribution-portal-visual'); await fs.mkdir(out,{recursive:true});
 await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ReleasePortal,ReleaseManage} from './components/release-portal';const pending=location.search.includes('pending');const release={amendment:pending?{id:7,status:'submitted',submittedAt:'2026-10-22',updatedAt:'2026-10-22',changes:[]}:undefined,id:991,status:'live',releaseType:'ep',releaseTitle:'Midnight Sessions',trackName:'Midnight Sessions',artistName:'Test Artist',artworkUrl:'/assets/aditya-ujjain-founder.jpeg',createdAt:'2026-01-01',releaseDate:'2026-02-01',platforms:['Spotify'],tracks:[{id:1,trackTitle:'First Light',trackNumber:1,isrc:'USAAA2600001'}],reviewIssues:{fields:[{field:'language',label:'Language',note:'Confirm language'}]},metadata:{},paymentStatus:'paid',upcCode:'123456789012'};createRoot(document.getElementById('root')).render(location.search.includes('manage')?<ReleaseManage release={release}/>:<ReleasePortal releases={[release]}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(url){window.lastPushedUrl=url},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',{...props,...(fill?{style:{...props.style,position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}:{})},children)}`}));}}]});
 const postcss=require('postcss');const tailwind=require('tailwindcss');
 const css=await postcss([tailwind({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'}).catch(()=>null);
 if(!css)throw Error('Tailwind compilation failed');
 if(css) await fs.writeFile(path.join(out,'global.css'),css.css);
 const browser=await chromium.launch();try{
 for(const width of [1920,1440,1280,1024,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://hymn.fixture/**',async r=> {if(r.request().resourceType()==='document')return r.fulfill({contentType:'text/html',body:'<div class="hymn-portal-root"><div class="hymn-portal workspace-v2"><div class="portal-workspace"><div class="dashboard-os-topbar"><input placeholder="Search workspace..."></div><div class="portal-page-content" style="height:900px;overflow:auto"><div id="root"></div></div></div></div></div>'});if(r.request().url().includes('/assets/')||r.request().url().includes('/api/image-preview')){const u=new URL(r.request().url());const asset=path.join('public',u.searchParams.get('src')||u.pathname);try{return r.fulfill({body:await fs.readFile(asset),contentType:'image/png'})}catch{}}return r.fulfill({json:{success:true,artists:[],releases:[],data:[],requests:page.url().includes('pending')?[{id:7,requestType:'metadata_update',status:'submitted',reason:'Restore original audio master',requestedChanges:{summary:[{label:'Track 1: audio master',before:'Previous master reference',after:'Restored original master'}]},events:[]}]:[]}})});
  for(const mode of ['catalogue','manage','pending-manage']){
   await page.goto('https://hymn.fixture/?'+mode);
   await page.addStyleTag({path:path.join(out,'global.css')});
   const layoutSource=await fs.readFile('app/layout.tsx','utf8');for(const match of layoutSource.matchAll(/import "\.\/styles\/([^"]+)"/g))await page.addStyleTag({path:`app/styles/${match[1]}`});
   await page.addStyleTag({path:'app/styles/workspace-system.css'});
   await page.addStyleTag({path:path.join(out,'ui.css')});
   await page.addStyleTag({path:'app/styles/distribution-consistency.css'});
   await page.addScriptTag({path:path.join(out,'ui.js')});
   if(mode==='catalogue'){
    const search=page.getByRole('searchbox',{name:'Search title, artist, UPC or ISRC'});
    await expect(search).toBeVisible();
    if(width>=1024){await expect(page.locator('.release-catalogue-desktop-filters')).toBeVisible();await expect(page.locator('.release-library-panel > details')).toBeHidden();}
    await expect(page.getByRole('button',{name:'Grid view'})).toHaveAttribute('aria-pressed','true');
    await search.fill('nonexistent release');
    await expect(page.getByRole('heading',{name:'No releases match your search'})).toBeVisible();
    await page.getByRole('button',{name:'Clear search and filters'}).click();
    await expect(search).toHaveValue('');
    await expect(page.getByRole('heading',{name:'No releases match your search'})).toHaveCount(0);
    await page.getByRole('button',{name:'List view'}).click();
    await expect(page.getByRole('button',{name:'List view'})).toHaveAttribute('aria-pressed','true');
    await search.fill('another missing release');
    await expect(page.getByRole('heading',{name:'No releases match your search'})).toBeVisible();
    await page.getByRole('button',{name:'Clear search and filters'}).click();
    await expect(page.getByRole('heading',{name:'No releases match your search'})).toHaveCount(0);
   }else{
    await expect(page.getByRole('tablist',{name:'Release sections'})).toBeVisible();
    if(mode==='pending-manage'){await expect(page.getByRole('status',{name:'Amendment status'})).toContainText('Amendment under review');await page.getByRole('button',{name:'Track amendment',exact:true}).click();await expect(page.getByRole('heading',{name:'Request history',exact:true})).toBeVisible();await expect(page.getByText('Restored original master',{exact:false})).toBeVisible();}else{await page.getByRole('button',{name:'Amend release',exact:true}).click();if(await page.evaluate(()=>window.lastPushedUrl)!=='/distribution/start?amend=991')throw Error('Amendment did not open the pre-filled wizard');}
    const fits=await page.getByRole('tablist').evaluate(list=>list.scrollWidth<=list.clientWidth+1);
    if(width>=768&&!fits)throw Error('Desktop section navigation does not fit one row');
    await expect(page.getByPlaceholder('Search workspace...')).toBeHidden();
    const rowCount=await page.getByRole('tab').evaluateAll(tabs=>new Set(tabs.map(t=>Math.round(t.getBoundingClientRect().top))).size);if(rowCount!==1)throw Error('Sections wrapped to multiple rows');
    const style=await page.getByRole('tablist').evaluate(list=>({background:getComputedStyle(list).backgroundColor,border:getComputedStyle(list).borderTopWidth}));
    if(style.background!=='rgba(0, 0, 0, 0)'||style.border!=='0px')throw Error('Section navigation still has a box');
    for(const tab of await page.getByRole('tab').all())await expect(tab).toBeVisible();
    const tabs=page.getByRole('tab');await tabs.first().focus();await page.keyboard.press('End');
    await expect(tabs.last()).toHaveAttribute('aria-selected','true');
    await expect.poll(()=>tabs.last().evaluate(button=>{const b=button.getBoundingClientRect();const p=button.parentElement.getBoundingClientRect();return b.left>=p.left-1&&b.right<=p.right+1})).toBe(true);
    await expect.poll(()=>tabs.last().evaluate(button=>({filter:getComputedStyle(button).filter,color:getComputedStyle(button).color}))).toEqual({filter:'none',color:'rgb(255, 255, 255)'});
   }
   const overflow=await page.locator('.release-portal-page,.release-manage-page').evaluate(e=>e.scrollWidth>e.clientWidth+2);if(overflow){console.log(await page.locator('.release-portal-page,.release-manage-page').evaluate(e=>[...e.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>e.getBoundingClientRect().right+2).map(x=>({tag:x.tagName,cls:x.className,width:x.getBoundingClientRect().width,right:x.getBoundingClientRect().right})).slice(0,15)));throw Error(`Overflow at ${width} ${mode}`)}
   await page.screenshot({path:path.join(out,`${width}-${mode}.png`),fullPage:true});
   console.log(`PASS ${width}px ${mode}`);
  }
  if(errors.length)throw Error(errors.join('\n')); await page.close();
 }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
