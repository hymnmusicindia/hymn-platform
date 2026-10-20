const fs=require('node:fs/promises');const path=require('node:path');const {build}=require('esbuild');const {chromium,expect}=require('@playwright/test');
(async()=>{
 const out=path.resolve('.tmp/policy-banner');await fs.mkdir(out,{recursive:true});
 await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {PolicyAgreementBanner} from './components/policy-agreement-banner';import {ReleaseForm} from './components/release-form';createRoot(document.getElementById('root')).render(<div className="hymn-portal-root"><PolicyAgreementBanner initialStatus={window.fixturePolicy}/><header style={{height:58,position:'sticky',top:0,background:'#08090b'}}>HYMN</header><div className="hymn-portal workspace-v2"><main className="portal-workspace"><div className="portal-page-content"><div className="distribution-start-page"><ReleaseForm selectedPlan="one_time" initialStage={5} initialRelease={{id:999,status:'draft',releaseType:'single',releaseTitle:'Fixture',artistName:'Fixture',tracks:[{id:1,trackNumber:1,trackTitle:'Fixture'}],metadata:{}}}/></div></div></main></div></div>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'next-fixture',setup(b){b.onResolve({filter:/^next\/(navigation|image|link)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.endsWith('navigation')?'export function useRouter(){return {push(){},refresh(){},replace(){}}}':`import React from 'react';export default function C({children,fill,priority,unoptimized,...props}){return React.createElement('${a.path.endsWith('image')?'img':'a'}',props,children)}`}));}}]});
 const postcss=require('postcss');const tailwind=require('tailwindcss');const css=await postcss([tailwind({content:['./components/**/*.{ts,tsx}'],theme:{extend:{}},plugins:[]})]).process(await fs.readFile('app/globals.css','utf8'),{from:'app/globals.css'});
 const browser=await chromium.launch();try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let status={revision:'revision-one',version:'2026-10-21',updatedLabel:'October 21, 2026',distributionSummary:'DireNote retains 30% of Net Royalty Revenue. HYMN charges no additional royalty-percentage commission. The remaining eligible 70% is subject to reporting, splits and payout conditions.',accepted:false,acceptedAt:null};let fail=true;
  await page.route('https://hymn.fixture/**',async route=>{
   const url=new URL(route.request().url());
   if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:`<script>window.fixturePolicy=${JSON.stringify(status)}</script><div id="root"></div>`});
   if(url.pathname==='/api/account/policies'){
    if(route.request().method()==='GET')return route.fulfill({json:status});
    const body=route.request().postDataJSON();if(body.accepted!==true)throw Error('Missing explicit acceptance');
    if(body.revision!==status.revision)return route.fulfill({status:409,json:status});
    if(fail)return route.fulfill({status:503,json:{error:'Agreement could not be saved. Try again.'}});
    status={...status,accepted:true,acceptedAt:new Date().toISOString()};return route.fulfill({json:status});
   }
   return route.fulfill({json:{success:true,artists:[],draft:{id:999},savedAt:new Date().toISOString()}});
  });
  async function open(){await page.goto('https://hymn.fixture/');await page.addStyleTag({content:css.css});const layout=await fs.readFile('app/layout.tsx','utf8');for(const match of layout.matchAll(/import "\.\/styles\/([^"]+)"/g))await page.addStyleTag({path:`app/styles/${match[1]}`});await page.addStyleTag({path:'app/styles/workspace-system.css'});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});}
  await open();const banner=page.locator('[data-policy-banner]');await expect(banner).toBeVisible();await expect(banner).not.toContainText('DireNote retains 30%');await expect(banner.getByRole('link',{name:'Terms of Service',exact:true})).toHaveAttribute('target','_blank');
  await expect(page.locator('form.release-workflow')).not.toContainText('Net Royalty Revenue');await expect(page.getByRole('checkbox',{name:'I confirm the rights, permissions and accuracy of this release.'})).toBeVisible();
  const geometry=await banner.evaluate(e=>({right:e.getBoundingClientRect().right,bottom:e.getBoundingClientRect().bottom,background:getComputedStyle(e).backgroundColor,header:e.parentElement.querySelector('header').getBoundingClientRect().top}));if(geometry.right>width+1||geometry.header<geometry.bottom-1)throw Error('Banner overlaps header or overflows');if(geometry.background!=='rgb(36, 34, 30)')throw Error('HYMN banner palette was overridden');
  await page.screenshot({path:path.join(out,`${width}-banner.png`),fullPage:true});
  await banner.getByRole('button',{name:'I agree',exact:true}).click();await expect(banner.getByRole('alert')).toContainText('could not be saved');await expect(banner).toBeVisible();
  fail=false;await banner.getByRole('button',{name:'I agree',exact:true}).click();await expect(banner).toHaveCount(0);
  await open();await expect(page.locator('form.release-workflow')).toBeVisible();await expect(banner).toHaveCount(0);
  status={...status,revision:'revision-two',accepted:false,acceptedAt:null};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(banner).toBeVisible();
  // A policy update between display and click must require a fresh review, not silently consent.
  status={...status,revision:'revision-three'};await banner.getByRole('button',{name:'I agree',exact:true}).click();await expect(banner.getByRole('alert')).toContainText('policies changed');await expect(banner).toBeVisible();
  await banner.getByRole('button',{name:'I agree',exact:true}).click();await expect(banner).toHaveCount(0);
  if(errors.length)throw Error(errors.join('\n'));console.log(`PASS ${width}px: HYMN palette, linked terms, no repeated wizard disclosure, save failure, persisted acceptance, policy update and stale-click recovery`);await page.close();
 }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
