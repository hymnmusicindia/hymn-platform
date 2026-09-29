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
    await page.getByRole("heading", { name: /Your next big beginning/ }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Find my beat" }).getAttribute("href"), "/beat-store");
    await page.locator("section").screenshot({ path: path.join(output, "desktop.png") });
    await page.getByRole("tab", { name: /Find your beat/ }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: /Mix & master/ }).getAttribute("aria-selected"), "true");
    assert.equal(await page.getByRole("link", { name: "Explore Studio at standard pricing" }).getAttribute("href"), "/studio");
    await page.keyboard.press("End");
    assert.equal(await page.getByRole("link", { name: "Explore standard distribution pricing" }).getAttribute("href"), "/distribution");
    assert.equal(await page.getByRole("link", { name: "Start with a beat to claim offers" }).getAttribute("href"), "/beat-store");
    assert.equal(await page.getByRole("link", { name: "T&C apply." }).getAttribute("href"), "/terms-of-service");
    assert.equal(await page.getByRole("slider").count(), 0);
    await page.getByText(/Direct service orders use standard pricing/).waitFor();
    await page.locator("section").screenshot({ path: path.join(output, "distribution.png") });
    for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const name of [/Find your beat/, /Mix & master/, /Release worldwide/]) {
        await page.getByRole("tab", { name }).click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
        assert.equal(await page.getByRole("tabpanel").count(), 1);
      }
      if (width === 375) await page.locator("section").screenshot({ path: path.join(output, `${theme}-mobile.png`) });
    }
    await page.locator("section").screenshot({ path: path.join(output, `${theme}-desktop.png`) });
    }
    assert.deepEqual(errors, []);
    console.log(`Lifecycle interactions, offer entry links, theme layouts, keyboard navigation and responsive checks passed. Previews: ${output}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
