import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function main() {
  const browser = await chromium.launch();
  mkdirSync(".cache/subscriptions", { recursive: true });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let eligibility: Record<string, unknown> = { authenticated:false, eligible:false, reason:"authentication_required" };
    let eligibilityStatus = 200;
    await page.route("**/api/promotions/first-release",route=>route.fulfill({status:eligibilityStatus,contentType:"application/json",body:JSON.stringify(eligibility)}));
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      await page.goto(`${process.env.WORKSPACE_PREVIEW_URL || "http://localhost:3015"}/faq`, { timeout: 120000 });
      let trigger = page.locator(".studio-header-plans");
      await expect(trigger).toHaveText("Subscriptions");
      await page.waitForFunction(() => Object.keys(document.querySelector(".studio-header-plans") ?? {}).some(key => key.startsWith("__reactProps$")));
      if(width < 1024) {
        await page.getByRole("button",{name:"Toggle service navigation",exact:true}).filter({visible:true}).click();
        await page.locator("#workspace-navigation").getByRole("button",{name:"Distribution",exact:true}).click();
        trigger=page.locator('[data-nav-key="plans"]');
      }
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Subscriptions", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Your first release on us.", { exact: true })).toBeVisible();
      await expect(dialog.locator(".distribution-plan-card")).toHaveCount(3);
      const banner=dialog.locator(".subscription-first-release");
      expect((await banner.boundingBox())!.height).toBeLessThan(width >= 1024 ? 125 : 260);
      await expect(banner.locator(".is-gift")).toBeVisible();
      const start=banner.getByRole("link",{name:"Start free"});
      expect(await start.evaluate(node=>getComputedStyle(node).borderBottomWidth)).toBe("0px");
      expect(await start.evaluate(node=>getComputedStyle(node).textDecorationLine)).toBe("none");
      expect(await banner.locator("svg").first().evaluate(node=>getComputedStyle(node).animationName)).toBe("none");
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(850);
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const cards = dialog.locator(".distribution-plan-card");
      if(width >= 1024) for(const action of await dialog.locator(".subscription-plan-action").all()) {
        const bounds=(await action.boundingBox())!;expect(bounds.y+bounds.height).toBeLessThanOrEqual(850);
      }
      for (let index = 0; index < 3; index++) {
        const card = cards.nth(index);
        await card.scrollIntoViewIfNeeded();
        expect((await card.boundingBox())!.width).toBeGreaterThan(200);
        await expect(card.getByRole("link")).toHaveAttribute("href", ["/checkout?product=subscription-half_yearly", "/checkout?product=subscription-yearly", "/checkout?product=subscription-yearly_plus"][index]);
      }
      await dialog.locator("summary").click();
      await expect(dialog.getByText("Release planning guidance",{exact:true})).toBeVisible();
      await dialog.locator("summary").click();
      await dialog.locator(".subscription-dialog-content").evaluate(node => { node.scrollTop = 0; });
      await page.screenshot({ path: `.cache/subscriptions/options-${width}.png` });
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      if(width >= 1024) await expect(trigger).toBeFocused();
      if(width < 1024) await page.getByRole("button",{name:"Toggle service navigation",exact:true}).filter({visible:true}).click();
      await trigger.click();
      await dialog.getByRole("button", { name: "Close subscriptions" }).click();
      await expect(dialog).not.toBeVisible();
    }
    await page.setViewportSize({width:1440,height:760});
    for(const scenario of [
      {eligible:true,reason:"available",state:"gift",href:"/distribution/start?campaign=first-release"},
      {eligible:false,reason:"already_redeemed",state:"one-time",href:"/distribution/start"},
      {eligible:false,reason:"release_already_submitted",state:"one-time",href:"/distribution/start"},
      {eligible:false,reason:"reserved",state:"reserved",href:"/dashboard/releases"},
      {eligible:false,reason:"promotion_exhausted",state:"one-time",href:"/distribution/start"}
    ]) {
      eligibility={authenticated:true,eligible:scenario.eligible,reason:scenario.reason};
      await page.locator(".studio-header-plans").click();
      const banner=page.locator(".subscription-first-release");await expect(banner).toHaveAttribute("data-offer",scenario.state);
      await expect(banner.getByRole("link")).toHaveAttribute("href",scenario.href);
      if(scenario.state === "one-time") { await expect(banner.getByText("Not ready for a subscription?",{exact:true})).toBeVisible();await expect(banner.locator(".is-lightning")).toBeVisible(); }
      await page.screenshot({path:`.cache/subscriptions/state-${scenario.reason}.png`});
      await page.keyboard.press("Escape");
    }
    eligibilityStatus=503;
    await page.locator(".studio-header-plans").click();
    await expect(page.locator(".subscription-first-release")).toHaveAttribute("data-offer","unverified");
    await expect(page.getByRole("dialog",{name:"Subscriptions",exact:true}).locator(".distribution-plan-card")).toHaveCount(3);
    await page.keyboard.press("Escape");
    eligibilityStatus=200;eligibility={authenticated:true,eligible:true,reason:"available"};
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.locator(".studio-header-plans").click();await expect(page.locator(".subscription-first-release")).toHaveAttribute("data-offer","gift");
    expect(await page.locator(".subscription-offer-icon > svg").evaluate(node=>getComputedStyle(node).animationName)).toBe("subscription-gift-lift");
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
    console.log("Subscription checks passed: four screen sizes, compact banner, eligibility states, offer/checkout links, complete feature comparison, keyboard controls, animated icon and reduced motion.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
