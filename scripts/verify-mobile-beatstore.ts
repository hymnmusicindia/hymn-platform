import { chromium, expect } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";

const directory="app/mobile-beat-audit-preview";
async function main() {
  if(existsSync(directory)) throw new Error("Preview already exists");
  mkdirSync(directory);
  writeFileSync(`${directory}/page.tsx`, `"use client";
import {SiteHeader} from "@/components/site-header";
import {PortalLayout} from "@/components/portal-layout";
import {BeatStoreExperience} from "@/components/beat-store-experience";
import {BeatPreviewPlayerProvider} from "@/components/beat-preview-player";
const beats=[{id:987,producerId:1,producerName:"HYMN",title:"Night drive",bpm:100,genre:"Hip Hop",mood:"Chill",price:500,fileUrl:"",previewUrl:"",enabled:true,status:"PUBLISHED",createdAt:"2026-10-09"}];
export default function Page(){return <BeatPreviewPlayerProvider><div className="hymn-portal-root"><SiteHeader user={null}/><PortalLayout><BeatStoreExperience beats={beats}/></PortalLayout></div></BeatPreviewPlayerProvider>}`);
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage({reducedMotion:"reduce"});
    await page.route("**/api/**",route=>route.fulfill({status:200,contentType:"application/json",body:"{}"}));
    for(const width of [320,390,768]) {
      await page.setViewportSize({width,height:800});
      await page.goto(`${process.env.WORKSPACE_PREVIEW_URL || "http://localhost:3015"}/mobile-beat-audit-preview`,{timeout:120000});
      const finder=page.getByRole("button",{name:"Find my beat",exact:true});
      await expect(finder).toBeVisible();
      await finder.click();
      const dialog=page.locator(".customer-overlay [role='dialog']");
      await expect(dialog).toBeVisible();
      const bounds=await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(800);
      expect(await dialog.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+20,r.y+20));})).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await page.getByRole("button",{name:"Filters",exact:true}).click();
      await expect(page.getByRole("dialog",{name:"Refine the catalog"})).toBeVisible();
      await page.getByRole("button",{name:"Close filters",exact:true}).last().click();
      await page.getByRole("button",{name:/120$/,exact:true}).click();
      await expect(page.getByRole("dialog",{name:"Licence Night drive"})).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".customer-overlay")).toHaveCount(0);
      expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    console.log("Mobile Beatstore passed at 320, 390 and 768px: finder bounds, stacking, Escape, filters, and overflow.");
  } finally {await browser.close();unlinkSync(`${directory}/page.tsx`);rmdirSync(directory);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
