const {build}=require('esbuild');
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {textContrast}=require('./lib/text-contrast.cjs');
(async()=>{
 const out=path.resolve('.cache/producer-suggestions');await fs.mkdir(out,{recursive:true});
 await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ProducerSuggestions} from './components/producer-suggestions';const profiles=Array.from({length:10},(_,i)=>({id:i+1,userId:i+101,slug:'producer-'+(i+1),name:i===9?'The newest producer with a very long name':'Producer '+(i+1),description:'Independent producer',specialty:'Hip Hop',location:'Mumbai, India',active:i!==0,status:'active',sortOrder:i,imageUrl:'/missing-photo.jpg',createdAt:'2026-01-01',updatedAt:'2026-01-01'}));const beats=profiles.map((p,i)=>({producerId:p.userId,createdAt:new Date(2026,10,i+1).toISOString()}));const root=createRoot(document.getElementById('root'));window.emptyProducers=()=>root.render(<ProducerSuggestions profiles={[]} beats={[]}/>);root.render(<><h1>Beatstore hero</h1><ProducerSuggestions profiles={[...profiles,profiles[2]]} beats={beats}/><p>Beat catalogue</p></>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',plugins:[{name:'next-link',setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from 'react';export default function Link(props){return <a {...props}/>}`,loader:'tsx',resolveDir:process.cwd()}));}}]});
 const tokens=await fs.readFile('app/styles/theme-tokens.css','utf8');
 const css=await fs.readFile(path.join(out,'ui.css'),'utf8');
 const server=http.createServer(async(req,res)=>{if(req.url==='/ui.js'){res.setHeader('Content-Type','text/javascript');return res.end(await fs.readFile(path.join(out,'ui.js')));}if(req.url==='/missing-photo.jpg'){res.writeHead(404);return res.end();}res.setHeader('Content-Type','text/html');res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Arial}h1{padding:30px 20px}</style><style>${css}</style></head><body><div id="root"></div><script src="/ui.js"></script></body></html>`);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch();
 try{
  for(const theme of ['light','dark'])for(const width of [320,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});let guest=false,failWrite=false,failRead=false,reads=0,writes=0;const followed=new Set();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/producer-follows**',async route=>{
    if(route.request().method()==='GET'){reads++;if(failRead)return route.fulfill({status:503,json:{error:'Unavailable'}});return route.fulfill({json:{authenticated:true,producers:Array.from({length:9},(_,i)=>({id:i+2,count:followed.has(i+2)?1:0,following:followed.has(i+2),own:i+2===3}))}});}
    writes++;if(guest)return route.fulfill({status:401,json:{error:'Sign in'}});if(failWrite)return route.fulfill({status:503,json:{error:'Could not save your follow. Please retry.'}});const body=route.request().postDataJSON();body.following?followed.add(body.producerId):followed.delete(body.producerId);return route.fulfill({json:{producer:{id:body.producerId,count:followed.has(body.producerId)?1:0,following:followed.has(body.producerId),own:false}}});
   });
   await page.goto(origin);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const section=page.getByRole('region',{name:'Producers to follow'}),list=section.getByRole('list');
   await expect(list.getByRole('listitem')).toHaveCount(8);
   const first=list.getByRole('listitem').first();await expect(first.getByRole('link')).toHaveAttribute('href','/beat-store/producers/producer-10');
   const follow=first.getByRole('button');await expect(follow).toBeEnabled();await follow.click();await expect(follow).toHaveText('Following');await expect(first.getByText('1 follower',{exact:true})).toBeVisible();
   failWrite=true;await follow.click();await expect(section.getByRole('status')).toContainText('Could not save');await expect(follow).toHaveText('Following');await expect(first.getByText('1 follower',{exact:true})).toBeVisible();
   failWrite=false;await follow.click();await expect(follow).toHaveText('Follow');await expect(first.getByText('0 followers',{exact:true})).toBeVisible();
   guest=true;await follow.click();await expect(section.getByRole('link',{name:'Sign in'})).toHaveAttribute('href','/login?next=%2Fbeat-store%23producer-suggestions');await expect(follow).toHaveText('Follow');guest=false;
   await section.getByRole('button',{name:'All producers'}).click();await expect(list.getByRole('listitem')).toHaveCount(9);await expect(section.getByRole('button',{name:'Your producer profile: Producer 3'})).toBeDisabled();
   await section.getByRole('button',{name:'Show suggestions'}).click();await expect(list.getByRole('listitem')).toHaveCount(8);
   const toggle=section.getByRole('button',{name:/Producers to follow/});await toggle.click();await expect(list).toBeHidden();await expect(toggle).toHaveAttribute('aria-expanded','false');
   await page.reload();await expect(page.getByRole('button',{name:/Producers to follow/})).toHaveAttribute('aria-expanded','false');await page.getByRole('button',{name:/Producers to follow/}).click();
   for(const button of await section.getByRole('button').all())if(await button.isEnabled()&&await button.isVisible())assert.ok((await button.evaluate(textContrast)).ratio>=4.5,`${theme} ${width} action contrast`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No horizontal page overflow ${width}`);
   await page.screenshot({path:path.join(out,`${theme}-${width}.png`),fullPage:true});
   failRead=true;await page.reload();await expect(section.getByRole('button',{name:'Retry',exact:true})).toBeVisible();await expect(section.getByRole('link').first()).toBeVisible();failRead=false;await section.getByRole('button',{name:'Retry',exact:true}).click();await expect(section.getByRole('listitem').first().getByRole('button')).toBeEnabled();
   assert.ok(reads>=3&&writes===4);await page.evaluate(()=>window.emptyProducers());await expect(section).toHaveCount(0);assert.deepEqual(errors,[]);console.log(`PASS ${theme} ${width}px producer suggestions: ranking, real states, follow/unfollow, error recovery, sign-in, own profile, expand/collapse persistence, image fallback, contrast and overflow`);await page.close();
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
