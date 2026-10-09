import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function main() {
  const browser = await chromium.launch({ headless:true });
  mkdirSync(".cache/overlays", { recursive:true });
  try {
    const page = await browser.newPage({ reducedMotion:"reduce" });
    const errors:string[]=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/api/beats",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({beats:[{id:123,title:"Night drive",producerName:"HYMN Producer",artworkUrl:null}]})}));
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:800});
      await page.goto((process.env.WORKSPACE_PREVIEW_URL || "http://localhost:3015")+"/faq",{waitUntil:"domcontentloaded",timeout:120000});
      await expect(page.getByRole("textbox",{name:"Search FAQ"})).toBeVisible();
      await page.waitForFunction(()=>Object.keys(document.querySelector(".portal-new-button")??{}).some(key=>key.startsWith("__reactProps$")));
      if(width<1024) await page.getByRole("button",{name:"Toggle service navigation"}).click();
      const newButton=page.locator(".portal-new-button");
      await newButton.click();
      const create=page.getByRole("dialog",{name:"Create something new"});
      await expect(create).toBeVisible();
      expect(await create.evaluate(node=>node.parentElement?.parentElement===document.body)).toBe(true);
      expect(await create.evaluate(node=>{const rect=node.getBoundingClientRect();return document.elementFromPoint(rect.x+32,rect.y+32)?.closest("#portal-create-menu")===node;})).toBe(true);
      const links=create.locator("a");
      await expect(links).toHaveCount(4);
      await expect(create.getByRole("link",{name:/Music release/})).toHaveAttribute("href","/distribution/start");
      await expect(create.getByRole("link",{name:/Find a beat/})).toHaveAttribute("href","/beat-store");
      const bounds=await create.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(800);
      await links.last().focus();await page.keyboard.press("Tab");
      await expect(create.getByRole("button",{name:"Close create menu"})).toBeFocused();
      await page.screenshot({path:`.cache/overlays/create-${width}.png`});
      await page.keyboard.press("Escape");await expect(create).toBeHidden();await expect(newButton).toBeFocused();
      await newButton.click();
      await page.getByRole("button",{name:"Dismiss create menu",exact:true}).click({position:{x:width-8,y:790}});
      await expect(create).toBeHidden();
      if(width<1024) await page.getByRole("button",{name:"Close workspace navigation",exact:true}).click();
      await page.evaluate(()=>{localStorage.removeItem("hymn-beat-cart");window.dispatchEvent(new Event("hymn-cart-updated"));});
      const cartButton=page.getByRole("button",{name:"Shopping cart, empty",exact:true});
      await cartButton.click();
      const cart=page.getByRole("dialog",{name:"Shopping cart",exact:true});
      await expect(cart).toBeVisible();
      await expect(cart.getByText("Your cart is empty",{exact:true})).toBeVisible();
      await expect(cart.getByRole("link",{name:"Browse beats"})).toHaveAttribute("href","/beat-store");
      expect(await cart.evaluate(node=>{const rect=node.getBoundingClientRect();return document.elementFromPoint(rect.x+32,32)?.closest(".site-cart-drawer")===node;})).toBe(true);
      expect(await cart.evaluate(node=>getComputedStyle(node).getPropertyValue("--text").trim())).toBe("#f5f7fa");
      await cart.getByRole("link",{name:"Browse beats"}).focus();await page.keyboard.press("Tab");await expect(cart.getByRole("button",{name:"Close cart",exact:true})).toBeFocused();
      await page.screenshot({path:`.cache/overlays/cart-empty-${width}.png`});
      await page.keyboard.press("Escape");await expect(cart).toBeHidden();await expect(cartButton).toBeFocused();
      await page.evaluate(()=>{localStorage.setItem("hymn-beat-cart",JSON.stringify([{beatId:123,licenseType:"basic",price:1500}]));window.dispatchEvent(new Event("hymn-cart-updated"));});
      await page.getByRole("button",{name:"Shopping cart, 1 item",exact:true}).click();
      await expect(cart.getByText("Night drive",{exact:true})).toBeVisible();
      await expect(cart.getByRole("link",{name:"Continue to checkout"})).toHaveAttribute("href","/checkout?product=beatstore");
      await expect(cart.locator(".site-cart-drawer-footer strong")).toContainText("1,500");
      await page.screenshot({path:`.cache/overlays/cart-filled-${width}.png`});
      await cart.getByRole("button",{name:"Remove",exact:true}).click();
      await expect(cart.getByText("Your cart is empty",{exact:true})).toBeVisible();
      expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("hymn-beat-cart") || "[]").length)).toBe(0);
      await cart.getByRole("button",{name:"Close cart",exact:true}).click();
      await expect(cart).toBeHidden();
      expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe("hidden");
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    expect(errors).toEqual([]);
    console.log("Overlay checks passed: header/search layering, dark cart theme, desktop/mobile bounds, keyboard focus, Escape, cart removal/total, and destination links.");
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
