const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

async function main() {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "hymn-newsletter-"));
  await build({
    stdin: {
      contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {HomeNewsletter} from "./components/home-newsletter"; createRoot(document.getElementById("root")).render(<HomeNewsletter accountEmail="google.user@gmail.com" />);',
      loader: "tsx",
      resolveDir: process.cwd()
    },
    bundle: true,
    outfile: path.join(output, "newsletter.js"),
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' }
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 520 } });
    const submitted = [];
    const unsubscribed = [];
    await page.route("**/api/newsletter/subscribe", async route => {
      submitted.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ subscribed: true, unsubscribeToken: "private-unsubscribe-token-123456" }) });
    });
    await page.route("**/api/newsletter/unsubscribe", async route => {
      unsubscribed.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ unsubscribed: true }) });
    });
    await page.setContent('<base href="https://hymn.local/"><div id="root"></div>');
    const globalCss = await postcss([tailwind(path.resolve("tailwind.config.ts"))]).process(await fs.readFile("app/globals.css", "utf8"), { from: path.resolve("app/globals.css") });
    await page.addStyleTag({ content: globalCss.css });
    await page.addScriptTag({ path: path.join(output, "newsletter.js") });

    await page.getByText("Stay in the HYMN loop?", { exact: true }).waitFor();
    await page.getByText(/google\.user@gmail\.com/).waitFor();
    await page.locator("form").screenshot({ path: path.join(output, "newsletter-invite.png") });
    assert.equal(await page.getByRole("textbox").count(), 0);
    await page.getByRole("button", { name: "Yes, subscribe" }).click();
    await page.getByText("You’re on the list.", { exact: true }).waitFor();
    await page.getByText("google.user@gmail.com", { exact: true }).waitFor();
    await page.locator("form").screenshot({ path: path.join(output, "newsletter-subscribed.png") });
    assert.deepEqual(submitted[0], { email: "google.user@gmail.com" });
    await page.getByRole("button", { name: "Unsubscribe", exact: true }).click();
    await page.getByText("google.user@gmail.com has been unsubscribed.", { exact: true }).waitFor();
    assert.deepEqual(unsubscribed[0], { token: "private-unsubscribe-token-123456" });

    await page.getByRole("button", { name: "Use a different email?" }).click();
    const input = page.getByRole("textbox", { name: "Email address" });
    assert.equal(await input.inputValue(), "google.user@gmail.com");
    await input.fill("different@example.com");
    await page.getByRole("button", { name: "Subscribe", exact: true }).click();
    assert.deepEqual(submitted[1], { email: "different@example.com" });
    await page.getByText("different@example.com", { exact: true }).waitFor();
    console.log(`Google email opt-in, alternate-email and secure unsubscribe checks passed. Previews: ${output}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
