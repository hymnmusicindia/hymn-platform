const fs = require('node:fs/promises');
const path = require('node:path');
const {build} = require('esbuild');
const {chromium, expect} = require('@playwright/test');
(async()=>{
 const out=path.resolve('.tmp/distribution-visual'); await fs.mkdir(out,{recursive:true});
 await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ReleaseForm} from './components/release-form';const stage=Number(new URLSearchParams(location.search).get('stage')||2);createRoot(document.getElementById('root')).render(<ReleaseForm selectedPlan="one_time" initialStage={stage} initialRelease={{id:999,status:'draft',releaseType:'ep',releaseTitle:'Midnight Sessions',artistName:'Test Artist',tracks:[{id:1,trackTitle:'First Light',trackNumber:1},{id:2,trackTitle:'After Hours',trackNumber:2}],metadata:{}}}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
 const postcss=require('postcss');const tailwind=require('tailwindcss');
 const css=await postcss([tailwind({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'}).catch(()=>null);
 if(!css)throw Error('Tailwind compilation failed');
 if(css) await fs.writeFile(path.join(out,'global.css'),css.css);
 const browser=await chromium.launch();try{
 for(const width of [1440,1024,768,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://hymn.fixture/**',async r=> {if(r.request().resourceType()==='document')return r.fulfill({contentType:'text/html',body:'<div class="portal-page-content" style="height:900px;overflow:auto"><div class="distribution-start-page"><div id="root"></div></div></div>'});if(r.request().url().includes('/assets/')){const asset=path.join('public',new URL(r.request().url()).pathname);try{return r.fulfill({body:await fs.readFile(asset),contentType:'image/png'})}catch{}}return r.fulfill({json:{success:true,artists:[],releases:[],data:[]}})});
  for(const stage of [2,7,0,1,4,3,5]){
   await page.goto('https://hymn.fixture/?stage='+stage);
   if(css)await page.addStyleTag({path:path.join(out,'global.css')});
   const layoutSource=await fs.readFile('app/layout.tsx','utf8');for(const match of layoutSource.matchAll(/import "\.\/styles\/([^"]+)"/g))await page.addStyleTag({path:`app/styles/${match[1]}`});
   await page.addStyleTag({path:path.join(out,'ui.css')});
   await page.addStyleTag({path:'app/styles/distribution-consistency.css'});
   await page.addScriptTag({path:path.join(out,'ui.js')});
   await expect(page.locator('.release-workflow-nav')).toBeVisible();
   await expect(page.locator('.release-workflow-nav button')).toHaveCount(5);
   await expect(page.locator('.release-workflow-nav button')).toHaveText(['Cover artwork','Credits & tracks','Release details','Delivery','Review'].map((label,i)=>new RegExp(`${i+1}.*${label.replace('&','&')}`)));
   await expect(page.locator('.release-workflow-nav [aria-current=step]')).toHaveCount([0,1].includes(stage)?0:1);
   const visibleStage=await page.locator('.release-workflow-nav').evaluate(nav=>{const current=nav.querySelector('[aria-current=step]');if(!current)return true;const b=current.getBoundingClientRect();const n=nav.getBoundingClientRect();return b.left>=n.left && b.right<=n.right});if(!visibleStage)throw Error('Current stage is clipped');
   await page.locator('.portal-page-content').evaluate(e=>e.scrollTop=380);const top=await page.locator('.release-workflow-nav').evaluate(e=>e.getBoundingClientRect().top);if(top < -1)throw Error('Stage navigation scrolled out of view');await page.locator('.portal-page-content').evaluate(e=>e.scrollTop=0);
   const layout=await page.locator('.release-workflow').evaluate(e=>({width:e.scrollWidth,client:e.clientWidth}));
   if(layout.width>layout.client+2)throw Error(`Overflow ${width} stage ${stage}: ${JSON.stringify(layout)}`);
   if(stage===2){await page.getByRole('button',{name:'Yes',exact:true}).click();await expect(page.getByRole('button',{name:'Yes',exact:true})).toHaveAttribute('aria-pressed','true');}
   if([2,7].includes(stage))await page.screenshot({path:path.join(out,`${width}-stage-${stage}.png`),fullPage:true});
   if(stage===2){await page.getByRole('navigation',{name:'Release sections'}).getByRole('button',{name:'Cover artwork',exact:true}).click();await expect(page.locator('form')).toHaveAttribute('data-editor-stage','4');}
   console.log(`PASS ${width}px stage ${stage}`);
  }
  if(errors.length)throw Error(errors.join('\n')); await page.close();
 }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
