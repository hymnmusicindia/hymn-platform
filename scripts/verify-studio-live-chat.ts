import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { chromium, expect as baseExpect } from "@playwright/test";
import { prisma } from "../lib/prisma";
const expect = baseExpect.configure({ timeout: 120000 });

async function main() {
  assert.match(process.env.DATABASE_URL || "", /127\.0\.0\.1:\d+\/studio_fixture/);
  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const order = await prisma.studioServiceOrder.findFirstOrThrow({ where: { projectTitle: "Integration Song" }, include: { customer: true, engineerParty: true } });
  const engineer = await prisma.user.findUniqueOrThrow({ where: { id: order.engineerParty.claimedByUserId! } });
  const outsider = await prisma.user.findFirstOrThrow({ where: { email: { startsWith: "studio-outsider-" } } });
  const browser = await chromium.launch();
  try {
    const contexts = await Promise.all([order.customer, engineer, outsider].map(async user => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addCookies([{ name: "hymn_session", value: jwt.sign({ sub: user.id, name: user.name, email: user.email, role: "customer" }, process.env.JWT_SECRET!, { expiresIn: "1h" }), url: origin }]);
      return context;
    }));
    assert.equal((await contexts[2].request.get(`${origin}/api/studio/orders/${order.publicId}/stream`, { timeout: 120000 })).status(), 403);
    // Warm the development POST bundle before measuring send latency. First-use
    // compilation can exceed the application's intentional 20-second timeout.
    const warm = await contexts[0].request.post(`${origin}/api/studio/orders/${order.publicId}/messages`, { timeout: 120000, data: { body: "Warm Studio chat fixture", idempotencyKey: randomUUID() }, headers: { Origin: origin } });
    assert.equal(warm.status(), 201, await warm.text());
    // Development compiles shell widgets lazily. Warm their bundles as well:
    // otherwise concurrent first-use compilations can starve a timed send.
    for (const path of ["/api/account/presence", "/api/notifications?summary=1", "/api/newsletter/subscribe", "/api/reviews/eligible", `/api/studio/orders/${order.publicId}/workspace`]) await contexts[0].request.get(`${origin}${path}`, { timeout: 120000 });
    const client = await contexts[0].newPage();
    for (const page of [client]) {
      page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/messages")) console.log("Studio browser send dispatched."); });
      page.on("requestfailed", request => { if (request.url().endsWith("/messages")) console.log("Studio browser send failure:", request.failure()?.errorText); });
      page.on("pageerror", error => console.log("Studio browser error:", error.message));
      page.on("console", entry => { if (entry.type() === "error") console.log("Studio console error:", entry.text().slice(0, 1000)); });
      page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(120000);
      await page.goto(`${origin}/studio/orders/${order.publicId}`, { waitUntil: "load" });
      await expect(page.getByRole("textbox", { name: "Project message", exact: true })).toBeVisible();
      await page.waitForFunction(() => { const el = document.querySelector('textarea[aria-label="Project message"]'); if (!el) return false; const key = Object.keys(el).find(k => k.startsWith("__reactProps$")); return key && typeof (el as unknown as Record<string, {onChange?: unknown}>)[key]?.onChange === "function"; });
    }
    console.log("Studio chat participants hydrated.");
    await client.bringToFront();
    const body = `Live Studio ${randomUUID()}`;
    await client.getByRole("textbox", { name: "Project message", exact: true }).click();
    await client.getByRole("textbox", { name: "Project message", exact: true }).pressSequentially(body);
    await expect(client.getByRole("button", { name: "Send", exact: true })).toBeEnabled({ timeout: 10000 });
    await client.getByRole("button", { name: "Send", exact: true }).click();
    await expect(client.getByRole("log").getByText(body, { exact: true })).toBeVisible({ timeout: 700 });
    await expect.poll(() => prisma.studioMessage.count({ where: { orderId: order.id, body } })).toBe(1);
    console.log("Studio optimistic message persisted.");
    // Once both endpoints are warm, check receipt latency independently of sender optimism.
    const incoming = `Engineer answer ${randomUUID()}`;
    const start = Date.now();
    const response = await contexts[1].request.post(`${origin}/api/studio/orders/${order.publicId}/messages`, { data: { body: incoming, idempotencyKey: randomUUID() }, headers: { Origin: origin } });
    assert.equal(response.status(), 201);
    await expect(client.getByRole("log").getByText(incoming, { exact: true })).toBeVisible({ timeout: 5000 });
    console.log(`Warm streamed message receipt: ${Date.now() - start}ms (local fixture, not a production benchmark).`);
    await contexts[0].setOffline(true);
    const retryBody = `Retry Studio ${randomUUID()}`;
    await client.getByRole("textbox", { name: "Project message", exact: true }).pressSequentially(retryBody); await client.getByRole("button", { name: "Send", exact: true }).click();
    await expect(client.getByRole("button", { name: /Not sent.*retry/ })).toBeVisible();
    await contexts[0].setOffline(false);
    await client.getByRole("button", { name: /Not sent.*retry/ }).click();
    await expect.poll(() => prisma.studioMessage.count({ where: { orderId: order.id, body: retryBody } })).toBe(1);
    await client.setViewportSize({ width: 390, height: 844 });
    assert.ok(await client.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 2);
    const seller = await contexts[1].newPage(); seller.setDefaultNavigationTimeout(120000);
    await seller.goto(`${origin}/studio/orders/${order.publicId}`, { waitUntil: "load" });
    await expect(seller.getByRole("log").getByText(body, { exact: true })).toBeVisible();
    console.log("PASS: optimistic client send, streamed engineer reply, engineer history, retry deduplication, outsider denial and mobile overflow.");
  } catch (error) {
    for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) {
      console.log("Failed Studio page:", page.url(), (await page.locator("body").innerText().catch(() => "")).slice(-2000));
      await page.screenshot({ path: `.cache/studio-chat-failure-${index}.png`, fullPage: true }).catch(() => undefined);
    }
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
