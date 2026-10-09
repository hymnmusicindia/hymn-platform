import { chromium, expect, type Route } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";

const directory="app/batch-upload-audit-preview";
function wav() {
  const data=Buffer.alloc(160044);
  data.write("RIFF"); data.writeUInt32LE(data.length-8,4); data.write("WAVEfmt ",8);
  data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22);
  data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34);
  data.write("data",36); data.writeUInt32LE(160000,40);
  for(let i=0;i<80000;i++) data.writeInt16LE(Math.round(Math.sin(i*.17)*(.08+.8*Math.pow(Math.sin(i/80000*Math.PI),2))*30000),44+i*2);
  return data;
}
async function main() {
  if(existsSync(directory)) throw new Error("Preview already exists");
  mkdirSync(directory); mkdirSync(".cache/batch-upload",{recursive:true});
  writeFileSync(`${directory}/page.tsx`, `"use client";
import {ReleaseForm} from "@/components/release-form";
import {SiteHeader} from "@/components/site-header";
import {PortalLayout} from "@/components/portal-layout";
import type {Release} from "@/lib/types";
const release={id:123,userId:1,releaseTitle:"Batch test",trackName:"",artistName:"Artist",releaseType:"ep",status:"draft",paymentStatus:"pending",audioUrl:"",artworkUrl:"",releaseDate:"",language:"English",platforms:[],createdAt:"2026-10-09",tracks:[]} as Release;
export default function Page(){return <div className="hymn-portal-root"><SiteHeader/><PortalLayout><main className="distribution-start-page"><section className="shell"><div><div><ReleaseForm selectedPlan="one_time" initialRelease={release} initialStage={0}/></div></div></section></main></PortalLayout></div>}`);
  const browser=await chromium.launch();
  try {
    for(const {width,height} of [{width:1440,height:900},{width:1280,height:620},{width:390,height:800},{width:320,height:568}]) {
      const page=await browser.newPage({viewport:{width,height},reducedMotion:"reduce"});
      const chunks:Route[]=[]; const starts:string[]=[];
      await page.route("**/api/**",async route=>{
        const req=route.request(),url=new URL(req.url());
        const json=(data:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
        if(url.pathname.includes("/chunks/")){chunks.push(route);return;}
        if(url.pathname==="/api/uploads/sessions" && req.method()==="POST") {
          const name=req.postDataJSON().originalFilename as string; starts.push(name);
          if(name==="broken.wav") return json({error:"Test upload rejected"},400);
          return json({session:{id:name,chunkSize:20000,totalChunks:1,uploadedChunks:[]},config:{retryLimit:1,maxConcurrency:1}});
        }
        if(url.pathname==="/api/uploads/sessions") return json({sessions:[],config:{chunkSize:20000}});
        if(url.pathname.endsWith("/complete")) return json({asset:{downloadPath:`/api/assets/${url.pathname.split("/")[4]}`}});
        if(url.pathname.startsWith("/api/assets/")) {
          const data=wav(),range=req.headers()["range"]?.match(/bytes=(\d+)-(\d*)/);
          if(range) {const start=Number(range[1]),end=Math.min(Number(range[2]||data.length-1),data.length-1);return route.fulfill({status:206,contentType:"audio/wav",headers:{"Accept-Ranges":"bytes","Content-Range":`bytes ${start}-${end}/${data.length}`},body:data.subarray(start,end+1)});}
          return route.fulfill({contentType:"audio/wav",headers:{"Accept-Ranges":"bytes"},body:data});
        }
        return json({artists:[],releases:[],draft:{id:123,updatedAt:"2026-10-09"}});
      });
      await page.goto(`${process.env.WORKSPACE_PREVIEW_URL || "http://localhost:3015"}/batch-upload-audit-preview`,{timeout:120000});
      await expect(page.locator(".release-batch-upload")).toBeVisible();
      await page.waitForFunction(()=>Object.keys(document.querySelector(".release-batch-upload")??{}).some(key=>key.startsWith("__reactProps$")));
      const transfer=await page.evaluateHandle(base64=>{
        const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)); const data=new DataTransfer();
        for(const name of ["first.wav","broken.wav","third.wav","fourth.wav","fifth.wav","sixth.wav","seventh.wav","eighth.wav"]) data.items.add(new File([bytes],name,{type:"audio/wav"}));
        return data;
      },wav().toString("base64"));
      await page.locator(".release-batch-upload").dispatchEvent("drop",{dataTransfer:transfer});
      await expect.poll(()=>starts.length).toBe(8);
      await expect.poll(()=>chunks.length).toBe(7); // Both transfers started before either completed.
      await expect(page.locator(".release-audio-queue-item.is-uploading")).toHaveCount(7);
      await expect(page.locator(".release-batch-upload strong")).toHaveText("Uploading…");
      const queue=page.locator(".release-audio-queue");
      await queue.evaluate(node=>{node.scrollTop=node.scrollHeight;});
      const assertSeparate=async()=> {
        const list=await queue.boundingBox();const actions=await page.locator(".release-focused-actions").boundingBox();
        expect(list!.y+list!.height).toBeLessThanOrEqual(actions!.y+1);
        if(width>=1024) expect(actions!.y+actions!.height).toBeLessThanOrEqual(height);
        expect(await queue.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
      };
      await assertSeparate();
      await page.screenshot({path:`.cache/batch-upload/uploading-${width}.png`});
      const center=await page.locator(".release-batch-upload").evaluate(node=>{const r=node.getBoundingClientRect(),a=node.querySelector("svg")!.getBoundingClientRect(),b=node.querySelector("span")!.getBoundingClientRect();return Math.abs((a.left+b.right)/2-(r.left+r.width/2));});
      expect(center).toBeLessThan(3);
      await page.getByRole("button",{name:"Remove empty track 2",exact:true}).click();
      for(const chunk of chunks) await chunk.fulfill({status:200,contentType:"application/json",body:"{}"});
      await expect(page.locator(".release-audio-queue-item.is-ready")).toHaveCount(7);
      await expect(page.locator(".release-batch-upload strong")).toHaveText("Add tracks");
      const rows=page.locator(".release-audio-queue-item");
      await expect(rows.nth(0)).toContainText("first.wav");await expect(rows.nth(1)).toContainText("third.wav");
      const wave=rows.first().getByRole("slider");
      await expect(rows.first().locator(".audio-waveform-live")).not.toHaveClass(/is-pending/,{timeout:15000});
      const heights=await rows.first().locator(".audio-waveform-live > span").evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
      expect(Math.max(...heights)-Math.min(...heights)).toBeGreaterThan(10);
      expect((await wave.boundingBox())!.width).toBeGreaterThan(width>=1024?140:100);
      await expect(wave).toHaveCSS("filter","none");
      await expect.poll(()=>rows.first().locator("audio").evaluate(node=>Number.isFinite(node.duration) && node.duration>0)).toBe(true);
      await rows.first().locator("audio").evaluate(async node=>{await node.play();node.pause();});
      await wave.focus();await page.keyboard.press("ArrowRight");await expect(wave).toHaveAttribute("aria-valuenow","50");
      await page.keyboard.press("Home");await expect(wave).toHaveAttribute("aria-valuenow","0");
      const footer=page.locator(".release-focused-actions");
      await expect(footer.getByRole("button",{name:"Back",exact:false})).toBeVisible();
      await expect(footer.getByRole("button",{name:"Continue to cover artwork",exact:true})).toBeVisible();
      await expect(footer.getByRole("button",{name:"Continue to cover artwork",exact:true})).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await queue.evaluate(node=>{node.scrollTop=node.scrollHeight;});
      await assertSeparate();
      await footer.scrollIntoViewIfNeeded();
      const next=footer.getByRole("button",{name:"Continue to cover artwork",exact:true});
      expect(await next.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
      await page.screenshot({path:`.cache/batch-upload/music-${width}.png`});
      await footer.getByRole("button",{name:"Continue to cover artwork",exact:true}).click();
      await expect(page.getByRole("heading",{name:"Prepare your cover artwork",exact:true})).toBeVisible();
      await expect(page.locator(".release-mobile-summary")).toHaveCount(0);
      await expect(page.locator(".release-workflow-nav > button")).toHaveCount(5);
      await expect(page.locator(".release-workflow-nav").getByRole("button",{name:/^(Artists|Music)$/})).toHaveCount(0);
      await expect(page.locator(".release-nav-complete")).toHaveCount(0);
      await page.close();
    }
    console.log("Batch upload passed: concurrent transfers, independent failure, stable row identity after removal, centered dropzone, and Back/Next at desktop/mobile widths.");
  } finally {await browser.close();unlinkSync(`${directory}/page.tsx`);rmdirSync(directory);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
