const assert=require('node:assert/strict');
const{build}=require('esbuild');
const{chromium}=require('playwright');
const{mkdirSync,readFileSync}=require('node:fs');
const{execFileSync}=require('node:child_process');
(async()=>{
mkdirSync('.cache/visual-polish',{recursive:true});
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','app/globals.css','-o','.cache/visual-polish-global.css'],{stdio:'pipe',windowsHide:true});
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{CrmPipeline}from'./components/team/crm-pipeline';import workspace from './components/team/workspace.module.css';import{AnalyticsEmptyState}from'./components/analytics-empty-state';import{BeatLicenceGuide}from'./components/beat-licence-guide';import './app/styles/disclosure-polish.css';import{ChevronDown}from'lucide-react';const leads=Array.from({length:8},(_,i)=>({id:'lead'+i,researcher:{user:{name:'Manha Dakoora'}},acquisitionEmployeeId:null,leadVerified:false,prospect:{id:'p'+i,version:1,name:i===0?'Gauntlent':'Contact '+i,email:'artist'+i+'@example.org',phone:'+919876543210',stage:'NEEDS_RESEARCH',verified:false,contactEligibility:'UNVERIFIED',sourceUrl:'https://example.org',notes:'Customer notes remain available here.',categories:[]}}));const api=async()=>({items:[]});createRoot(document.getElementById('root')).render(<div className={workspace.workspace} style={{display:'block',minHeight:0}}><main className={workspace.content}><div className={workspace.panel}><CrmPipeline leads={leads} api={api} refresh={async()=>{}} admin={false} canEdit={true} canCreate={true} employeeId="rep" onAdd={()=>{}}/></div><section aria-label="Shared disclosure samples"><details><summary>Release rights evidence</summary><p>Attached license and review details.</p></details><details className="surface-card" style={{padding:16}}><summary>Existing SVG indicator<ChevronDown size={16}/></summary><p>Preserve authored disclosure icons.</p></details></section><AnalyticsEmptyState/><BeatLicenceGuide beat={null} onChoose={()=>{}} onBrowse={()=>{}}/></main></div>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'visual-polish.js',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
const browser=await chromium.launch();
try{for(const width of[390,768,1440]){
const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',error=>console.error('Browser error:',error.message));
await page.setContent('<html><head><meta charset="utf-8"></head><body style="margin:0;background:#0c0e12"><div id="root"></div></body></html>');
await page.addStyleTag({content:readFileSync('.cache/visual-polish-global.css','utf8')});await page.addStyleTag({content:css});await page.addScriptTag({content:js});
const guide=page.locator('details').filter({has:page.locator('summary',{hasText:'How a contact becomes'})});
assert.equal(await guide.getAttribute('open'),null);
const card=page.getByRole('button',{name:/Gauntlent/});await card.waitFor();
const cardBox=await card.boundingBox();assert.ok(cardBox.height<=90,`Compact card at ${width}: ${cardBox.height}`);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Board scroll stays inside workspace');
await guide.locator('summary').click();
assert.equal(await guide.locator('li').count(),6);
assert.equal(await guide.evaluate(el=>getComputedStyle(el.querySelector('ol')).paddingLeft),width>480?'20px':'16px');
await page.screenshot({path:'.cache/visual-polish/pipeline-'+width+'.png',fullPage:true});
await card.click();const dialog=page.getByRole('dialog',{name:'Contact: Gauntlent'});await dialog.waitFor();
assert.equal(await dialog.getByRole('heading',{name:'Gauntlent'}).count(),1);await dialog.getByText('Previous notes',{exact:true}).click();await dialog.locator('p').filter({hasText:'Customer notes remain available here.'}).waitFor();
assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'Dialog has no horizontal overflow');
const checkbox=dialog.locator('input[name=contacted]');assert.equal(await checkbox.evaluate(el=>getComputedStyle(el).width),'16px','Checkbox must not inherit text-field width');const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.ok(box.height<=920);
await page.screenshot({path:'.cache/visual-polish/contact-'+width+'.png'});
await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await card.evaluate(el=>el===document.activeElement),true,'Focus returns to contact');
assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
const samples=page.getByRole('region',{name:'Shared disclosure samples'});assert.equal(await samples.locator('summary').first().evaluate(el=>getComputedStyle(el).display),'flex','Shared header stays on one row');await samples.getByText('Release rights evidence',{exact:true}).click();
assert.equal(await samples.locator('details').first().evaluate(el=>getComputedStyle(el.querySelector('summary'),'::after').content),'""');
assert.equal(await samples.locator('details').last().evaluate(el=>getComputedStyle(el.querySelector('summary'),'::after').content),'none','Existing SVG has no duplicate arrow');
assert.equal(await page.getByRole('link',{name:'View catalogue',exact:false}).evaluate(el=>getComputedStyle(el).color),'rgb(22, 27, 36)','Team link defaults must not wash out light CTA text');await page.getByText('How reporting works',{exact:true}).click();await page.getByText('Before you release',{exact:true}).click();
for(const label of ['How reporting works','Before you release']){const heading=page.locator('summary').filter({hasText:label});assert.equal(await heading.evaluate(el=>getComputedStyle(el,'::after').content),'none');assert.equal(await heading.locator('.lucide-chevron-down').count(),1);}
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Analytics and licence guide remain inside viewport');
await page.screenshot({path:'.cache/visual-polish/shared-'+width+'.png',fullPage:true});await page.close();}
console.log('PASS compact 8-contact pipeline, padded six-stage guide, modal details, Escape/focus restoration, contained scrolling and shared native/SVG disclosures at 390/768/1440px.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
