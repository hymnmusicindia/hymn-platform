const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { build } = require("esbuild");
const { textContrast } = require("./lib/text-contrast.cjs");
const { chromium, expect } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

async function main() {
  const output = await fs.mkdtemp(path.resolve(".cache/header-theme-"));
  await build({
    stdin: {
      contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {SiteHeader} from "./components/site-header"; createRoot(document.getElementById("root")).render(<SiteHeader user={{sub:7,email:"ada@example.com",name:"Ada Artist",role:"customer",avatarUrl:null}} />);',
      loader: "tsx",
      resolveDir: process.cwd()
    },
    bundle: true,
    outfile: path.join(output, "header.js"),
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "next-fixture", setup(builder) {
      builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /^next\/link$/, namespace: "fixture" }, () => ({ contents: 'import React from "react"; export default function Link({children,...props}){return React.createElement("a",props,children)}', resolveDir: process.cwd() }));
      builder.onLoad({ filter: /^next\/image$/, namespace: "fixture" }, () => ({ contents: 'import React from "react"; export default function Image({fill,unoptimized,priority,fetchPriority,...props}){return React.createElement("img",props)}', resolveDir: process.cwd() }));
      builder.onLoad({ filter: /^next\/navigation$/, namespace: "fixture" }, () => ({ contents: 'export const useSearchParams=()=>new URLSearchParams(); export const usePathname=()=>"/"; export const useRouter=()=>({push(){},refresh(){}});' }));
    } }]
  });
  const css = await postcss([tailwind(path.resolve("tailwind.config.ts"))]).process(await fs.readFile("app/globals.css", "utf8"), { from: path.resolve("app/globals.css") });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 700 } });
    const updates = [];
    await page.route("https://hymn.local/", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    await page.route("**/api/account/presence", async route => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        updates.push(body);
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ presence: "online" }) });
    });
    await page.route("**/api/notifications**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ unreadCount: 2, notifications: [] }) }));
    await page.goto("https://hymn.local/");
    await page.evaluate(() => localStorage.setItem("hymn-beat-cart", JSON.stringify([{ beatId: 1, licenseType: "basic", price: 99 }, { beatId: 2, licenseType: "premium", price: 199 }])));
    await page.addStyleTag({ content: css.css });
    const layout=await fs.readFile('app/layout.tsx','utf8');
    for(const match of layout.matchAll(/import ["'](\.[^"']+\.css)["']/g)){if(!match[1].endsWith('globals.css'))await page.addStyleTag({path:path.resolve('app',match[1])});}
    try{await page.addStyleTag({path:path.join(output,'header.css')});}catch{}
    await page.evaluate(()=>{localStorage.setItem('hymn-theme','light');document.documentElement.dataset.theme='light'});
    await page.addScriptTag({ path: path.join(output, "header.js") });

    const notifications = page.getByRole("button", { name: "Notifications" });
    const cart = page.getByRole("button", { name: "Shopping cart" });
    await notifications.getByText("2", { exact: true }).waitFor();
    await cart.getByText("2", { exact: true }).waitFor();
    for (const button of [notifications, cart]) {
      const icon = await button.locator("svg").first().boundingBox();
      const badge = await button.getByText("2", { exact: true }).boundingBox();
      assert.ok(icon && badge && badge.x < icon.x + icon.width + 10 && badge.y < icon.y + 8, "Badge should overlap the icon's upper-right edge");
    }

    await page.locator("[data-profile-menu-root] > button").first().click();
    const toDark=page.getByRole('menuitem',{name:'Switch to dark mode'});await toDark.waitFor();assert.ok((await toDark.evaluate(textContrast)).ratio>=4.5);await toDark.click();assert.equal(await page.evaluate(()=>localStorage.getItem('hymn-theme')),'dark');await page.getByRole('menuitem',{name:'Switch to light mode'}).waitFor();await page.locator("[data-profile-menu-root] > button").first().click();await page.locator("[data-profile-menu-root] > button").first().click();await page.getByRole('menuitem',{name:'Switch to light mode'}).click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');assert.equal(await page.evaluate(()=>localStorage.getItem('hymn-theme')),'light');
    await page.getByRole("menuitem", { name: /Profile status Online/ }).click();
    await page.getByRole("menuitemradio", { name: /Do Not Disturb/ }).click();
    assert.deepEqual(updates.at(-1), { presence: "do_not_disturb" });
    await page.locator('[aria-label="Do Not Disturb"]:visible').waitFor();
    assert.equal(await page.getByRole("menuitemradio").count(), 0, "Presence choices should collapse after selection");
    await page.getByRole("menuitem", { name: /Profile status Do Not Disturb/ }).click();
    await page.getByRole("menuitemradio", { name: /Invisible/ }).click();
    assert.deepEqual(updates.at(-1), { presence: "invisible" });
    await page.locator('[aria-label="Invisible"]:visible').waitFor();
    assert.equal(await page.getByRole("menuitemradio").count(), 0, "Presence choices should collapse after selection");
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-profile-menu-root] > button:visible').click();
    await page.locator('[data-profile-menu-root] > button:visible').click();
    await page.getByRole('menuitem',{name:'Switch to dark mode'}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
    await page.getByRole('menuitem',{name:'Switch to light mode'}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
    await page.screenshot({ path: path.join(output, "header-presence.png") });
    console.log(`Header badge placement and persisted presence controls passed. Preview: ${output}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
