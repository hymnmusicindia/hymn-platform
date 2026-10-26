import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import {BLOG_ARTICLES,BLOG_CATEGORIES,slugifyCategory} from '../lib/blog-content';
import {policyDocuments} from '../lib/policy-content';
import {chromium,type Page} from '@playwright/test';
const origin='http://127.0.0.1:35510',root='.cache/sitewide-ux';mkdirSync(root,{recursive:true});
const fixture=JSON.parse(readFileSync('.cache/customer-experience/fixture.json','utf8'));
const roles=JSON.parse(readFileSync('.cache/customer-experience/sitewide-roles.json','utf8'));
roles.customer={...fixture.customer,role:'customer'};
const phase=process.env.SITEWIDE_AUDIT_PHASE||'before';if(!/^[a-z-]+$/.test(phase))throw Error('Invalid audit phase');
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const inventory=files('app').filter(f=>f.endsWith(path.sep+'page.tsx')).map(file=>({file,route:'/'+file.split(path.sep).slice(1,-1).filter(s=>!s.startsWith('(')).join('/')}));
writeFileSync(root+'/route-inventory.json',JSON.stringify(inventory,null,2));
const team=['overview','availability','work','tasks','inbox','projects','chat','contacts','emails','customer-calls','calendar','acquisition','creator-applications','release-qc','directory','approvals','reports','audit','settings','referral','search','files','knowledge','saved','preferences','tasktools','projecttools','chattools','decisions','imports','analytics','engineerqa','automations','invitations','roles','discover','expenses','people'];
const adminTabs=['overview','artists','producers','releases','distribution-queue','delivery-failed','delivery','analytics','revenue','royalties','earnings-entry','contracts','promotions','support','fraud','notifications','team','settings','users','payments','content','timed-playlists','operations','reviews','activity'];
const jobs=[
...BLOG_ARTICLES.map(a=>({role:'public',route:'/blog/'+a.slug})),
...BLOG_CATEGORIES.map(c=>({role:'public',route:'/blog/category/'+slugifyCategory(c)})),
...policyDocuments.map(p=>({role:'public',route:'/policies/'+p.slug})),
{role:'public',route:'/ref/UIAUDITTEAM'},
{role:'public',route:'/studio/share/vouch/'+roles.vouchId},
{role:'admin',route:'/admin/referrals/'+roles.referralId},
{role:'admin',route:'/admin/studio/orders/'+fixture.studioOrderPublicId},
...['/dashboard/customer','/release-submitted-preview'].map(route=>({role:'customer',route})),
{role:'admin',route:'/dashboard/admin'},
...['/producer-dashboard','/studio/engineer','/studio/engineer/profile','/studio/engineer/proof'].map(route=>({role:'producer',route})),
{role:'staff',route:'/team/performance?workspace='+roles.workspaceId},
{role:'staff',route:'/team/performance/'+roles.snapshotId},
{role:'public',route:'/team/join'},
...inventory.filter(i=>i.file.includes('(public)')&&!i.route.includes('[')).map(i=>({role:'public',route:i.route})),
...inventory.filter(i=>i.file.includes('(admin)')&&!i.route.includes('[')).map(i=>({role:'admin',route:i.route})),
...adminTabs.map(tab=>({role:'admin',route:'/admin?tab='+tab})),
...['overview','catalog','sales','earnings','analytics','collaborations','profile','upload','messages','settings'].map(tab=>({role:'producer',route:'/producer/dashboard?tab='+tab})),
...team.map(module=>({role:module==='settings'?'admin':'staff',route:`/team?workspace=${roles.workspaceId}&module=${module}`})),
];
const results:any[]=process.env.SITEWIDE_AUDIT_RESUME==='true'&&existsSync(`${root}/${phase}.json`)?JSON.parse(readFileSync(`${root}/${phase}.json`,'utf8')):[];
async function inspect(page:Page){return page.evaluate(()=>{const shown=(e:Element)=>{const r=e.getBoundingClientRect();if(!r.width||!r.height||e.closest('nextjs-portal,[hidden],[inert],[aria-hidden=true]'))return false;const s=getComputedStyle(e);if(s.visibility==='hidden'||s.display==='none')return false;const d=e.closest('details:not([open])');return!d||Boolean(d.querySelector('summary')?.contains(e));};return{url:location.pathname+location.search,title:document.title,headings:[...document.querySelectorAll('h1,h2')].filter(shown).slice(0,5).map(e=>e.textContent),overflow:document.documentElement.scrollWidth>innerWidth+1?[...document.querySelectorAll('main *,section')].filter(e=>shown(e)&&e.getBoundingClientRect().right>innerWidth+2).slice(0,8).map(e=>({tag:e.tagName,class:e.className,text:e.textContent?.slice(0,80)})):[],unnamed:[...document.querySelectorAll('button')].filter(e=>shown(e)&&!e.innerText.trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.getAttribute('title')).map(e=>e.outerHTML.slice(0,180)),images:[...document.images].filter(e=>shown(e)&&e.complete&&!e.naturalWidth).map(e=>({src:e.getAttribute('src'),alt:e.alt})),emptyBorders:[...document.querySelectorAll('main details,main fieldset')].filter(e=>shown(e)&&parseFloat(getComputedStyle(e).borderLeftWidth)>0&&parseFloat(getComputedStyle(e).paddingLeft)===0).slice(0,8).map(e=>({class:e.className,text:e.textContent?.slice(0,70)}))};});}
async function main(){const browser=await chromium.launch();try{for(const role of ['public','customer','admin','producer','staff']){
const selected=jobs.filter(j=>j.role===role&&(!process.env.SITEWIDE_AUDIT_ROLE||role===process.env.SITEWIDE_AUDIT_ROLE)&&(!process.env.SITEWIDE_AUDIT_FILTER||j.route.includes(process.env.SITEWIDE_AUDIT_FILTER)));if(!selected.length)continue;
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addInitScript('window.__name = fn => fn');await context.addInitScript(()=>{try{localStorage.setItem('hymn-theme','dark');}catch{}});
if(role!=='public'){const u=roles[role];await context.addCookies([{name:'hymn_session',value:jwt.sign({sub:u.id,name:u.name,email:u.email,role:u.role},'customer-experience-local-fixture-secret',{expiresIn:'4h'}),url:origin}]);}
let page:Page;
for(const job of selected){if(process.env.SITEWIDE_AUDIT_RESUME==='true'&&results.some(row=>row.role===job.role&&row.route===job.route&&row.views&&!row.errors.length&&!row.views.some((view:any)=>view.overflow.length||view.unnamed.length||view.images.length)))continue;for(let index=results.length-1;index>=0;index--)if(results[index].role===job.role&&results[index].route===job.route)results.splice(index,1);page=await context.newPage();page.setDefaultNavigationTimeout(180000);page.setDefaultTimeout(20000);const errors:string[]=[];const listener=(e:Error)=>errors.push(e.message);page.on('pageerror',listener);let status=0;
try{await page.setViewportSize({width:1440,height:1000});const response=await page.goto(origin+job.route,{waitUntil:'domcontentloaded'});status=response?.status()||0;const aliases:Record<string,string>={'/home':'/','/auth':'/login','/customer-login':'/login','/producer-login':'/producer-onboarding','/beatstore':'/beat-store','/distribution':'/distribution/start','/first-release-free':'/first-release','/dashboard/admin':'/admin','/producer-dashboard':'/producer/dashboard'};if(aliases[job.route])await page.waitForURL(url=>url.pathname===aliases[job.route],{waitUntil:'domcontentloaded',timeout:120000});await page.waitForLoadState('networkidle',{timeout:6000}).catch(()=>{});await page.waitForTimeout(200);
const views=[];for(const width of[1440,390,320]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);views.push({width,...await inspect(page)});}
const slug=role+'-'+job.route.replace(/[^a-z0-9]+/gi,'-').slice(0,120);await page.setViewportSize({width:390,height:1000});await page.screenshot({path:`${root}/${phase}-${slug}.png`,fullPage:true});
if((job.route.includes('module=acquisition')||job.route.includes('module=referral'))&&role==='staff'){const button=page.getByRole('button',{name:'Get my referral link',exact:true});await button.waitFor();await button.click();await page.getByLabel('Your employee referral link',{exact:true}).waitFor();const link=await page.getByLabel('Your employee referral link',{exact:true}).inputValue();if(!link.includes('/join?ref=UIAUDITTEAM'))throw Error('Referral link generation failed');}
results.push({...job,status,views,errors});console.log(JSON.stringify({role,route:job.route,status,errors,overflow:views.filter(v=>v.overflow.length).map(v=>v.width),unnamed:views[0].unnamed.length,images:views[0].images.length}));
}catch(error){results.push({...job,status,errors:[String(error)]});console.log('FAIL',role,job.route,String(error).slice(0,150));}finally{page.off('pageerror',listener);await page.close();writeFileSync(`${root}/${phase}.json`,JSON.stringify(results,null,2));}}
await context.close();}
const summary={inventory:inventory.length,checked:results.length,failed:results.filter(r=>r.status>=400||r.errors.length),overflow:results.filter(r=>r.views?.some((v:any)=>v.overflow.length)),unnamed:results.filter(r=>r.views?.some((v:any)=>v.unnamed.length)),images:results.filter(r=>r.views?.some((v:any)=>v.images.length))};writeFileSync(`${root}/${phase}-summary.json`,JSON.stringify(summary,null,2));console.log('AUDIT SUMMARY',JSON.stringify({inventory:summary.inventory,checked:summary.checked,failed:summary.failed.length,overflow:summary.overflow.length,unnamed:summary.unnamed.length,images:summary.images.length}));
if(!process.argv.includes('--report'))assert.equal(summary.failed.length+summary.overflow.length+summary.unnamed.length+summary.images.length,0,'Resolve recorded site-wide UI findings.');
}finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1});
