import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function main() {
  const browser = await chromium.launch();
  mkdirSync(".cache/subscriptions", { recursive: true });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
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
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(850);
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const cards = dialog.locator(".distribution-plan-card");
      for (let index = 0; index < 3; index++) {
        const card = cards.nth(index);
        await card.scrollIntoViewIfNeeded();
        expect((await card.boundingBox())!.width).toBeGreaterThan(200);
        await expect(card.getByRole("link")).toHaveAttribute("href", ["/checkout?product=subscription-half_yearly", "/checkout?product=subscription-yearly", "/checkout?product=subscription-yearly_plus"][index]);
      }
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
    expect(errors).toEqual([]);
    console.log("Subscription popup passed at 1440, 768, 390 and 320px: options, checkout links, bounds, keyboard dismissal and focus restoration.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
