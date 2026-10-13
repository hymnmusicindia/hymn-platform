const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

async function main() {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "hymn-lifecycle-"));
  await build({
    stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {MusicLifecycleBanner} from "./components/music-lifecycle-banner"; createRoot(document.getElementById("root")).render(<MusicLifecycleBanner />);', loader: "tsx", resolveDir: process.cwd() },
    bundle: true, outfile: path.join(output, "banner.js"), jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "isolated-link", setup(builder) {
      builder.onResolve({ filter: /^\/assets\// }, args => ({ path: path.join(process.cwd(), "public", args.path) }));
      builder.onLoad({ filter: /\.(png|svg)$/ }, async args => ({ contents: await fs.readFile(args.path), loader: "dataurl" }));
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'import React from "react"; export default function Link(props) { return React.createElement("a", props); }', resolveDir: process.cwd() }));
    } }]
  });
  const globalCss = await postcss([tailwind(path.resolve("tailwind.config.ts"))]).process(await fs.readFile("app/globals.css", "utf8"), { from: path.resolve("app/globals.css") });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<html><body style="margin:0;background:#f6f5f1"><div id="root"></div></body></html>');
    await page.addStyleTag({ content: globalCss.css });
    await page.addStyleTag({ path: path.join(output, "banner.css") });
    await page.addScriptTag({ path: path.join(output, "banner.js") });
    await page.getByRole("heading", { name: "Your sound. Release-ready." }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Start with a beat", exact: true }).getAttribute("href"), "/beat-store");
    for (const [name, action, href] of [["Buy your beat", "Explore beats", "/beat-store"], ["Mix & master", "Explore studio services", "/studio"], ["Reach global listeners", "Explore distribution", "/distribution"]]) {
      const button = page.getByRole("button", { name: new RegExp(name) });
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator('[aria-pressed="true"]').count(), 1);
      assert.equal(await page.getByRole("link", { name: action, exact: true }).getAttribute("href"), href);
    }
    assert.equal(await page.getByRole("link", { name: "T&C apply." }).getAttribute("href"), "/terms-of-service");
    assert.equal(await page.getByRole("tab").count(), 0);
    await page.getByText(/Otherwise, standard pricing applies/).waitFor();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => {
        document.documentElement.dataset.theme = theme;
        document.body.style.background = theme === "dark" ? "#0b0e11" : "#f6f5f1";
      }, theme);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow at ' + width);
        const bounds = await page.locator("section").boundingBox();
        assert.ok(bounds.height < 1000, 'Banner should remain compact at ' + width + ': ' + bounds.height);
        for (const name of ["Buy your beat", "Mix & master", "Reach global listeners"]) await page.getByRole("heading", { name, exact: true }).waitFor();
        await page.locator("section").screenshot({ path: path.join(output, theme + '-' + width + '.png') });
      }
    }
    await page.getByRole("link", { name: "Start with a beat", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.ok(await page.getByRole("button", { name: /Buy your beat/ }).evaluate(el => el === document.activeElement));
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    assert.equal(await page.getByRole("button", { name: /Mix & master/ }).getAttribute("aria-pressed"), "true");
    const wave = page.locator('i').first();
    assert.equal(await wave.evaluate(el => getComputedStyle(el).animationName), "none", "Reduced motion disables animation");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.mouse.move(0, 0);
    const distribution = page.getByRole("button", { name: /Reach global listeners/ });
    const globe = distribution.locator('span[class*="globe"]');
    const spotify = distribution.locator('[title="Spotify"]');
    const globeBefore = await globe.boundingBox();
    const logoBefore = await spotify.boundingBox();
    await distribution.click();
    await page.waitForTimeout(400);
    assert.deepEqual(await globe.boundingBox(), globeBefore, "Globe must remain still on hover");
    assert.notDeepEqual(await spotify.boundingBox(), logoBefore, "Store logo animates when selecting distribution");
    assert.deepEqual(errors, []);
    console.log(`Lifecycle interactions, offer entry links, theme layouts, keyboard navigation and responsive checks passed. Previews: ${output}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
