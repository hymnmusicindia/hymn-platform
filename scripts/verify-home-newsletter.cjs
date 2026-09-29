const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

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
    const page = await browser.newPage();
    const submitted = [];
    await page.route("**/api/newsletter/subscribe", async route => {
      submitted.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ subscribed: true }) });
    });
    await page.setContent('<base href="https://hymn.local/"><div id="root"></div>');
    await page.addScriptTag({ path: path.join(output, "newsletter.js") });

    await page.getByText("Do you want to subscribe?", { exact: true }).waitFor();
    await page.getByText(/google\.user@gmail\.com/).waitFor();
    assert.equal(await page.getByRole("textbox").count(), 0);
    await page.getByRole("button", { name: "Yes, subscribe" }).click();
    await page.getByText(/Subscribed with google\.user@gmail\.com/).waitFor();
    assert.deepEqual(submitted[0], { email: "google.user@gmail.com" });

    await page.getByRole("button", { name: "Use a different email?" }).click();
    const input = page.getByRole("textbox", { name: "Email address" });
    assert.equal(await input.inputValue(), "google.user@gmail.com");
    await input.fill("different@example.com");
    await page.getByRole("button", { name: "Subscribe", exact: true }).click();
    assert.deepEqual(submitted[1], { email: "different@example.com" });
    await page.getByText(/Subscribed with different@example\.com/).waitFor();
    console.log("Google email opt-in and alternate-email newsletter checks passed.");
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
