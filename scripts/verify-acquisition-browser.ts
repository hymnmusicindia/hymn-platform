import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";
import { teamMutation } from "../lib/team/service";
import { prisma } from "../lib/prisma";

async function main() {
  assert.equal(process.env.DATABASE_URL, "postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture", "Browser checks require the isolated acquisition fixture.");
  const origin = "http://127.0.0.1:35475";
  const publicOrigin = "https://hymnmusic.fun";
  const proxyHeaders = { "x-forwarded-host": "hymnmusic.fun", "x-forwarded-proto": "https" };
  const secret = "acquisition-browser-fixture-session-secret";
  const owner = await prisma.teamMember.findFirstOrThrow({ where: { user: { email: { startsWith: "r-" } } }, include: { user: true, role: true } });
  await teamMutation(owner, "prospects", { ownerId: owner.id, name: "Browser call contact", phone: "+919811223344", sourceUrl: "https://example.org/browser-contact", evidence: "Verified professional contact for browser fixture", categories: ["Distribution"], verified: true, contactEligibility: "LEGITIMATE_INTEREST", score: { intent: 0, relevance: 0, recency: 0, contactability: 0, fit: 0 } });
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
    await page.getByRole("button", { name: "Contacts & Calls", exact: true }).click();
    await page.getByRole("heading", { name: "Contacts & calls", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Business", exact: true }).count(), 0);
    await page.getByRole("button", { name: /Browser call contact/ }).click();
    const contact = page.getByRole("dialog", { name: "Contact: Browser call contact" });
    assert.equal(await contact.getByRole("link", { name: "WhatsApp", exact: true }).getAttribute("href"), "https://wa.me/919811223344");
    await contact.getByLabel(/Next call.*India time/).fill("2026-12-04T14:30");
    await contact.getByLabel("Call notes", { exact: true }).fill("Customer requested an afternoon follow-up");
    const savedCall = page.waitForResponse(response => response.url().includes("/api/team/prospect-call-save") && response.request().method() === "POST");
    await contact.getByRole("button", { name: "Save contact & next call", exact: true }).click();
    assert.equal((await savedCall).status(), 200);
    await contact.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: /Call queue/ }).click();
    await page.getByRole("button", { name: /Browser call contact/ }).waitFor();
    await page.getByRole("button", { name: "Pipeline", exact: true }).click();
    mkdirSync(".cache", { recursive: true });
    await page.screenshot({ path: ".cache/crm-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "CRM fits mobile width.");
    await page.screenshot({ path: ".cache/crm-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByText("Lead search, outreach & rewards", { exact: true }).click();
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
    const evidencePanel = page.locator("details").filter({ hasText: evidence.paymentId }).filter({ has: page.locator('textarea[name="taxEvidence"]') }).last();
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
    const researcher = await prisma.teamMember.findFirstOrThrow({ where: { workspace: { name: { startsWith: "Daily programme " } }, user: { name: "r2" } }, include: { user: true, role: true } });
    await teamMutation(researcher, "prospects", { ownerId: researcher.id, name: "Research verification fixture", phone: "+919825001122", sourceUrl: "https://example.org/research-verification", evidence: "Public professional contact awaiting verification", categories: ["Distribution"], verified: false, contactEligibility: "UNVERIFIED", score: { intent: 0, relevance: 0, recency: 0, contactability: 0, fit: 0 } });
    await context.addCookies([{ name: "hymn_session", value: jwt.sign({ sub: researcher.user.id, email: researcher.user.email, name: researcher.user.name, role: "customer" }, secret, { expiresIn: "1h" }), url: publicOrigin }]);
    await page.goto(`${publicOrigin}/team?module=work`);
    const guide = page.getByRole("region", { name: "Team guiding assistant" });
    await guide.getByText(/Add 15 verified, contactable leads today/).waitFor();
    await guide.getByText("Ask the guide", { exact: true }).click();
    await guide.getByRole("button", { name: "What counts as a lead?", exact: true }).click();
    await guide.getByRole("status").filter({ hasText: /Profile-only, duplicate, suppressed and unverified records/ }).waitFor();
    await guide.getByRole("button", { name: "Learn the research and handoff workflow", exact: false }).click();
    await page.locator("dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    await page.goto(`${publicOrigin}/team?module=acquisition`);
    await page.getByRole("button", { name: /Research verification fixture/ }).click();
    const research = page.getByRole("form", { name: "Research details", exact: true });
    await research.getByLabel("Contact eligibility").selectOption("LEGITIMATE_INTEREST");
    await research.getByLabel("I verified this professional contact source").check();
    const verified = page.waitForResponse(response => response.url().includes("/api/team/prospect-research-save") && response.request().method() === "POST");
    await research.getByRole("button", { name: "Save verified research", exact: true }).click();
    assert.equal((await verified).status(), 200);
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
    const rep = await prisma.teamMember.findFirstOrThrow({ where: { workspaceId: researcher.workspaceId, user: { name: "caller" } }, include: { user: true } });
    await context.addCookies([{ name: "hymn_session", value: jwt.sign({ sub: rep.user.id, email: rep.user.email, name: rep.user.name, role: "customer" }, secret, { expiresIn: "1h" }), url: publicOrigin }]);
    await page.goto(`${publicOrigin}/team?module=acquisition`);
    await page.getByRole("region", { name: "Team guiding assistant" }).getByText(/16 eligible leads in your queue/).waitFor();
    await page.getByRole("button", { name: /Call queue/ }).click();
    await page.getByRole("button", { name: /Daily artist 1 Distribution/ }).first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Add contact", exact: true }).count(), 0, "The call representative works assigned leads rather than researcher intake.");
    await page.screenshot({ path: ".cache/daily-call-rep-mobile.png", fullPage: true });
    console.log("PASS production build browser checks: acquisition navigation, lead views, rewards, reconciliation, settings, outreach, customer attribution, mobile width, and anonymous API denial. No emails or payouts were sent.");
  } finally {
    await browser.close();
    if (process.platform === "win32" && server.pid) await new Promise<void>(resolve => { const stop = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); stop.on("exit", () => resolve()); });
    else server.kill();
    await prisma.$disconnect();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
