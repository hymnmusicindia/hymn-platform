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

function directPost(url: string, cookie: string, body: string, headers: Record<string, string> = {}, method = "POST") {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const parsed = new URL(url);
    const request = http.request({ hostname: "127.0.0.1", port: 55910, path: `${parsed.pathname}${parsed.search}`, method, headers: { Cookie: cookie, Host: "127.0.0.1:55910", Origin: "https://127.0.0.1", "X-Forwarded-Host": "127.0.0.1", "X-Forwarded-Proto": "https", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers } }, response => {
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
    { name: "readiness", url: "/studio/readiness" },
    { name: "client-projects", url: "/dashboard/studio" },
  ];
  const adminToken = jwt.sign({ username: "admin", role: "admin", sid: randomUUID() }, process.env.ADMIN_JWT_SECRET!, { expiresIn: "1h" });
  const adminCookie = `hymn_admin_session=${adminToken}`;
  const adminPage = await directGet("http://127.0.0.1:55910/admin/studio", adminCookie);
  assert.equal(adminPage.status, 200, adminPage.body.slice(0, 500));
  assert.match(adminPage.body, /Appoint an engineer/);
  const apiEngineerUser = await prisma.user.create({ data: { googleId: `studio-api-engineer-${randomUUID()}`, name: "API Appointed Engineer", email: `studio-api-engineer-${randomUUID()}@example.test` } });
  const apiSlug = `api-appointed-${randomUUID()}`;
  const appointmentResponse = await directPost("http://127.0.0.1:55910/api/admin/studio/engineers", adminCookie, JSON.stringify({
    userId: apiEngineerUser.id, professionalName: "API Appointed Engineer", slug: apiSlug, profilePhotoUrl: null, bio: "A verified engineer appointed through the protected admin API.", specialties: ["Mixing", "Mastering"], genres: ["Pop"], socialLinks: { instagram: null, youtube: null }, portfolioItems: [{ title: "Featured mix", url: "https://example.com/featured-mix.wav" }], availability: "AVAILABLE", maxActiveOrders: 3, verificationState: "VERIFIED", sellerState: "ACTIVE", payoutState: "PENDING",
    listing: { title: "API mix and master", description: "A complete professional mix and master for commercial release.", standardPrice: 2200, beatCustomerPrice: 1800, includedRevisions: 2, additionalRevisionPrice: 400, turnaroundDays: 5, sourceRequirements: ["Consolidated stems"], deliverables: ["24-bit WAV"], instantAccept: false, active: true, paused: false },
  }));
  assert.equal(appointmentResponse.status, 201, appointmentResponse.body);
  assert.equal((await directGet(`http://127.0.0.1:55910/studio/engineers/${apiSlug}`, "")).status, 200);
  const engineerSid = randomUUID();
  await prisma.session.create({ data: { userId: apiEngineerUser.id, tokenHash: createHash("sha256").update(engineerSid).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  const engineerToken = jwt.sign({ sub: apiEngineerUser.id, email: apiEngineerUser.email, name: apiEngineerUser.name, role: "customer", sid: engineerSid }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  const engineerCookie = `hymn_session=${engineerToken}`;
  const profileInput = { professionalName: "Updated API Engineer", bio: "A new public biography describing my vocal mixing approach.", profilePhotoUrl: "https://example.com/photo.jpg", banner: "https://example.com/banner.jpg", instagram: "https://instagram.com/updated", youtube: "", specialties: ["Mixing"], genres: ["Hip-Hop"] };
  const profileUrl = "http://127.0.0.1:55910/api/studio/engineer/profile";
  assert.equal((await directPost(profileUrl, `hymn_session=${token}`, JSON.stringify(profileInput), {}, "PATCH")).status, 403, "A client cannot edit an engineer profile.");
  assert.equal((await directPost(profileUrl, engineerCookie, JSON.stringify({ ...profileInput, verificationState: "VERIFIED" }), {}, "PATCH")).status, 400, "Privileged fields must be rejected.");
  const beforeEdit = await prisma.engineerProfile.findUniqueOrThrow({ where: { slug: apiSlug } });
  const editResult = await directPost(profileUrl, engineerCookie, JSON.stringify(profileInput), {}, "PATCH");
  assert.equal(editResult.status, 200, editResult.body);
  const afterEdit = await prisma.engineerProfile.findUniqueOrThrow({ where: { slug: apiSlug } });
  assert.equal(afterEdit.bio, profileInput.bio);
  assert.equal(afterEdit.profilePhotoUrl, profileInput.profilePhotoUrl);
  assert.equal(afterEdit.verificationState, beforeEdit.verificationState);
  assert.deepEqual((afterEdit.portfolio as { works: unknown }).works, (beforeEdit.portfolio as { works: unknown }).works, "Editing identity must preserve work samples.");
  assert.match((await directGet(`http://127.0.0.1:55910/studio/engineers/${apiSlug}`, "")).body, /Updated API Engineer/);
  assert.match((await directGet("http://127.0.0.1:55910/studio/engineer/profile", engineerCookie)).body, /Make it yours/);
  assert.match((await directGet("http://127.0.0.1:55910/studio/engineer", engineerCookie)).body, /Edit profile/);
  await prisma.engineerProfile.update({ where: { id: afterEdit.id }, data: { sellerState: "PAUSED" } });
  assert.equal((await directPost(profileUrl, engineerCookie, JSON.stringify(profileInput), {}, "PATCH")).status, 403, "Paused profiles cannot bypass approval controls.");
  await prisma.engineerProfile.update({ where: { id: afterEdit.id }, data: { sellerState: "ACTIVE" } });
  if (process.argv.includes("--profile-only")) {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        await context.addCookies([{ name: "hymn_session", value: engineerToken, url: baseUrl }]);
        const page = await context.newPage();
        await page.route("https://example.com/**", route => route.abort());
        await page.goto(`${baseUrl}/studio/engineer/profile`, { waitUntil: "load", timeout: 60000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 2, `Editor overflow at ${width}px.`);
        await page.getByRole("textbox", { name: "Professional name", exact: true }).fill("Updated API Engineer");
        await page.getByRole("button", { name: "Save profile", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "Your public profile is updated." }).waitFor();
        await page.screenshot({ path: path.join(output, `profile-editor-${width}.png`), fullPage: true });
        await context.close();
      }
    } finally { await browser.close(); }
    console.log("Engineer profile ownership, permissions, persistence, public rendering, desktop/mobile editor and save checks passed.");
    return;
  }
  const vouch=await prisma.studioVouch.findFirstOrThrow({where:{engineerProfileId:order.engineerProfileId}}),credit=await prisma.studioShowcase.findFirstOrThrow({where:{engineerProfileId:order.engineerProfileId}}),review=await prisma.studioReview.findUniqueOrThrow({where:{orderId:order.id}});
  for(const [type,id]of [["VOUCH",vouch.id],["CREDIT",credit.id]] as const){const result=await directPost("http://127.0.0.1:55910/api/admin/studio/trust",adminCookie,JSON.stringify({type,id,approve:true}),{},"PATCH");assert.equal(result.status,200,result.body);}
  const publicVouch=await directGet(`http://127.0.0.1:55910/studio/share/vouch/${vouch.id}`,"");assert.equal(publicVouch.status,200);assert.match(publicVouch.body,/community collaborator/);
  const publicCredit=await directGet(`http://127.0.0.1:55910/studio/share/credit/${credit.id}`,"");assert.equal(publicCredit.status,200);
  const clientCard=await directGet(`http://127.0.0.1:55910/studio/share/client/${review.id}`,"");const imageMatch=clientCard.body.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);assert.ok(imageMatch,"The card must expose an Open Graph image.");const imagePath=new URL(imageMatch[1].replaceAll("&amp;","&")).pathname;const image=await directGet(`http://127.0.0.1:55910${imagePath}`,"");assert.equal(image.status,200);
  const revoke=await directPost(`http://127.0.0.1:55910/api/studio/credits/${credit.id}`,`hymn_session=${token}`,JSON.stringify({approve:false}));assert.equal(revoke.status,200,revoke.body);
  const withdrawn=await prisma.studioShowcase.findUniqueOrThrow({where:{id:credit.id}});assert.equal(withdrawn.artistConfirmedAt,null);assert.equal(withdrawn.status,"REJECTED");
  const withdrawnPage=await directGet(`http://127.0.0.1:55910/studio/share/credit/${credit.id}`,"");
  assert.ok(!withdrawnPage.body.includes(credit.title),"Revoked permission must immediately remove the public credit content.");
  assert.ok(withdrawnPage.status===404||/NEXT_HTTP_ERROR_FALLBACK;404|not be found/i.test(withdrawnPage.body),"A withdrawn share card must render the not-found result, including streamed 200 responses.");
  targets.push({name:"client-vouch",url:`/studio/share/client/${review.id}`},{name:"genre",url:"/studio/genres/hip-hop"});
  if (process.argv.includes("--http-only")) {
    const requestBaseUrl = "http://127.0.0.1:55910";
    for (const target of targets) {
      const response = await directGet(`${requestBaseUrl}${target.url}`, `hymn_session=${token}`);
      assert.equal(response.status, 200, `${target.url} should render successfully in production mode.`);
      assert.match(response.body, /HYMN|Studio/i);
    }
    const browser = await chromium.launch({headless:true});
    try {for(const viewport of [{name:"desktop",width:1440,height:1000},{name:"mobile",width:390,height:844}]){
      const context=await browser.newContext({viewport,extraHTTPHeaders:{"X-Forwarded-Host":"127.0.0.1","X-Forwarded-Proto":"https"}});
      await context.addCookies([{name:"hymn_session",value:token,url:baseUrl,httpOnly:true,sameSite:"Lax"}]);
      const page=await context.newPage();await page.goto(`${baseUrl}/studio/orders/${order.publicId}`,{waitUntil:"load"});
      await page.waitForResponse(response=>response.url().endsWith(`/studio/orders/${order.publicId}/workspace`)&&response.status()===200,{timeout:20000});
      const composer=page.getByRole("textbox",{name:"Project message",exact:true}),width=await composer.evaluate(element=>element.getBoundingClientRect().width);
      assert.ok(width>=140,`The ${viewport.name} composer is too narrow: ${width}px.`);
      assert.ok(await page.getByRole("log").evaluate(element=>element.scrollHeight>element.clientHeight),"The history must scroll.");
      await page.screenshot({path:path.join(output,`production-${viewport.name}-workspace.png`),fullPage:true});
      await context.close();
    }}finally{await browser.close();}
    console.log("Production-mode Studio, trust moderation, share artwork, consent withdrawal, and responsive conversation checks passed.");
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
      await page.goto(`${baseUrl}/studio/orders/${order.publicId}`, { waitUntil: "networkidle" });
      const testMessage=`Fast conversation ${viewport.name} ${randomUUID()}`;
      await page.route(`**/api/studio/orders/${order.publicId}/messages`, async route => { await new Promise(resolve=>setTimeout(resolve,900)); await route.continue(); });
      await page.getByRole("textbox",{name:"Project message",exact:true}).fill(testMessage);
      await page.getByRole("button",{name:"Send",exact:true}).click();
      await page.getByRole("log").getByText(testMessage,{exact:true}).waitFor({state:"visible",timeout:500});
      await page.waitForResponse(response=>response.url().endsWith(`/studio/orders/${order.publicId}/messages`)&&response.request().method()==="POST",{timeout:20000});
      await page.unroute(`**/api/studio/orders/${order.publicId}/messages`);
      const stored=await prisma.studioMessage.findFirstOrThrow({where:{orderId:order.id,body:testMessage}});
      assert.equal(stored.senderUserId,order.customerId);
      const historyBox=page.getByRole("log");
      const scrollable=await historyBox.evaluate(element=>element.scrollHeight>element.clientHeight);
      assert.ok(scrollable,"Conversation history must scroll without hiding the composer.");
      await page.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.waitForLoadState("load");
      const launcherButton = page.getByRole("button", { name: "Open HYMN apps" });
      await launcherButton.waitFor({ state: "visible" });
      await page.waitForFunction(() => document.readyState === "complete");
      await launcherButton.click();
      const appMenu = page.getByRole("menu", { name: "HYMN apps" });
      await appMenu.waitFor({ state: "visible" });
      await appMenu.getByRole("menuitem", { name: /Dashboard/ }).waitFor({ state: "visible" });
      await appMenu.getByRole("menuitem", { name: /Studio/ }).waitFor({ state: "visible" });
      await appMenu.getByRole("menuitem", { name: /Services/ }).waitFor({ state: "visible" });
      await appMenu.getByRole("menuitem", { name: /Audio Library/ }).waitFor({ state: "visible" });
      const launcherOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(launcherOverflow <= 2, `The app launcher has ${launcherOverflow}px horizontal overflow at ${viewport.name}.`);
      await page.screenshot({ path: path.join(output, `${viewport.name}-app-launcher.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await appMenu.waitFor({ state: "hidden" });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`Studio UI review screenshots written to ${output}.`);
}

main().finally(() => prisma.$disconnect());
