import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
async function main() {
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/referral-cash-entry.tsx", `import React from 'react';import {createRoot} from 'react-dom/client';import {ReferralCommissionPanel} from '../components/referral-commission-panel';createRoot(document.getElementById('app')!).render(<ReferralCommissionPanel data={(window as any).fixture} refresh={async()=>{(window as any).refreshed=true}}/>);`);
  await build({ entryPoints: [".cache/referral-cash-entry.tsx"], outfile: ".cache/referral-cash-browser.js", bundle: true, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "link", setup(builder) { builder.onResolve({ filter: /^next\/link$/ }, args => ({ path: args.path, namespace: "fixture" })); builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "import React from 'react';export default function Link(props){return <a {...props}/>}", loader: "jsx", resolveDir: process.cwd() })); } }] });
  const css = (await postcss([tailwindcss({ content: ["./components/referral-commission-panel.tsx"], theme: { extend: {} }, plugins: [] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined })).css + readFileSync("app/styles/referral-center.css", "utf8");
  const fixture = { pending: 50, held: 10, available: 700, paid: 500, requested: 0, recovery: 0, total: 1260, minimumPayout: 500, holdDays: 14, rates: [{ category: "one_time", percent: 10, basis: "payment collected" }, { category: "half_yearly", percent: 8, basis: "payment collected" }, { category: "beats", percent: 20, basis: "HYMN share" }], history: [{ id: 1, category: "one_time", paid: 99, base: 99, rate: 10, amount: 9.9, status: "PENDING", eligibleAt: "2026-10-26T00:00:00Z", createdAt: "2026-10-12T00:00:00Z" }], nextCursor: 1, payouts: [{ id: 1, amount: 500, status: "PAID", reference: "fixture-bank-reference", createdAt: "2026-10-12T00:00:00Z" }] };
  const browser = await chromium.launch();
  try {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } }); let fail = true;
      await page.route("http://fixture.invalid/", route => route.fulfill({ contentType: "text/html", body: `<html><head><style>:root{--text:#eee;--bg:#101218;--text-muted:#aaa;--border:#333;--accent:#b6c8ff;--bg-soft:#171b23}body{background:#101218;color:var(--text);padding:12px}#app{max-width:1050px;margin:auto}</style><style>${css}</style></head><body><main id="app" class="referral-center"></main><script>window.fixture=${JSON.stringify(fixture)}</script><script>${readFileSync(".cache/referral-cash-browser.js", "utf8")}</script></body></html>` }));
      await page.route("**/api/referrals/payouts", route => route.fulfill({ status: fail ? 400 : 201, json: fail ? { error: "Verify your payout profile before withdrawing referral earnings." } : { payout: { id: 2 } } }));
      await page.route("**/api/referrals/me?*", route => route.fulfill({ json: { referral: { commission: { history: [{ ...fixture.history[0], id: 2, category: "half_yearly", amount: 55.92 }], nextCursor: null } } } }));
      await page.goto("http://fixture.invalid/");
      await expect(page.getByRole("heading", { name: "Invite once. Earn on every paid purchase." })).toBeVisible();
      await page.getByRole("button", { name: "Withdraw commission" }).click();
      await expect(page.getByRole("status")).toContainText("Verify your payout profile"); fail = false;
      await page.getByRole("button", { name: "Withdraw commission" }).click();
      await expect(page.getByRole("status")).toContainText("Payout requested"); assert.equal(await page.evaluate(() => (window as any).refreshed), true);
      await page.getByRole("button", { name: "Load more commissions" }).click(); await expect(page.getByText("Half-yearly", { exact: true })).toHaveCount(2);
      await page.getByText("Payout history", { exact: true }).click(); await expect(page.getByText("fixture-bank-reference", { exact: true })).toBeVisible();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
      await page.screenshot({ path: `.cache/referral-cash-${width}.png`, fullPage: true }); await page.close();
    }
    console.log("PASS lifetime referral earnings UI at 320/390/1440px, payout errors/retry, commission pagination and payout history.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
