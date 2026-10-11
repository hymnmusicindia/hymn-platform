import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

async function main() {
  mkdirSync(".cache",{recursive:true});
  writeFileSync(".cache/producer-link-entry.tsx",`import React from 'react';import {createRoot} from 'react-dom/client';import {ProducerLinkPage} from '../components/producer-link-page';createRoot(document.getElementById('app')!).render(<ProducerLinkPage {...(window as any).fixture}/>);`);
  await build({entryPoints:[".cache/producer-link-entry.tsx"],outfile:".cache/producer-link-browser.js",bundle:true,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"next-link-adapter",setup(builder){
    builder.onResolve({filter:/^next\/link$/},args=>({path:args.path,namespace:"fixture"}));
    builder.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"tsx",resolveDir:process.cwd(),contents:`import React from 'react';export default function Link(props:any){return <a {...props}/>} `}));
  }}]});
  const utilities=await postcss([tailwindcss({content:["./components/producer-link-page.tsx"],theme:{extend:{}},plugins:[]})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined});
  const globals=[...readFileSync("app/layout.tsx","utf8").matchAll(/import "(\.\/[^\"]+\.css)"/g)].map(match=>"app/"+match[1].slice(2));
  const css=utilities.css+globals.map(file=>readFileSync(file,"utf8")).join("\n")+readFileSync(".cache/producer-link-browser.css","utf8");
  const image="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g"><stop stop-color="#754e74"/><stop offset="1" stop-color="#293b59"/></linearGradient></defs><path fill="url(#g)" d="M0 0h600v600H0z"/></svg>');
  const fixture={name:"Aditya Ujjain",slug:"aditya-ujjain-18",bio:"Beats for your next chapter.",avatar:image,banner:image,beats:Array.from({length:6},(_,index)=>({id:index+1,title:`Beat ${index+1}`,bpm:120,genre:"Trap",artwork:image,audio:"https://producer.fixture/audio.wav"})),socials:[{id:"instagram",label:"Instagram",url:"https://instagram.com/producer"},{id:"youtube",label:"YouTube",url:"https://youtube.com/@producer"},{id:"spotify",label:"Spotify",url:"https://open.spotify.com/artist/test"},{id:"website",label:"Website",url:"https://example.com"}]};
  const wav=Buffer.alloc(44+32000*4);wav.write("RIFF");wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(wav.length-44,40);
  const browser=await chromium.launch({headless:true});
  try { for(const {width,count} of [{width:320,count:6},{width:390,count:6},{width:430,count:6},{width:1440,count:6},{width:390,count:0},{width:390,count:1}]) {
    const context=await browser.newContext({viewport:{width,height:900},permissions:["clipboard-read","clipboard-write"]});const page=await context.newPage();const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
    await page.route("https://producer.fixture/**",route=>route.fulfill(route.request().url().endsWith("hymnlogowhite.png")?{contentType:"image/png",body:readFileSync("public/assets/hymnlogowhite.png")}:route.request().url().endsWith("audio.wav")?{contentType:"audio/wav",body:wav}:{contentType:"text/html",body:'<html data-theme="light"><body><div id="app"></div></body></html>'}));
    await page.goto("https://producer.fixture/p/aditya-ujjain-18");await page.evaluate(value=>{(window as any).fixture=value;},{...fixture,beats:fixture.beats.slice(0,count),socials:count ? fixture.socials : []});await page.addStyleTag({content:css});await page.addScriptTag({content:readFileSync(".cache/producer-link-browser.js","utf8")});
    await page.getByRole("heading",{name:fixture.name,exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:/^Play Beat/}).count(),count);
    assert.equal(await page.getByLabel("Open Aditya Ujjain's beat store").getAttribute("href"),"/beat-store/producers/aditya-ujjain-18");
    if(count) assert.equal(await page.getByRole("link",{name:"Instagram",exact:true}).getAttribute("rel"),"noopener noreferrer");
    assert.equal(await page.getByRole("img",{name:"HYMN Music",exact:true}).count(),1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"No horizontal overflow");
    for(const button of await page.getByRole("button").all()){const bounds=await button.boundingBox();assert(bounds&&bounds.height>=44,"Touch target height");}
    if(count) { await page.getByLabel("Play Beat 1",{exact:true}).click();await page.getByLabel("Pause Beat 1",{exact:true}).waitFor();await page.getByLabel("Seek Beat 1").waitFor();
    if(count>1) { await page.getByLabel("Play Beat 2",{exact:true}).click();await page.getByLabel("Pause Beat 2",{exact:true}).waitFor();assert.equal(await page.locator("audio").count(),1,"Only one player");
    await page.getByLabel("Pause Beat 2",{exact:true}).click();await page.getByLabel("Play Beat 2",{exact:true}).waitFor(); } }
    await page.getByLabel("Share Aditya Ujjain's profile").click();await page.getByRole("status").filter({hasText:"Link copied"}).waitFor();
    assert(await page.getByRole("img",{name:"HYMN Music",exact:true}).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0),"Real HYMN logo loads");
    assert.deepEqual(errors,[]);await page.screenshot({path:`.cache/producer-bio-${width}-${count}.png`,fullPage:true});await context.close();
  } console.log("PASS mobile-first producer bio page at 320/390/430/1440: playback, switching, sharing, links and touch targets"); } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
