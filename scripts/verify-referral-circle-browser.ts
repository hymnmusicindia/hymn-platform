import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

async function main() {
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/referral-circle-entry.tsx", `import React from 'react';import {createRoot} from 'react-dom/client';import {ReferralCircle} from '../components/referral-circle';createRoot(document.getElementById('app')!).render(<ReferralCircle/>);`);
  await build({ entryPoints: [".cache/referral-circle-entry.tsx"], outfile: ".cache/referral-circle-browser.js", bundle: true, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '\"production\"' }, plugins: [{ name: "fixture-image", setup(builder) { builder.onResolve({ filter: /^next\/image$/ }, args => ({ path: args.path, namespace: "fixture" })); builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "import React from 'react';export default function Image({unoptimized,...props}){return <img {...props}/>}", loader: "jsx", resolveDir: process.cwd() })); } }] });
  const css = readFileSync("app/styles/referral-circle.css", "utf8");
  const browser = await chromium.launch();
  try {
    for (const width of [320, 390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      let fails = true, sends = 0; const keys: string[] = [];
      const person = { id: 8, name: "Aditya Ujjain", avatar: null };
      const messages = [{ id: 1, senderId: 8, body: "Welcome to HYMN", clientKey: "initial", createdAt: new Date().toISOString() }];
      await page.route("https://fixture.invalid/", route => route.fulfill({ contentType: "text/html", body: `<html><head><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#101218;font-family:Arial,sans-serif;color:#eee}button{font:inherit;background:none;border:0;color:inherit}#app{max-width:1050px;margin:auto}:root{--text:#eee;--bg:#101218;--text-muted:#aaa;--border:#333;--accent:#b6c8ff;--bg-soft:#171b23}${css}</style></head><body><main id="app"></main><script>${readFileSync(".cache/referral-circle-browser.js", "utf8")}</script></body></html>` }));
      await page.route("**/api/referrals/conversations", route => route.fulfill({ json: { conversations: [{ id: 12, person, relationship: "Your referrer", blocked: false, blockedByYou: false, unread: 1, latest: "Welcome to HYMN" }], nextCursor: null } }));
      await page.route("**/api/referrals/conversations/12**", async route => {
        if (route.request().method() === "POST") {
          sends++; const body = route.request().postDataJSON(); keys.push(body.clientKey);
          if (fails) { fails = false; return route.fulfill({ status: 503, json: { error: "Message could not be sent. Try again." } }); }
          const message = { id: 2, senderId: 9, body: body.body, clientKey: body.clientKey, createdAt: new Date().toISOString() }; messages.push(message);
          return route.fulfill({ status: 201, json: { message } });
        }
        if (route.request().method() === "PATCH") return route.fulfill({ json: { ok: true } });
        return route.fulfill({ json: { messages, userId: 9, hasMore: false } });
      });
      await page.route("**/api/referrals/network?*", route => {
        const branch = new URL(route.request().url()).searchParams.has("parent");
        return route.fulfill({ json: { nodes: branch ? [] : [{ ...person, referralId: 12, children: 3, direct: true }], nextCursor: null } });
      });
      await page.goto("https://fixture.invalid/");
      await expect(page.getByRole("heading", { name: "A connection beyond the link." })).toBeVisible();
      await page.getByRole("button", { name: /Aditya Ujjain/ }).click();
      const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Welcome to HYMN")).toBeVisible();
      await dialog.getByRole("textbox", { name: "Message" }).fill("Hello <script>alert(1)</script>");
      await dialog.getByRole("button", { name: "Send message" }).click();
      await expect(dialog.getByRole("alert")).toContainText("Try again");
      await dialog.getByRole("button", { name: "Send message" }).click();
      await expect(dialog.getByText("Hello <script>alert(1)</script>")).toBeVisible();
      assert.equal(sends, 2); assert.equal(keys[0], keys[1], "Retry retains its idempotency key.");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: `.cache/referral-chat-${width}.png` });
      await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
      await page.getByRole("button", { name: "Network", exact: true }).click();
      await expect(page.getByText("Level 1 · 3 connections")).toBeVisible();
      await page.getByRole("button", { name: "Explore Aditya Ujjain's referrals" }).click();
      await expect(page.getByText("No connections on this branch yet.")).toBeVisible();
      await page.getByRole("button", { name: "You", exact: true }).click();
      await expect(page.getByText("Level 1 · 3 connections")).toBeVisible();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: `.cache/referral-network-${width}.png` });
      await page.close();
    }
    console.log("PASS referral profiles, chat, retry/idempotency, safe text rendering, network navigation and mobile layout at 320/390/1440px.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
