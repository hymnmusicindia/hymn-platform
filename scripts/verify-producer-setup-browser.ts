import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

async function main() {
  writeFileSync(".cache/producer-setup-entry.tsx", `import React from 'react';import {createRoot} from 'react-dom/client';import {ProducerDashboardShell} from '../components/producer-dashboard-shell';const fixture=(window as any).fixture;createRoot(document.getElementById('app')!).render(<ProducerDashboardShell user={{id:123,name:'Fixture Producer',email:'fixture@example.com',role:'producer'}} beats={fixture.beats} orders={[]} earnings={{totalSales:0,totalRevenue:0,beatsSold:0}} finance={{profile:fixture.profile,totalSales:0,producerEarnings:0,availableBalance:0,sales:[],ledger:[]}}/>);`);
  await build({ entryPoints: [".cache/producer-setup-entry.tsx"], outfile: ".cache/producer-setup-browser.js", bundle: true, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "browser-fixture-adapters", setup(build) {
    build.onResolve({ filter: /^(next\/(link|image|dynamic|navigation)|@\/components\/(subscription-options|workspace-footer|workspace-switcher|first-login-referral-prompt|beat-card))$/ }, args => ({ path: args.path, namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "tsx", resolveDir: process.cwd(), contents: args.path === "next/link" ? `import React from 'react';export default function Link({children,...props}:any){return <a {...props}>{children}</a>}` : args.path === "next/image" ? `import React from 'react';export default function Image({fill,priority,...props}:any){return <img {...props}/>} ` : args.path === "next/dynamic" ? "export default function dynamic(){return ()=>null}" : args.path === "next/navigation" ? "export const usePathname=()=>'/producer/dashboard';export const useRouter=()=>({push(){},refresh(){}});" : "export const SubscriptionButton=()=>null;export const openSubscriptions=()=>{};export const WorkspaceFooter=()=>null;export const WorkspaceSwitcher=()=>null;export const FirstLoginReferralPrompt=()=>null;export const BeatCard=()=>null;" }));
  } }] });
  const utilities = await postcss([tailwindcss({ content: ["./components/**/*.{ts,tsx}"], theme: { extend: {} }, plugins: [] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
  const css = utilities.css + ["app/globals.css", "app/styles/dashboard.css", "app/styles/portal.css", "app/styles/product-ui.css", "app/styles/workspace-pages.css", ".cache/producer-setup-browser.css"].map(file => readFileSync(file, "utf8")).join("\n");
  const profile = { displayName: "Fixture Producer", avatarUrl: "/avatar.png", coverPhotoUrl: "/cover.png", status: "active", active: true };
  const beat = { id: 999, title: "First beat", genre: "Trap", bpm: 140, price: 120, status: "PENDING_REVIEW", enabled: false };
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
      const fixture: {profile: typeof profile | null; beats: typeof beat[]} = { profile: null, beats: [] };
      await page.route("http://producer.fixture/**", async route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/notifications") return route.fulfill({ json: { notifications: [] } });
        if (url.pathname === "/api/producer/profile") { fixture.profile = profile; return route.fulfill({ json: { profile } }); }
        if (url.pathname === "/api/producer/beats") { fixture.beats = [beat]; return route.fulfill({ json: { beat } }); }
        return route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{background:#11151b;color:#edf0f7;--card:#1b2029;--border:#343b48;--text:#edf0f7;--text-muted:#aeb7c6;--bg-soft:#252c38;--accent:#a6b6ff;--accent-soft:#252e48}#app{padding:16px}</style></head><body><div id="app"></div><script>window.fixture=${JSON.stringify(fixture)}</script></body></html>` });
      });
      async function load(tab = "overview") { await page.goto(`http://producer.fixture/producer/dashboard?tab=${tab}`); await page.addScriptTag({ path: ".cache/producer-setup-browser.js" }); }
      await load("analytics");
      await page.getByRole("heading", { name: "Your sound deserves a storefront." }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "Catalogue performance" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Performance", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Upload first beat", exact: true }).isDisabled(), true);
      await page.screenshot({ path: `.cache/producer-launch-${width}.png`, fullPage: true });
      await page.getByRole("button", { name: "Make it yours" }).click();
      await page.getByRole("heading", { name: "Set up your storefront" }).waitFor();
      await page.locator('input[name="coverPhoto"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from("fixture") });
      await page.locator('input[name="avatar"]').setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from("fixture") });
      await page.getByRole("button", { name: "Save storefront & continue" }).click();
      await page.getByRole("heading", { name: "Upload Beat", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Performance", exact: true }).count(), 0);
      await page.locator('select[name="audioFormat"]').selectOption("MP3");
      await page.locator('input[name="file"]').setInputFiles({ name: "master.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("fixture") });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      for (const [name, value] of Object.entries({ title: "First beat", bpm: "140", keySignature: "F minor", genre: "Trap", mood: "Dark" })) await page.locator(`[name="${name}"]`).fill(value);
      await page.locator('[name="sampleDeclaration"]').selectOption("NO_UNCONTROLLED_SAMPLES");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      for (const [name, value] of Object.entries({ generalPrice: "500", stemPrice: "999", exclusivePrice: "5000" })) await page.locator(`[name="${name}"]`).fill(value);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      assert.equal(fixture.beats.length,0,"Continue must not submit the final upload automatically");
      await page.getByRole("button", { name: "Submit for review", exact: true }).click();
      await page.waitForURL("**/producer/dashboard?tab=overview");
      await page.addScriptTag({ path: ".cache/producer-setup-browser.js" });
      await page.getByRole("heading", { name: "Your sound. Your business." }).waitFor();
      await load("analytics");
      await page.getByRole("heading", { name: "Catalogue performance" }).waitFor();
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS actual producer shell: deep-link gates, storefront save, five-step first upload and automatic unlock at desktop/mobile widths");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
