import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

async function main() {
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/payment-loader-entry.ts", `import {loadBioRazorpay} from '../lib/client-razorpay';(window as any).loadPayment=loadBioRazorpay;`);
  await build({ entryPoints: [".cache/payment-loader-entry.ts"], outfile: ".cache/payment-loader-browser.js", bundle: true, platform: "browser" });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let requests = 0; let mode = "error";
    await page.route("https://checkout.razorpay.com/**", route => {
      requests++;
      return mode === "error" ? route.abort() : route.fulfill({ contentType: "application/javascript", body: mode === "missing" ? "/* no constructor */" : "window.Razorpay=class {};" });
    });
    await page.setContent("<html><body></body></html>");
    await page.addScriptTag({ content: readFileSync(".cache/payment-loader-browser.js", "utf8") });
    const load = () => page.evaluate(async () => {
      const results = await Promise.allSettled([(window as any).loadPayment(), (window as any).loadPayment()]);
      return results.map(result => result.status);
    });
    assert.deepEqual(await load(), ["rejected", "rejected"]); assert.equal(requests, 1, "Concurrent callers share one SDK request");
    mode = "missing"; assert.deepEqual(await load(), ["rejected", "rejected"]); assert.equal(requests, 2, "A script without the SDK must not report success");
    mode = "success"; assert.deepEqual(await load(), ["fulfilled", "fulfilled"]); assert.equal(requests, 3, "Retry replaces a previously failed script");
    assert.deepEqual(await load(), ["fulfilled", "fulfilled"]); assert.equal(requests, 3);
    await page.clock.install();
    await page.evaluate(() => {
      delete (window as any).Razorpay;
      document.body.innerHTML = '<script src="https://checkout.razorpay.com/v1/checkout.js"></script>';
      (window as any).timeoutResult = "pending";
      void (window as any).loadPayment().catch(() => { (window as any).timeoutResult = "rejected"; });
    });
    await page.clock.fastForward(16000);
    assert.equal(await page.evaluate(() => (window as any).timeoutResult), "rejected", "Stale existing scripts cannot hang checkout forever");
    assert.deepEqual(await load(), ["fulfilled", "fulfilled"]);
    console.log("PASS shared SDK loading, network failure, missing constructor, timeout, retry and concurrent checkout callers");
  } finally { await browser.close(); }
}
void main();
