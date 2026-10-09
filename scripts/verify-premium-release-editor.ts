import { chromium, expect } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";

const directory="app/premium-editor-audit-preview";
async function main() {
  if(existsSync(directory)) throw new Error("Preview already exists");
  mkdirSync(directory); mkdirSync(".cache/release-editor",{recursive:true});
  writeFileSync(`${directory}/page.tsx`,`"use client";
import {useSearchParams} from "next/navigation";
import {ReleaseForm} from "@/components/release-form";
import {SiteHeader} from "@/components/site-header";
import {PortalLayout} from "@/components/portal-layout";
import type {Release} from "@/lib/types";
const release={id:123,userId:1,releaseTitle:"Night drive",trackName:"Night drive",artistName:"Artist",releaseType:"single",status:"draft",paymentStatus:"pending",audioUrl:"",artworkUrl:"",releaseDate:"",language:"English",platforms:[],createdAt:"2026-10-09",tracks:[]} as Release;
export default function Page(){const stage=Number(useSearchParams().get("stage"));return <div className="hymn-portal-root"><SiteHeader/><PortalLayout><main className="distribution-start-page"><section className="shell"><div><div><ReleaseForm selectedPlan="one_time" initialRelease={release} initialStage={stage}/></div></div></section></main></PortalLayout></div>}`);
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage({reducedMotion:"reduce"});const errors:string[]=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({artists:[],releases:[],sessions:[],draft:{id:123,updatedAt:"2026-10-09"}})}));
    for(const {width,height} of [{width:1440,height:900},{width:1280,height:620},{width:390,height:800}]) {
      await page.setViewportSize({width,height});
      for(const stage of [4,3,2,5,7]) {
        await page.goto(`${process.env.WORKSPACE_PREVIEW_URL || "http://localhost:3015"}/premium-editor-audit-preview?stage=${stage}`,{timeout:120000});
        const form=page.locator(`.release-premium-editor[data-editor-stage='${stage}']`);
        await expect(form).toBeVisible();
        await page.waitForFunction(()=>Object.keys(document.querySelector(".release-premium-editor")??{}).some(key=>key.startsWith("__reactProps$")));
        const panels=form.locator(".release-editor-panels");
        expect((await panels.boundingBox())!.height).toBeGreaterThan(100);
        await expect(form.locator(".release-mobile-summary")).toHaveCount(0);
        await expect(form.locator(".release-workflow-nav > button")).toHaveCount(5);
        if(width>=1024 && stage!==7) {
          const bounds=await form.locator(".release-footer-mobile-actions").boundingBox();
          expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(height);
          const area=await panels.boundingBox();expect(area!.y+area!.height).toBeLessThanOrEqual(bounds!.y+1);
        }
        if(stage===3) {
          const title=page.getByPlaceholder("Track title",{exact:true});
          await expect(title).toBeVisible();await title.fill("Midnight session");await expect(title).toHaveValue("Midnight session");
        }
        if(stage===5) {
          await expect(form.locator(".release-rights-stage").getByText("Master rights",{exact:true})).toBeVisible();
          const rights=form.locator(".release-rights-stage input").first();await rights.fill("HYMN Artist");await expect(rights).toHaveValue("HYMN Artist");
          await expect(form.locator(".legal-declaration-details")).toBeVisible();
        }
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        if(width<1024) {
          const sizes=await form.locator("input:not([type='checkbox']):not([type='file']):visible").evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)));
          expect(sizes.every(size=>size>=16)).toBe(true);
        }
        await panels.evaluate(node=>{node.scrollTop=0;});
        await page.screenshot({path:`.cache/release-editor/stage-${stage}-${width}.png`});
        if(stage===4) {
          await form.locator(".release-artwork-stage input[type='file']").setInputFiles({name:"invalid.png",mimeType:"image/png",buffer:Buffer.from("invalid artwork")});
          await expect(form.locator(".release-artwork-stage .inline-error")).toBeVisible();
          await expect(form).toHaveAttribute("data-editor-stage","4");
        }
        if(stage===7) {
          const confirmation=form.locator(".review-confirmation input[type='checkbox']");
          await confirmation.check();await expect(confirmation).toBeChecked();
          await confirmation.uncheck();await expect(confirmation).not.toBeChecked();
        }
      }
    }
    expect(errors).toEqual([]);
    console.log("Premium editor passed: all five stages at desktop, short laptop, and mobile sizes; fields, rights, navigation, footer separation, and overflow.");
  } finally {await browser.close();unlinkSync(`${directory}/page.tsx`);rmdirSync(directory);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
