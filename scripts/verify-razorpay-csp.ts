import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import nextConfig from "../next.config";

async function main() {
  const rules = await nextConfig.headers!();
  const headers = rules.find(rule => rule.source === "/:path*")!.headers;
  const policy = headers.find(header => header.key === "Content-Security-Policy")!.value;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const fixed of [false, true]) {
      const page = await browser.newPage();
      await page.route("https://checkout.fixture/", route => route.fulfill({ headers: { "Content-Security-Policy": fixed ? policy : policy.replace(" https://cdn.razorpay.com", "") }, contentType: "text/html", body: "<html><body>Checkout</body></html>" }));
      await page.route("https://checkout.razorpay.com/v1/checkout.js", route => route.fulfill({ contentType: "application/javascript", body: `window.fixtureCheckoutLoaded=true;const script=document.createElement('script');script.src='https://cdn.razorpay.com/static/cx/razorpay-risk-detection/bundle.js';document.head.appendChild(script);` }));
      await page.route("https://cdn.razorpay.com/**", route => route.fulfill({ contentType: "application/javascript", body: "window.fixtureRiskLoaded=true;" }));
      await page.route("https://untrusted.fixture/**", route => route.fulfill({ contentType: "application/javascript", body: "window.fixtureUntrustedLoaded=true;" }));
      await page.goto("https://checkout.fixture/");
      await page.evaluate(async () => {
        (window as any).fixtureViolations = [];
        document.addEventListener("securitypolicyviolation", event => (window as any).fixtureViolations.push(event.blockedURI));
        const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js";
        await new Promise<void>(resolve => { script.onload = () => resolve(); document.head.appendChild(script); });
        const other = document.createElement("script"); other.src = "https://untrusted.fixture/attack.js"; document.head.appendChild(other);
      });
      if (fixed) await page.waitForFunction(() => (window as any).fixtureRiskLoaded === true);
      else await page.waitForFunction(() => (window as any).fixtureViolations.some((url: string) => url.includes("cdn.razorpay.com")));
      await page.waitForFunction(() => (window as any).fixtureViolations.some((url: string) => url.includes("untrusted.fixture")));
      const result = await page.evaluate(() => ({ checkout: (window as any).fixtureCheckoutLoaded, risk: Boolean((window as any).fixtureRiskLoaded), untrusted: Boolean((window as any).fixtureUntrustedLoaded) }));
      assert.equal(result.checkout, true); assert.equal(result.risk, fixed); assert.equal(result.untrusted, false);
      await page.close();
    }
    console.log("PASS reproduced blocked Razorpay risk script under old CSP; corrected policy loads it and still blocks unrelated scripts");
  } finally { await browser.close(); }
}
void main();
