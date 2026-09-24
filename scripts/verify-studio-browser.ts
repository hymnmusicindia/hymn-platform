import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import jwt from "jsonwebtoken";
import { chromium } from "@playwright/test";
import { prisma } from "../lib/prisma";

function directGet(url: string, cookie: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = http.get(url, { headers: { Cookie: cookie, Host: "127.0.0.1:55910", "X-Forwarded-Host": "127.0.0.1", "X-Forwarded-Proto": "https" } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
  });
}

function directPost(url: string, cookie: string, body: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const parsed = new URL(url);
    const request = http.request({ hostname: "127.0.0.1", port: 55910, path: `${parsed.pathname}${parsed.search}`, method: "POST", headers: { Cookie: cookie, Host: "127.0.0.1:55910", Origin: "http://127.0.0.1:55910", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers } }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject); request.end(body);
  });
}

async function main() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:55910";
  const output = path.resolve(".cache", "studio-ui-review");
  mkdirSync(output, { recursive: true });
  const order = await prisma.studioServiceOrder.findFirstOrThrow({ where: { projectTitle: "Integration Song" }, include: { customer: true, engineerProfile: true } });
  const sid = randomUUID();
  await prisma.session.create({ data: { userId: order.customerId, tokenHash: createHash("sha256").update(sid).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  const token = jwt.sign({ sub: order.customerId, email: order.customer.email, name: order.customer.name, role: "customer", sid }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  const targets = [
    { name: "discovery", url: "/studio" },
    { name: "profile", url: `/studio/engineers/${order.engineerProfile.slug}` },
    { name: "workspace", url: `/studio/orders/${order.publicId}` },
  ];
  const adminToken = jwt.sign({ username: "admin", role: "admin", sid: randomUUID() }, process.env.ADMIN_JWT_SECRET!, { expiresIn: "1h" });
  const adminCookie = `hymn_admin_session=${adminToken}`;
  const adminPage = await directGet("http://127.0.0.1:55910/admin/studio", adminCookie);
  assert.equal(adminPage.status, 200, adminPage.body.slice(0, 500));
  assert.match(adminPage.body, /Appoint an engineer/);
  const apiEngineerUser = await prisma.user.create({ data: { googleId: `studio-api-engineer-${randomUUID()}`, name: "API Appointed Engineer", email: `studio-api-engineer-${randomUUID()}@example.test` } });
  const apiSlug = `api-appointed-${randomUUID()}`;
  const appointmentResponse = await directPost("http://127.0.0.1:55910/api/admin/studio/engineers", adminCookie, JSON.stringify({
    userId: apiEngineerUser.id, professionalName: "API Appointed Engineer", slug: apiSlug, profilePhotoUrl: null, bio: "A verified engineer appointed through the protected admin API.", specialties: ["Mixing", "Mastering"], genres: ["Pop"], availability: "AVAILABLE", maxActiveOrders: 3, verificationState: "VERIFIED", sellerState: "ACTIVE", payoutState: "PENDING",
    listing: { title: "API mix and master", description: "A complete professional mix and master for commercial release.", standardPrice: 2200, beatCustomerPrice: 1800, includedRevisions: 2, additionalRevisionPrice: 400, turnaroundDays: 5, sourceRequirements: ["Consolidated stems"], deliverables: ["24-bit WAV"], instantAccept: false, active: true, paused: false },
  }));
  assert.equal(appointmentResponse.status, 201, appointmentResponse.body);
  assert.equal((await directGet(`http://127.0.0.1:55910/studio/engineers/${apiSlug}`, "")).status, 200);
  if (process.argv.includes("--http-only")) {
    const requestBaseUrl = "http://127.0.0.1:55910";
    for (const target of targets) {
      const response = await directGet(`${requestBaseUrl}${target.url}`, `hymn_session=${token}`);
      assert.equal(response.status, 200, `${target.url} should render successfully in production mode.`);
      assert.match(response.body, /HYMN|Studio/i);
    }
    console.log("Production-mode Studio discovery, profile, and authenticated workspace routes passed.");
    return;
  }
  const listing = await prisma.studioServiceListing.findFirstOrThrow({ where: { engineerProfileId: order.engineerProfileId, active: true } });
  const createBody = JSON.stringify({ listingPublicId: listing.publicId, projectTitle: "HTTP Payment Project", idempotencyKey: `http-order-${randomUUID()}`, termsAccepted: true });
  const createdResponse = await directPost("http://127.0.0.1:55910/api/studio/orders", `hymn_session=${token}`, createBody);
  assert.equal(createdResponse.status, 201, createdResponse.body);
  const created = JSON.parse(createdResponse.body).order as { id: number; publicId: string };
  const paymentResponse = await directPost(`http://127.0.0.1:55910/api/studio/orders/${created.publicId}/payment`, `hymn_session=${token}`, JSON.stringify({ idempotencyKey: `http-payment-${randomUUID()}` }));
  assert.equal(paymentResponse.status, 200, paymentResponse.body);
  const payment = JSON.parse(paymentResponse.body) as { orderId: string; amount: number; currency: string };
  assert.equal(payment.amount, 200000); assert.equal(payment.currency, "INR");
  const eventBody = JSON.stringify({ id: `evt_studio_http_${randomUUID()}`, event: "payment.captured", payload: { payment: { entity: { id: `pay_studio_http_${randomUUID()}`, order_id: payment.orderId, amount: payment.amount, currency: payment.currency, status: "captured" } } } });
  const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(eventBody).digest("hex");
  const webhookResponse = await directPost("http://127.0.0.1:55910/api/webhooks/razorpay", "", eventBody, { "X-Razorpay-Signature": signature });
  assert.equal(webhookResponse.status, 200, webhookResponse.body);
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: created.id } })).paymentStatus, "HELD");
  assert.equal(await prisma.studioPayment.count({ where: { orderId: created.id, status: "CAPTURED" } }), 1);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "tablet", width: 768, height: 1024 }, { name: "mobile", width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      await context.addCookies([{ name: "hymn_session", value: token, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(120000);
      for (const target of targets) {
        const response = await page.goto(`${baseUrl}${target.url}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForLoadState("load");
        assert.equal(response?.status(), 200, `${target.url} should render successfully.`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 2, `${target.url} has ${overflow}px horizontal overflow at ${viewport.name}.`);
        await page.screenshot({ path: path.join(output, `${viewport.name}-${target.name}.png`), fullPage: true });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`Studio UI review screenshots written to ${output}.`);
}

main().finally(() => prisma.$disconnect());
