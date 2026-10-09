import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function main() {
  const browser = await chromium.launch({headless:true});
  mkdirSync(".cache/landing", {recursive:true});
  try {
    const page=await browser.newPage({reducedMotion:"reduce"});
    const errors:string[]=[];
    page.on("pageerror",error=>errors.push(error.message));
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      await page.goto(process.env.LANDING_PREVIEW_URL || "http://localhost:3015", {waitUntil:"domcontentloaded",timeout:120000});
      await expect(page.locator(".landing-hero h1")).toContainText("Where Artists Become Movements");
      await expect(page.locator(".landing-service")).toHaveCount(3);
      await page.waitForFunction(() => Object.keys(document.querySelector(".landing-group-title") ?? {}).some(key=>key.startsWith("__reactProps$")));
      for(const id of ["journey","producers","released","artists","beats","newsletter"]) await expect(page.locator(`#${id}`)).toHaveCount(1);
      const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      if(width<1024) {
        await page.getByRole("button",{name:"Explore HYMN"}).click();
        await expect(page.locator(".landing-rail")).toBeVisible();
        await page.locator(".landing-rail").getByRole("link",{name:"Discover beats",exact:true}).click();
        await expect(page.locator(".landing-rail")).not.toHaveClass(/is-open/);
        await page.evaluate(()=>window.scrollTo(0,0));
      } else {
        await page.getByRole("button",{name:"Distribution",exact:true}).click();
        await expect(page.locator(".landing-rail").getByRole("link",{name:"Your release journey"})).toHaveCount(0);
        await page.getByRole("button",{name:"Distribution",exact:true}).click();
      }
      await page.screenshot({path:`.cache/landing/home-${width}.png`,fullPage:true});
      await page.evaluate(()=>{document.documentElement.style.scrollBehavior="auto";window.scrollTo({top:0,behavior:"instant"});});
      await page.waitForFunction(()=>window.scrollY===0);
      await page.screenshot({path:`.cache/landing/home-top-${width}.png`});
    }
    expect(errors).toEqual([]);
    console.log("Landing page passed: desktop/mobile, service links, preserved sections, navigation, and overflow.");
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
