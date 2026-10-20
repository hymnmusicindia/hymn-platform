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
      let uploadAttempts = 0;
      await page.route("http://producer.fixture/**", async route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/notifications") return route.fulfill({ json: { notifications: [] } });
        if (url.pathname === "/api/producer/profile") { fixture.profile = profile; return route.fulfill({ json: { profile } }); }
        if (url.pathname === "/api/producer/beats") { uploadAttempts++; if (uploadAttempts === 1) return route.fulfill({status:503,json:{error:"Temporary upload failure. Retry."}}); const payload=route.request().postData() || ""; assert(payload.includes('name="audioFormat"')); assert(payload.includes("MP3")); assert(payload.includes("master.mp3")); fixture.beats = [beat]; return route.fulfill({ json: { beat } }); }
        return route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{background:#11151b;color:#edf0f7;--card:#1b2029;--border:#343b48;--text:#edf0f7;--text-muted:#aeb7c6;--bg-soft:#252c38;--accent:#a6b6ff;--accent-soft:#252e48}#app{padding:16px}</style></head><body class="hymn-portal-root"><div class="hymn-portal"><div id="app"></div></div><script>window.fixture=${JSON.stringify(fixture)}</script></body></html>` });
      });
      async function load(tab = "overview") { await page.goto(`http://producer.fixture/producer/dashboard?tab=${tab}`); await page.addScriptTag({ path: ".cache/producer-setup-browser.js" }); }
      await load("analytics");
      await page.getByRole("heading", { name: "Set up your storefront" }).waitFor({timeout:5000});
      assert.equal(await page.getByRole("heading", { name: "Catalogue performance" }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Performance", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "2. First beat", exact: true }).isDisabled(), true);
      await page.screenshot({ path: `.cache/producer-launch-${width}.png`, fullPage: true });
      await page.getByRole("heading", { name: "Set up your storefront" }).waitFor();
      await page.locator('input[name="coverPhoto"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=", "base64") });
      await page.locator('input[name="avatar"]').setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=", "base64") });
      await page.locator('input[name="displayName"]').fill("New Producer Name");
      const preview = page.getByRole("complementary", {name:"Live storefront preview"});
      await preview.getByRole("heading", {name:"New Producer Name"}).waitFor();
      assert((await preview.getByAltText("Storefront cover preview").getAttribute("src"))?.startsWith("blob:"));
      assert((await preview.getByAltText("Producer image preview").getAttribute("src"))?.startsWith("blob:"));
      if (width === 1440) {
        const editor = await page.getByRole("region", {name:"Storefront editor"}).boundingBox();
        const card = await preview.boundingBox();
        const form = await page.locator("form").boundingBox();
        assert(card && form && card.x > form.x + form.width,"Preview is to the right of the form");
        assert(editor && editor.y + editor.height < 900,"Default desktop setup fits a single screen");
      }
      await page.screenshot({path:`.cache/producer-live-preview-${width}.png`,fullPage:true});
      await page.getByRole("button", { name: "Save storefront & continue" }).click();
      await page.getByRole("heading", { name: "Upload beat", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Performance", exact: true }).count(), 0);
      await page.getByRole("button", {name:"Continue",exact:true}).click();
      await page.getByRole("alert").filter({hasText:"Choose a WAV or MP3 master."}).waitFor();
      if(width===1440) {
        const workspace=await page.getByRole("region",{name:"Beat upload workspace"}).boundingBox();
        assert(workspace && workspace.y+workspace.height<900,"Default upload fits desktop screen");
      }
      await page.screenshot({path:`.cache/producer-upload-files-${width}.png`,fullPage:true});
      await page.locator('input[name="file"]').setInputFiles({ name: "master.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("fixture") });
      await page.getByLabel("Selected master audio").waitFor();
      const masterSource = await page.locator("audio").getAttribute("src");
      await page.locator('input[name="preview"]').setInputFiles({name:"preview.mp3",mimeType:"audio/mpeg",buffer:Buffer.from("preview fixture")});
      await page.getByLabel("Selected public preview").waitFor();
      assert.notEqual(await page.locator("audio").getAttribute("src"),masterSource,"Separate preview takes priority");
      await page.locator('input[name="preview"]').setInputFiles([]);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      assert.equal(await page.getByLabel("Selected master audio").count(),1,"Master is playable when no preview is provided");
      for (const [name, value] of Object.entries({ title: "First beat", bpm: "140" })) await page.locator(`[name="${name}"]`).fill(value);
      await page.locator('[name="keySignature"]').selectOption('F Minor');
      await page.locator('[name="genre"]').selectOption('Trap');
      assert((await page.locator('[name="genre"] option').count()) > 30);
      const moodSelect=page.getByLabel(/Moods \(/);
      for(const mood of ['Dark','Chill','Energetic'])await moodSelect.selectOption(mood);
      assert.equal(await moodSelect.isDisabled(),true,'Mood selection stops at three.');
      await page.getByRole('button',{name:'Remove Chill mood'}).click();
      assert.equal(await moodSelect.isDisabled(),false);
      await moodSelect.selectOption('Sad');
      assert.equal(await page.locator('[name="mood"]').inputValue(),'Dark, Energetic, Sad');
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button",{name:"Use suggested prices"}).click();
      await page.locator('[name="exclusivePrice"]').fill("50");
      await page.getByRole("button",{name:"Continue",exact:true}).click();
      await page.getByRole("alert").filter({hasText:"Exclusive price must be higher"}).waitFor();
      await page.locator('[name="exclusivePrice"]').fill("5000");
      await page.screenshot({path:`.cache/producer-upload-pricing-${width}.png`,fullPage:true});
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.locator('[name="sampleDeclaration"]').selectOption("CONTAINS_UNCONTROLLED_SAMPLES");
      await page.getByRole("button",{name:"Submit for review",exact:true}).click();
      assert.equal(uploadAttempts,0,"Sample disclosure is required before upload");
      await page.locator('[name="sampleDeclaration"]').selectOption("NO_UNCONTROLLED_SAMPLES");
      await page.locator('[name="sampleRightsConfirmed"]').check();
      await page.locator('[name="sampleDeclaration"]').selectOption('LICENSED_SAMPLES');
      await page.locator('[name="sampleDisclosure"]').fill('Splice, fixture sample, certified licence permitting commercial use.');
      await page.getByRole('button',{name:'Submit for review',exact:true}).click();
      assert.equal(uploadAttempts,0,'Licensed samples require a certificate.');
      await page.locator('[name="sampleLicenseEvidence"]').setInputFiles({name:'certificate.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nFixture certificate\n%%EOF')});
      await page.locator('[name="sampleDeclaration"]').selectOption('NO_UNCONTROLLED_SAMPLES');
      assert.equal(fixture.beats.length,0,"Continue must not submit the final upload automatically");
      await page.getByRole("button", { name: "Submit for review", exact: true }).click();
      await page.getByRole("alert").filter({hasText:"Temporary upload failure"}).waitFor();
      assert.equal(await page.locator('input[name="file"]').evaluate((input:HTMLInputElement)=>input.files?.[0]?.name),"master.mp3","Retry preserves the selected master");
      await page.getByRole("button", {name:"Submit for review",exact:true}).click();
      await page.waitForURL("**/producer/dashboard?tab=overview");
      await page.addScriptTag({ path: ".cache/producer-setup-browser.js" });
      await page.getByRole("heading", { name: "Your sound. Your business." }).waitFor();
      await load("analytics");
      await page.getByRole("heading", { name: "Catalogue performance" }).waitFor();
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS actual producer shell: deep-link gates, storefront save, compact four-step first upload and automatic unlock at desktop/mobile widths");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
