import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

async function main() {
  writeFileSync(".cache/gateway-browser-entry.tsx", `import React from 'react'; import { createRoot } from 'react-dom/client'; import { GatewayFinanceWorkspace } from '../components/gateway-finance-workspace'; createRoot(document.getElementById('app')!).render(<GatewayFinanceWorkspace/>);`);
  await build({ entryPoints: [".cache/gateway-browser-entry.tsx"], outfile: ".cache/gateway-browser.js", bundle: true, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const css = ["app/globals.css", "app/styles/dashboard.css", "app/styles/product-ui.css", "app/styles/material-depth.css", "app/styles/portal.css", "app/styles/workspace-pages.css", "app/styles/workspace-system.css", "app/styles/gateway-finance.css"].map(file => readFileSync(file, "utf8")).join("\n");
  const settlement = readFileSync(".cache/gateway-settlement-fixture.json", "utf8");
  const routeFixture = JSON.parse(readFileSync(".cache/gateway-route-fixture.json", "utf8"));
  // Add a provider-held visual state alongside the settled/review/cancelled integration records.
  routeFixture.transfers.unshift({ ...routeFixture.transfers[0], id: 999, status: "held", transferId: "trf_browser", error: null });
  const route = JSON.stringify(routeFixture);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("http://gateway.fixture/**", async intercepted => {
        const url = new URL(intercepted.request().url());
        if (url.pathname === "/api/admin/gateway-finance") return intercepted.fulfill({ contentType: "application/json", body: intercepted.request().method() === "POST" ? '{"ok":true}' : url.searchParams.get("view") === "route" ? route : settlement });
        return intercepted.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{padding:24px;background:#101318;color:#eef1f6;font-family:Arial}#app{max-width:1200px;margin:auto}.gateway-finance{--muted:#a6adb8;--border:#303744;--surface-elevated:#252a34}@media(max-width:700px){body{padding:12px}}</style></head><body class="workspace-v2"><main id="app" class="revenue-workspace"></main></body></html>` });
      });
      await page.goto("http://gateway.fixture/"); await page.addScriptTag({ path: ".cache/gateway-browser.js" });
      await page.getByRole("button", { name: "Bank settlements" }).click();
      await page.getByRole("heading", { name: "Bank settlements" }).waitFor();
      await page.getByText("FIXTURE-UTR", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Settlement overflow at ${width}px`);
      await page.screenshot({ path: `.cache/gateway-settlements-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Creator transfers" }).click();
      await page.getByRole("heading", { name: "Transfer ledger", exact: true }).waitFor();
      await page.getByRole("button", { name: "Release settlement", exact: true }).first().click();
      await page.getByRole("region", { name: "Confirm transfer" }).waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByText("Connect an onboarded creator account", { exact: true }).click();
      await page.getByLabel("HYMN user ID").fill("1");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Route overflow at ${width}px`);
      await page.screenshot({ path: `.cache/gateway-route-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []); await page.close();
    }
    console.log("PASS: settlement and Route views at 1440, 390 and 320px; linked account form, release confirmation and no page errors or horizontal overflow.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
