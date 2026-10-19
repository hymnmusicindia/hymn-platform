import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";
import { prisma } from "../lib/prisma";

async function main() {
  assert.equal(process.env.DATABASE_URL, "postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture", "Browser checks require the isolated acquisition fixture.");
  const origin = "http://127.0.0.1:35475";
  const publicOrigin = "https://hymnmusic.fun";
  const proxyHeaders = { "x-forwarded-host": "hymnmusic.fun", "x-forwarded-proto": "https" };
  const secret = "acquisition-browser-fixture-session-secret";
  const owner = await prisma.teamMember.findFirstOrThrow({ where: { user: { email: { startsWith: "r-" } } }, include: { user: true } });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "35475"], { env: { ...process.env, NODE_ENV: "production", PORT: "35475", EMAIL_ENABLED: "false", HYMN_CRON_WORKER_ENABLED: "false", JWT_SECRET: secret, ADMIN_JWT_SECRET: secret, NEXT_PUBLIC_APP_URL: publicOrigin, APP_URL: publicOrigin, PUBLIC_SITE_URL: publicOrigin, NEXT_PUBLIC_SITE_URL: publicOrigin }, stdio: "ignore", windowsHide: true });
  const browser = await chromium.launch();
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(`${origin}/api/team/session`, { headers: proxyHeaders, redirect: "manual", signal: AbortSignal.timeout(3000) })).status === 401) break; } catch { /* The fixture server is starting. */ }
      if (attempt === 59) throw new Error("Isolated acquisition server did not become ready.");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: proxyHeaders });
    // Production validates writes against the public origin; simulate the
    // reverse proxy while keeping every browser request on the local fixture.
    await context.route("**/*", async route => {
      const request = route.request();
      if (new URL(request.url()).origin !== publicOrigin) return route.abort();
      const target = new URL(request.url());
      const local = await route.fetch({ url: `${origin}${target.pathname}${target.search}`, headers: { ...request.headers(), ...proxyHeaders }, maxRedirects: 0 });
      await route.fulfill({ response: local });
    });
    await context.addCookies([{ name: "hymn_session", value: jwt.sign({ sub: owner.user.id, email: owner.user.email, name: owner.user.name, role: "customer" }, secret, { expiresIn: "1h" }), url: publicOrigin }]);
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    await page.goto(`${publicOrigin}/team?module=acquisition`);
    await page.getByRole("button", { name: "Research & Acquisition", exact: true }).click();
    await page.getByRole("heading", { name: "Acquisition dashboard", exact: true }).waitFor();
    for (const [button, heading] of [["My Leads", "My leads"], ["All Leads", "All leads"], ["Employee Rewards", "Employee rewards"], ["Commission Ledger", "Revenue reconciliation"], ["Programme Settings", "Programme settings"]]) {
      await page.getByRole("button", { name: button, exact: true }).click();
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    }
    await page.getByRole("button", { name: "Email Outreach", exact: true }).click();
    await page.getByRole("heading", { name: "Email Outreach", exact: true }).waitFor();
    await page.getByRole("button", { name: "Customer Attribution", exact: true }).click();
    const customer = await prisma.user.findFirstOrThrow({ where: { email: { startsWith: "u-" } } });
    await page.getByLabel("HYMN customer ID").fill(String(customer.id));
    await page.getByRole("button", { name: "Inspect attribution", exact: true }).click();
    await page.getByRole("heading", { name: `${customer.name} · #${customer.id}`, exact: true }).waitFor();
    await page.getByRole("button", { name: "Commission Ledger", exact: true }).click();
    // The original customer fixture deliberately has a pending provider refund.
    // Use the clean repeat purchase for the successful dispute resolution flow.
    const evidence = await prisma.acquisitionRevenueEvidence.findFirstOrThrow({ where: { workspaceId: owner.workspaceId, paymentId: { startsWith: "pay_signed_2_" } } });
    const evidencePanel = page.locator("details").filter({ hasText: evidence.paymentId }).filter({ has: page.locator('textarea[name="taxEvidence"]') });
    await evidencePanel.locator("summary").click();
    await evidencePanel.getByLabel("Dispute or ownership concern").fill("Browser fixture ownership review");
    const holdResponse = page.waitForResponse(response => response.url().includes("/api/team/acquisition-evidence-dispute") && response.request().method() === "POST");
    await evidencePanel.getByRole("button", { name: "Hold rewards for dispute", exact: true }).click();
    const held = await holdResponse;
    assert.equal(held.status(), 200, `Dispute hold failed: ${await held.text()}`);
    await evidencePanel.getByText("Disputed: payout approval and payment recording are blocked until an administrator resolves this concern.", { exact: true }).waitFor();
    await evidencePanel.getByLabel("I confirm the ownership or payment concern is resolved", { exact: false }).check();
    await evidencePanel.getByLabel("Tax/invoice references, one per line").fill("browser-tax-reference");
    await evidencePanel.getByLabel("Cost/refund/settlement references, one per line").fill("browser-settlement-reference");
    await evidencePanel.getByLabel("Review reason", { exact: true }).fill("Browser fixture ownership outcome confirmed");
    await evidencePanel.getByLabel("Provider adjustment reference", { exact: true }).fill("browser-dispute-resolution");
    const reviewResponse = page.waitForResponse(response => response.url().includes("/api/team/acquisition-evidence-review") && response.request().method() === "POST");
    await evidencePanel.getByRole("button", { name: "Reconcile or record adjustment", exact: true }).click();
    const reviewed = await reviewResponse;
    assert.equal(reviewed.status(), 200, `Dispute resolution failed: ${await reviewed.text()}`);
    await evidencePanel.getByRole("button", { name: "Hold rewards for dispute", exact: true }).waitFor();
    await page.getByRole("button", { name: "Payout Management", exact: true }).click();
    const pending = page.locator("article").filter({ has: page.getByRole("heading", { name: /^Researcher:/ }) });
    await pending.getByLabel("Approval reason").fill("Browser fixture batch reservation");
    await pending.getByRole("button", { name: "Approve payout batch", exact: true }).click();
    const reserved = page.locator("article").filter({ has: page.getByRole("heading", { name: /^Approved: Researcher,/ }) });
    await reserved.getByLabel("Payment evidence / reason").fill("Browser fixture cancellation without transfer");
    await reserved.getByRole("button", { name: "Cancel unpaid batch", exact: true }).click();
    await page.getByText(/Cancelled batch .*Browser fixture cancellation without transfer/).waitFor();
    await page.getByText(/Loading workspace records/).waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Acquisition Dashboard", exact: true }).click();
    // Inline the calculation so tsx does not introduce a named helper closure.
    const contrast = await page.getByText("PENDING rewards", { exact: true }).evaluate(element => {
      const luminances = [getComputedStyle(element).color, getComputedStyle(element.closest("article")!).backgroundColor].map(value => {
        const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
        const context = canvas.getContext("2d")!; context.fillStyle = value; context.fillRect(0, 0, 1, 1);
        const channels = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      });
      return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
    });
    assert.ok(contrast >= 4.5, `Reward card text must have readable contrast (actual ${contrast}).`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "Acquisition dashboard must fit a mobile viewport.");
    mkdirSync(".cache", { recursive: true });
    await page.screenshot({ path: ".cache/acquisition-mobile.png", fullPage: true });
    const outsider = await browser.newContext({ extraHTTPHeaders: proxyHeaders });
    assert.equal((await outsider.request.get(`${origin}/api/team/acquisition-evidence`)).status(), 401);
    console.log("PASS production build browser checks: acquisition navigation, lead views, rewards, reconciliation, settings, outreach, customer attribution, mobile width, and anonymous API denial. No emails or payouts were sent.");
  } finally {
    await browser.close();
    if (process.platform === "win32" && server.pid) await new Promise<void>(resolve => { const stop = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); stop.on("exit", () => resolve()); });
    else server.kill();
    await prisma.$disconnect();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
