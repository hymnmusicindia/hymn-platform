import { chromium, expect } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve("app/workspace-audit-preview");
const fixture = `"use client";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { PortalLayout } from "@/components/portal-layout";
import { ReleaseForm } from "@/components/release-form";
import { ReleasePortal } from "@/components/release-portal";
import { SplitsDashboard } from "@/components/splits-dashboard";
import type { Release } from "@/lib/types";
const release = {id:123,userId:1,releaseTitle:"Night drive",trackName:"Night drive",artistName:"HYMN Artist",releaseType:"single",status:"draft",paymentStatus:"pending",audioUrl:"",artworkUrl:"",releaseDate:"",language:"English",platforms:[],createdAt:"2026-10-09T10:00:00Z",tracks:[]} as Release;
export default function Page() { const screen=useSearchParams().get("screen");return <div className="hymn-portal-root"><SiteHeader user={{sub:1,name:"HYMN Artist",email:"test@example.com",role:"customer",avatarUrl:"/assets/hymnlogowhite.png"}}/><PortalLayout>{screen==="submit"?<main className="distribution-start-page"><section className="shell"><div><div><ReleaseForm userName="Artist" selectedPlan="one_time"/></div></div></section></main>:screen==="splits"?<section className="customer-module-section"><SplitsDashboard releases={[release]}/></section>:<ReleasePortal releases={[release]}/>}</PortalLayout></div> }`;

async function main() {
  if(existsSync(directory)) throw new Error("Refusing to overwrite an existing preview.");
  mkdirSync(directory); writeFileSync(resolve(directory,"page.tsx"),fixture);
  mkdirSync(".cache/page-audit",{recursive:true});
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({reducedMotion:"reduce"});
    const errors:string[]=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/**", async route=> {
      const path=new URL(route.request().url()).pathname;
      const data=path==="/api/splits"?{created:[],received:[],requests:[],earnings:[]}:path==="/api/artists"?{artists:[]}:path==="/api/notifications"?{notifications:[],unreadCount:0}:path==="/api/account/presence"?{presence:"online"}:path==="/api/distribution/queue"?{releases:[]}:{credential:null};
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
    });
    const base=process.env.WORKSPACE_PREVIEW_URL || "http://localhost:3015";
    for(const width of [1440,320,390,768]) {
      await page.setViewportSize({width,height:800});
      for(const path of ["/faq","/distribution","/about","/mission","/policies","/contact","/login","/services","/partnership-program","/privacy-policy","/terms-of-service"]) {
        await page.goto(base+path,{waitUntil:"domcontentloaded",timeout:120000});
        await expect(page.locator(".hymn-public-workspace .portal-workspace")).toBeVisible();
        await expect(page.locator(".hymn-studio-header")).toHaveCount(1);
        await expect(page.getByText("Loading page…",{exact:true})).toBeHidden({timeout:30000});
        await expect(page.locator(".portal-page-content > main")).toBeVisible();
        const theme=await page.locator(".hymn-public-workspace").evaluate(node=>getComputedStyle(node).getPropertyValue("--text").trim());
        expect(theme).toBe("#f5f7fa");
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        if(path==="/faq") {
          await page.waitForFunction(()=>Object.keys(document.querySelector("input[aria-label='Search FAQ']") ?? {}).some(key=>key.startsWith("__reactProps$")));
          await page.getByRole("textbox",{name:"Search FAQ"}).fill("Google authentication");
          await expect(page.locator(".faq-article")).toHaveCount(1);
          await page.locator(".faq-article button").click();
          await expect(page.locator(".faq-article [role='region']")).toBeVisible();
        }
        if(path==="/distribution") await expect(page.locator(".distribution-plan-card")).toHaveCount(3);
        await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
        await page.screenshot({path:`.cache/page-audit/${path.slice(1)}-${width}.png`});
      }
      for(const screen of ["catalogue","splits","submit"]) {
        await page.goto(base+"/workspace-audit-preview?screen="+screen,{waitUntil:"domcontentloaded",timeout:120000});
        await expect(page.getByRole("button",{name:"Your profile",exact:true})).toBeVisible();
        await page.waitForFunction(()=>Object.keys(document.querySelector("[data-profile-menu-root] button") ?? {}).some(key=>key.startsWith("__reactProps$")));
        await page.getByRole("button",{name:"Your profile",exact:true}).click();
        await expect(page.getByRole("menuitem",{name:"Contact HYMN",exact:true})).toHaveAttribute("href","/contact");
        await expect(page.locator(".profile-avatar-image img:visible")).toHaveCSS("max-height","none");
        await expect.poll(async()=> (await page.locator(".profile-avatar-image img:visible").boundingBox())?.width ?? 0).toBeGreaterThan(30);
        const avatar=await page.locator(".profile-avatar-image img:visible").evaluate(node=>{const rect=node.getBoundingClientRect();return {width:rect.width,height:rect.height,max:getComputedStyle(node).maxHeight};});
        expect(avatar.width).toBeGreaterThan(30);
        expect(avatar.width).toBe(avatar.height);expect(avatar.max).toBe("none");
        await page.keyboard.press("Escape");
        if(screen==="catalogue") {
          await expect(page.locator(".draft-readiness li")).toHaveCount(3);
          if(width>1024) {
            const select=page.locator(".release-filter-control select:visible").first();
            expect(await select.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
            await select.selectOption("draft");
          }
        }
        if(screen==="splits") {
          await page.getByRole("button",{name:/^join$/i}).click();
          await expect(page.getByPlaceholder("HYMN-8F3K2Q")).toBeVisible();
          await page.getByRole("button",{name:/^requests$/i}).click();
          await expect(page.getByText("No pending split requests.", {exact:true})).toBeVisible();
        }
        if(screen==="submit") {
          await expect(page.locator(".release-journey-intro")).toBeVisible();
          const start=page.getByRole("button",{name:"Start your release",exact:false});
          if(width>1024) {
            const bounds=await start.boundingBox();expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(800);
            expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(801);
          }
          await page.screenshot({path:`.cache/page-audit/submission-intro-${width}.png`});
          if(width>1024) {
            await page.setViewportSize({width:1280,height:620});
            const compact=await start.boundingBox();expect(compact!.y+compact!.height).toBeLessThanOrEqual(620);
            expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(621);
            await page.screenshot({path:".cache/page-audit/submission-compact.png"});
            await page.setViewportSize({width,height:800});
          }
          await start.click();
          await expect(page.locator(".release-workflow")).toBeVisible();
        }
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.screenshot({path:`.cache/page-audit/${screen}-${width}.png`});
      }
    }
    expect(errors).toEqual([]);
    console.log("Workspace audit passed: eleven public destinations, FAQ search, plans, avatar/contact menu, catalogue controls, royalty split tabs, and viewport-fit submission entry on desktop/mobile.");
  } finally { await browser.close();unlinkSync(resolve(directory,"page.tsx"));rmdirSync(directory); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
