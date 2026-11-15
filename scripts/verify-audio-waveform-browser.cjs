const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

function audio(seconds=1) {
  const rate=8000, samples=rate*seconds, bytes=Buffer.alloc(44+samples*2);
  bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)bytes.writeInt16LE(Math.round(Math.sin(i*.34)*(.4+.3*Math.sin(i*.003))*24000),44+i*2);
  return bytes;
}

async function main() {
  const out=path.resolve('.cache/audio-waveform');await fs.mkdir(out,{recursive:true});
  await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AudioWaveform} from './components/audio-waveform';import * as waveform from './lib/client-audio-waveform';const root=createRoot(document.getElementById('root'));window.waveform=waveform;window.show=(src,count=1)=>root.render(<>{Array.from({length:count},(_,i)=><AudioWaveform key={i} compact src={src} title={'Track '+i}/>)}</>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,outfile:path.join(out,'ui.js'),jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:800,height:400},reducedMotion:'no-preference'});
    const errors=[],requests=[];let broken=true;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://wave.fixture/**',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(req.resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'});
      if(req.resourceType()==='fetch')requests.push(url.pathname);
      if(url.pathname==='/broken.wav'&&broken)return route.fulfill({status:500,body:'Unavailable'});
      if(url.pathname==='/slow.wav')await new Promise(resolve=>setTimeout(resolve,650));
      return route.fulfill({contentType:'audio/wav',body:audio(url.pathname==='/long.wav'?3:1)});
    });
    await page.goto('https://wave.fixture');
    await page.evaluate(()=>{
      const Original=window.OfflineAudioContext;
      window.decodeCounters={active:0,max:0,contexts:0};
      window.OfflineAudioContext=class extends Original {
        constructor(...args){super(...args);window.decodeCounters.contexts++;}
        async decodeAudioData(...args){const stats=window.decodeCounters;stats.active++;stats.max=Math.max(stats.max,stats.active);try{await new Promise(resolve=>setTimeout(resolve,50));return await super.decodeAudioData(...args);}finally{stats.active--;}}
      };
    });
    await page.addStyleTag({path:'app/styles/product-ui.css'});await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
    await page.evaluate(()=>window.show('/slow.wav',2));
    await expect(page.locator('[data-waveform-state="loading"]')).toHaveCount(2);
    assert.equal(await page.locator('.audio-waveform-live span').first().evaluate(el=>getComputedStyle(el).animationName),'hymn-waveform-loading');
    await expect(page.locator('[data-waveform-state="ready"]')).toHaveCount(2);
    assert.equal(requests.filter(url=>url==='/slow.wav').length,1,'Duplicate players share one waveform fetch');
    assert(await page.evaluate(async()=>new Set((await window.waveform.loadAudioWaveform('/slow.wav')).bars.map(value=>value.toFixed(3))).size>1),'Ready waveform contains decoded audio peaks');
    assert.equal(await page.locator('.audio-waveform-live span').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.evaluate(()=>window.show('/broken.wav'));
    await expect(page.locator('[data-waveform-state="error"]')).toHaveCount(1);
    await expect(page.locator('.audio-waveform-live.is-pending')).toHaveCount(0);
    broken=false;
    await page.evaluate(()=>window.waveform.loadAudioWaveform('/broken.wav'));
    assert.equal(requests.filter(url=>url==='/broken.wav').length,2,'A failed waveform can be retried');
    const bytes=Array.from(audio());
    await page.evaluate(async data=>{
      const result=window.waveform.prepareAudioWaveformFile(new File([new Uint8Array(data)],'local.wav',{type:'audio/wav'}));
      window.waveform.seedAudioWaveform('/uploaded-local.wav',result);
      const peaks=await window.waveform.loadAudioWaveform('/uploaded-local.wav');
      if(peaks.bars.length!==512||peaks.duration!==1)throw new Error('Local waveform mismatch');
    },bytes);
    assert(!requests.includes('/uploaded-local.wav'),'Uploaded file reuses local peaks without fetching audio');
    await page.evaluate(()=>Promise.all(Array.from({length:7},(_,i)=>window.waveform.loadAudioWaveform(`/batch-${i}.wav`))));
    const stats=await page.evaluate(()=>window.decodeCounters);assert.equal(stats.max,2,'Decode concurrency is bounded');assert.equal(stats.contexts,1,'One offline decoder is reused');
    await page.evaluate(()=>window.show('/uncached.wav'));await expect(page.locator('[data-waveform-state="ready"]')).toHaveCount(1);
    await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.show('/slow.wav?reduced=1'));
    await expect(page.locator('[data-waveform-state="loading"]')).toHaveCount(1);
    assert.equal(await page.locator('.audio-waveform-live span').first().evaluate(el=>getComputedStyle(el).animationName),'none','Reduced motion disables loading animation');
    await expect(page.locator('[data-waveform-state="ready"]')).toHaveCount(1);
    await page.evaluate(()=>window.show('/slow.wav?race=1'));
    await expect(page.locator('[data-waveform-state="loading"]')).toHaveCount(1);
    await page.evaluate(()=>window.show('/long.wav'));
    await expect(page.locator('[data-waveform-state="ready"]')).toHaveCount(1);
    await page.waitForTimeout(800);
    await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext',/00:03$/);
    const oldRequests=requests.filter(url=>url==='/slow.wav').length;
    await page.reload();await page.addStyleTag({path:path.join(out,'ui.css')});await page.addScriptTag({path:path.join(out,'ui.js')});
    await page.evaluate(()=>window.show('/slow.wav'));
    await expect(page.locator('[data-waveform-state="ready"]')).toHaveCount(1);
    assert.equal(requests.filter(url=>url==='/slow.wav').length,oldRequests,'Reload reuses persisted waveform peaks');
    await page.evaluate(()=>{localStorage.setItem('hymn-waveform:v2:/invalid-cache.wav',JSON.stringify({bars:new Array(512).fill(null),duration:1}));window.show('/invalid-cache.wav');});
    await expect(page.locator('[data-waveform-state="ready"]')).toHaveCount(1);
    assert(requests.includes('/invalid-cache.wav'),'Invalid stored peaks are regenerated');
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(out,'waveform-ready.png')});
    console.log('PASS waveform: real decoded peaks, animated loading to ready, shared fetch/cache, local upload reuse, failed-load recovery, two concurrent jobs, one offline decoder and reduced motion.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
