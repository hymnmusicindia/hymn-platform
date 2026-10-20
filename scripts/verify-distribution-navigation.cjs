const fs = require('node:fs/promises');
const path = require('node:path');
const {build} = require('esbuild');
const {chromium, expect} = require('@playwright/test');
(async()=>{
 const out=path.resolve('.tmp/distribution-navigation'); await fs.mkdir(out,{recursive:true});
 await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseForm} from './components/release-form';createRoot(document.getElementById('root')).render(<ReleaseForm selectedPlan="one_time" initialStage={1} initialRelease={{id:999,status:'draft',releaseType:'single',releaseTitle:'',artistName:'Test Artist',tracks:[{id:1,trackTitle:'',trackNumber:1,artistProfileIds:[1]}],metadata:{}}}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
 const postcss=require('postcss');const tailwind=require('tailwindcss');
 const css=await postcss([tailwind({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'}).catch(()=>null);
 if(!css)throw Error('Tailwind compilation failed');
 if(css) await fs.writeFile(path.join(out,'global.css'),css.css);
 const browser=await chromium.launch();try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  let mode='success', releaseSave, lastSaved;
  await page.route('https://hymn.fixture/**',async route=>{
   const url=new URL(route.request().url());
   if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<div class="hymn-portal-root"><div class="hymn-portal workspace-v2"><div class="portal-page-content"><div class="distribution-start-page"><div id="root"></div></div></div></div></div>'});
   if(url.pathname==='/api/artists')return route.fulfill({json:{artists:[{id:1,name:'Test Artist',userId:1,hasLiveMusic:false}]}});
   if(route.request().method()==='PATCH'&&url.pathname==='/api/distribution/drafts/999'){
    if(mode==='fail')return route.fulfill({status:503,json:{error:'Artists could not be saved. Retry.'}});
    if(mode==='slow')await new Promise(resolve=>releaseSave=resolve);
    lastSaved=route.request().postDataJSON();
    return route.fulfill({json:{draft:{id:999},savedAt:new Date().toISOString()}});
   }
   return route.fulfill({json:{success:true,artists:[],releases:[],data:[]}});
  });
  await page.goto('https://hymn.fixture/');
  await page.addStyleTag({path:path.join(out,'global.css')});
  const layout=await fs.readFile('app/layout.tsx','utf8');for(const match of layout.matchAll(/import "\.\/styles\/([^"]+)"/g))await page.addStyleTag({path:`app/styles/${match[1]}`});
  await page.addStyleTag({path:'app/styles/workspace-system.css'});
  await page.addStyleTag({path:path.join(out,'ui.css')});
  await page.addScriptTag({path:path.join(out,'ui.js')});
  const next=page.getByRole('button',{name:'Continue to upload music'});
  await expect(next).toBeVisible();await expect(page.locator('#draft-release-title')).toHaveCount(0);
  mode='fail';await next.click();
  await expect(page.locator('#artist-save-error')).toContainText('Artists could not be saved');
  await expect(next).toBeEnabled();await expect(page.locator('form')).toHaveAttribute('data-editor-stage','1');
  mode='slow';await next.click();await expect(next).toBeDisabled();await expect(next).toContainText('Saving artists');
  await expect.poll(()=>typeof releaseSave).toBe('function');mode='success';releaseSave();
  await expect(page.locator('form')).toHaveAttribute('data-editor-stage','0');
  if(lastSaved.title!=='')throw Error('Transition should not require a title');
  if(lastSaved.metadata.tracks[0].artistProfileIds[0]!==1)throw Error('Selected artist was not saved before advancing');
  console.log(`PASS ${width}px: visible save failure, retry, pending state, untitled artist save and Music transition`);
  await page.screenshot({path:path.join(out,`${width}-music.png`),fullPage:true});await page.close();
 }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
