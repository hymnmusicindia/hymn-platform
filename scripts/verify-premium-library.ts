import { chromium, expect } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { resolve } from "node:path";

const fixtureDirectory=resolve("app/premium-ui-preview");
const fixtureFile=resolve(fixtureDirectory,"page.tsx");
const fixture=`import { AudioLibraryClient } from "@/components/audio-library-client";
import { DashboardFrame } from "@/components/dashboard-frame";
function Preview(){return <DashboardFrame title="Library" subtitle="Preview" activeKey="files" onSelect={()=>{}} navItems={[{key:"files",label:"My files",group:"Library"},{key:"releases",label:"My releases",group:"Distribution"},{key:"beats",label:"My beats",group:"Beatstore"}]}><AudioLibraryClient assets={[
{id:1,originalFilename:"apke master 1.wav",safeFilename:"master-1.wav",audioUrl:"/__library-test.wav",mimeType:"audio/wav",byteSize:320000,createdAt:"2026-10-09T10:00:00Z",released:false,coverArtUrl:null},
{id:2,originalFilename:"BAJENGE MASTER FINAL.wav",safeFilename:"master-2.wav",audioUrl:"/__library-test.wav",mimeType:"audio/wav",byteSize:320000,createdAt:"2026-10-03T10:00:00Z",released:true,coverArtUrl:null}
]}/><div><button className="btn-primary">Overview</button><button className="btn-outline">Requests</button></div></DashboardFrame>}
export default function Page(){return <div className="hymn-portal-root"><div className="hymn-portal"><Preview/></div></div>}`;

function wav() {
  const rate=16000, samples=rate*8;
  const buffer=Buffer.alloc(44+samples*2);
  buffer.write("RIFF",0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write("WAVEfmt ",8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write("data",36);buffer.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)buffer.writeInt16LE(Math.round(Math.sin(i/rate*Math.PI*440*2)*(.1+.7*Math.sin(i/samples*Math.PI)**2)*22000),44+i*2);
  return buffer;
}

async function main() {
  if(existsSync(fixtureDirectory))throw new Error("Preview fixture already exists; refusing to overwrite it.");
  mkdirSync(fixtureDirectory);writeFileSync(fixtureFile,'"use client";\n'+fixture);
  mkdirSync(".cache/library",{recursive:true});
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({reducedMotion:"reduce"});
    const audioBytes=wav();
    await page.route("**/__library-test.wav",route=>{
      const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),audioBytes.length-1):audioBytes.length-1;return route.fulfill({status:206,contentType:"audio/wav",headers:{"Accept-Ranges":"bytes","Content-Range":`bytes ${start}-${end}/${audioBytes.length}`},body:audioBytes.subarray(start,end+1)});}
      return route.fulfill({status:200,contentType:"audio/wav",headers:{"Accept-Ranges":"bytes"},body:audioBytes});
    });
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:900});
      await page.goto("http://localhost:3015/premium-ui-preview",{waitUntil:"domcontentloaded",timeout:120000});
      await expect(page.locator(".master-library-row")).toHaveCount(2);
      await page.waitForFunction(()=>Object.keys(document.querySelector(".audio-waveform-inline-play")??{}).some(key=>key.startsWith("__reactProps$")));
      await page.waitForFunction(()=>{const audio=document.querySelector("audio");return audio && Number.isFinite(audio.duration) && audio.duration>0 && !document.querySelector(".audio-waveform-live")?.classList.contains("is-pending");});
      if(width>1024){
        await page.getByRole("button",{name:"Distribution",exact:true}).click();
        await expect(page.getByRole("button",{name:"Library",exact:true})).toHaveAttribute("aria-expanded","false");
        await expect(page.getByRole("button",{name:"Distribution",exact:true})).toHaveAttribute("aria-expanded","true");
        await page.getByRole("button",{name:"Beatstore",exact:true}).click();
        await expect(page.getByRole("button",{name:"Distribution",exact:true})).toHaveAttribute("aria-expanded","false");
        await page.getByRole("button",{name:"Library",exact:true}).click();
        await expect(page.getByRole("button",{name:"Beatstore",exact:true})).toHaveAttribute("aria-expanded","false");
      }
      const first=page.locator(".master-library-row").first();
      const title=await first.locator(".master-library-file").boundingBox();
      const preview=await first.locator(".master-library-preview").boundingBox();
      if(width>1000)expect(preview!.x).toBeGreaterThanOrEqual(title!.x+title!.width);
      else expect(preview!.y).toBeGreaterThanOrEqual(title!.y+title!.height);
      expect(await page.locator(".master-library").evaluate(element=>getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      const action=page.getByRole("button",{name:"Requests",exact:true});
      expect(await action.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      expect(await action.evaluate(element=>getComputedStyle(element).borderTopWidth)).toBe("0px");
      await page.getByRole("button",{name:"Play apke master 1.wav",exact:true}).click();
      await expect(page.getByRole("button",{name:"Pause apke master 1.wav",exact:true})).toBeVisible();
      await page.getByRole("button",{name:"Pause apke master 1.wav",exact:true}).click();
      await expect(page.getByRole("button",{name:"Play apke master 1.wav",exact:true})).toBeVisible();
      await first.getByRole("slider").focus();await page.keyboard.press("ArrowRight");
      await expect(first.getByRole("slider")).not.toHaveAttribute("aria-valuenow","0");
      await page.getByRole("button",{name:"Actions for apke master 1.wav",exact:true}).click();
      await expect(page.getByRole("link",{name:"Download",exact:true})).toHaveAttribute("href",/download=1/);
      await expect(page.getByRole("link",{name:"Use in release",exact:true})).toHaveAttribute("href","/distribution/start?audioAssetId=1");
      await page.keyboard.press("Escape");
      await page.getByRole("textbox",{name:"Search audio library"}).fill("BAJENGE");
      await expect(page.locator(".master-library-row")).toHaveCount(1);
      await page.getByRole("textbox",{name:"Search audio library"}).fill("");
      const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      await page.screenshot({path:`.cache/library/library-${width}.png`,fullPage:true});
    }
    console.log("Library passed: desktop/mobile layout, no overlap, playback, seeking, search, download and release actions, and text buttons.");
  } finally {await browser.close();unlinkSync(fixtureFile);rmdirSync(fixtureDirectory);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
