import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function main() {
  const browser = await chromium.launch({headless:true});
  mkdirSync(".cache/landing", {recursive:true});
  try {
    const page=await browser.newPage({reducedMotion:"reduce"});
    const errors:string[]=[];
    page.on("pageerror",error=>errors.push(error.message));
    for(const width of [1440,320,390,768]) {
      await page.setViewportSize({width,height:1000});
      await page.goto(process.env.LANDING_PREVIEW_URL || "http://localhost:3015", {waitUntil:"domcontentloaded",timeout:120000});
      await expect(page.locator(".landing-hero h1")).toContainText("Where Artists Become Movements");
      await expect(page.locator(".landing-service")).toHaveCount(3);
      await page.waitForFunction(() => Object.keys(document.querySelector(".studio-header-section button") ?? {}).some(key=>key.startsWith("__reactProps$")));
      await expect(page.locator(".landing-workspace")).toHaveAttribute("data-navigation-ready","true");
      await expect(page.locator(".hymn-studio-header")).toHaveCount(1);
      await expect(page.locator(".landing-rail a[href^='#']")).toHaveCount(0);
      await expect(page.locator(".landing-rail").getByRole("link",{name:"My releases",exact:true})).toHaveAttribute("href","/dashboard/releases");
      await expect(page.locator(".landing-rail").getByRole("link",{name:"Trends",exact:true})).toHaveAttribute("href","/analytics");
      await expect(page.locator(".landing-rail").getByRole("link",{name:"Home",exact:true})).toHaveAttribute("href","/");
      await expect(page.locator(".landing-rail").getByRole("button",{name:"Home",exact:true})).toHaveCount(0);
      expect(await page.locator(".landing-new").evaluate(node=>getComputedStyle(node).borderTopWidth)).toBe("1px");
      const selection=await page.locator(".workspace-home-link.is-active").evaluate(element=>({background:getComputedStyle(element).backgroundColor,shadow:getComputedStyle(element).textShadow}));
      expect(selection.background).toBe("rgba(0, 0, 0, 0)");
      expect(selection.shadow).toBe("none");
      if(width<1024) await page.getByRole("button",{name:"Toggle service navigation"}).click();
      await page.locator(".landing-rail").getByRole("button",{name:"Beatstore",exact:true}).click();
      await expect(page.locator(".landing-rail").getByRole("button",{name:"Distribution",exact:true})).toHaveAttribute("aria-expanded","false");
      await expect(page.locator(".landing-rail").getByRole("button",{name:"Beatstore",exact:true})).toHaveAttribute("aria-expanded","true");
      await expect(page.locator(".landing-rail").getByRole("link",{name:"My releases",exact:true})).toBeHidden();
      await page.locator(".landing-rail").getByRole("button",{name:"Distribution",exact:true}).click();
      await expect(page.locator(".landing-rail").getByRole("button",{name:"Beatstore",exact:true})).toHaveAttribute("aria-expanded","false");
      if(width<1024) await page.locator(".landing-rail").getByRole("button",{name:"Close navigation",exact:true}).click();
      for(const id of ["journey","producers","released","artists","beats","newsletter"]) await expect(page.locator(`#${id}`)).toHaveCount(1);
      if(width<1024) {
        const cta=page.locator(".landing-hero-copy > a");
        expect(await cta.locator("span:not([aria-hidden]) > span").first().evaluate(node=>node.getBoundingClientRect().width)).toBeGreaterThan(150);
      }
      const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      if(width<1024) {
        await page.getByRole("button",{name:"Toggle service navigation"}).click();
        await expect(page.locator(".landing-rail")).toHaveClass(/is-open/);
        await expect(page.locator(".landing-rail")).toBeVisible();
        await page.locator(".landing-rail").getByRole("button",{name:"Close navigation",exact:true}).click();
        await expect(page.locator(".landing-rail")).not.toHaveClass(/is-open/);
        await expect(page.getByRole("button",{name:"Open menu",exact:true})).toHaveCount(0);
        await expect(page.locator(".mobile-login-link")).toBeVisible();
        const subheader=await page.locator(".mobile-workspace-subheader button").boundingBox();
        expect(Math.abs(subheader!.x + subheader!.width / 2 - width / 2)).toBeLessThan(2);
        await page.evaluate(()=>window.scrollTo(0,0));
      } else {
        await page.getByRole("button",{name:"Toggle service navigation"}).click();
        await expect(page.locator(".landing-workspace")).toHaveClass(/rail-collapsed/);
        await page.getByRole("button",{name:"Toggle service navigation"}).click();
        await expect(page.locator(".landing-workspace")).not.toHaveClass(/rail-collapsed/);
      }
      await page.screenshot({path:`.cache/landing/home-${width}.png`,fullPage:true});
      await page.evaluate(()=>{document.documentElement.style.scrollBehavior="auto";window.scrollTo({top:0,behavior:"instant"});});
      await page.waitForFunction(()=>window.scrollY===0);
      await page.screenshot({path:`.cache/landing/home-top-${width}.png`});
    }
    expect(errors).toEqual([]);
    console.log("Landing page passed: LANDR-style header, functional service destinations, text-only selection, desktop/mobile navigation, preserved sections, and overflow.");
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
