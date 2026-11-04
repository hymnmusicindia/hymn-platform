const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {build}=require('esbuild');const {chromium,expect}=require('@playwright/test');
(async()=>{
 const dir=path.resolve('.cache/music-app-theme');await fs.mkdir(dir,{recursive:true});
 await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Page from './app/music/app/page';Page().then(view=>createRoot(document.getElementById('root')).render(view));`,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(dir,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'app-fixture',setup(b){
  b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/music-app-release$/},()=>({path:'release',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='release'?`export async function getMusicAppRelease(){return {version:'1.2.3',size:1048576};}`:`import React from 'react';export default function Link(p){return <a {...p}/>}`,loader:'tsx',resolveDir:process.cwd()}));
 }}]});
 const css=await fs.readFile('app/styles/theme-tokens.css','utf8');
 const server=http.createServer(async(req,res)=>{if(req.url==='/ui.js'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(dir,'ui.js')));}else{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}*{box-sizing:border-box}body{margin:0;font:14px Arial}</style><div id="root"></div><script src="/ui.js"></script>`);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch();try{
  for(const width of [320,390,1440])for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width,height:850}});await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedLink=text}}});});
   const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin);await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const download=page.getByRole('link',{name:'Download Android app'});await expect(download).toHaveAttribute('href','/music/app/download');await expect(page.getByText('Version 1.2.3',{exact:false})).toBeVisible();
   await page.getByRole('button',{name:'Copy app link'}).click();await expect(page.getByRole('button',{name:'Link copied'})).toBeVisible();assert.equal(await page.evaluate(()=>window.copiedLink),origin+'/music/app');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const paint=await download.evaluate(el=>{const style=getComputedStyle(el),root=getComputedStyle(document.documentElement);return{background:style.backgroundColor,text:style.color,accent:root.getPropertyValue('--accent').trim()};});assert.notEqual(paint.background,paint.text);assert.notEqual(paint.background,'rgb(230, 210, 163)');
   await page.screenshot({path:path.join(dir,`${theme}-${width}.png`),fullPage:true});await page.close();
  }
  console.log('PASS app download: real page/component, current version, light/dark theme, HYMN action colours, copy feedback, stable links and no overflow at 320/390/1440px. No APK or email delivered.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
