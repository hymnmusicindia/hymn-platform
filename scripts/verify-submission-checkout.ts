import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { request as playwrightRequest } from "@playwright/test";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { checkoutPlan } from "../lib/distribution-checkout-plan";

const orders = new Map<string, { id: string; amount: number; currency: string; payment?: Record<string, unknown> }>();
export async function startCheckoutMock() {
  const server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    response.setHeader("Content-Type", "application/json");
    if (request.headers.authorization !== `Basic ${Buffer.from("rzp_test_fixture:fixture-razorpay-secret").toString("base64")}`) { response.writeHead(401).end('{"error":"fixture credentials required"}'); return; }
    const path = request.url ?? "";
    if (path === "/v1/orders" && request.method === "POST") {
      const body = JSON.parse(raw);
      const order = { id: `order_fixture_${orders.size + 1}`, amount: body.amount, currency: body.currency };
      orders.set(order.id, order);
      response.end(JSON.stringify({ ...order, entity: "order", status: "created" }));
      return;
    }
    const payments = path.match(/^\/v1\/orders\/([^/]+)\/payments$/);
    if (payments) { const order = orders.get(payments[1]); response.end(JSON.stringify({ entity: "collection", items: order?.payment ? [order.payment] : [] })); return; }
    const payment = [...orders.values()].find(order => path === `/v1/payments/${order.payment?.id}`)?.payment;
    if (payment) { response.end(JSON.stringify(payment)); return; }
    response.writeHead(404).end('{"error":"Unknown fixture request"}');
  });
  await new Promise<void>(resolve => server.listen(55442, "127.0.0.1", resolve));
  return { stop: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

export async function verifySubmissionCheckout() {
  assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\//);
  const origin = "http://127.0.0.1:55441";
  let sequence = 0;
  async function fixture(credits = 0) {
    const suffix = ++sequence;
    const user = await prisma.user.create({ data: { googleId: `checkout-fixture-${suffix}`, name: "Checkout Artist", email: `checkout-${suffix}@example.test`, referralCredits: credits, role: "CUSTOMER", status: "ACTIVE", onboardingDone: true } });
    const artist = await prisma.artistCard.create({ data: { userId: user.id, artistName: "Checkout Artist", instagramUrl: "https://instagram.com/checkout_artist" } });
    const client = await playwrightRequest.newContext({ baseURL: origin, extraHTTPHeaders: { "x-forwarded-proto": "https", Cookie: `hymn_session=${jwt.sign({ sub: user.id, email: user.email, name: user.name, role: "customer" }, process.env.JWT_SECRET!, { expiresIn: "1h" })}` } });
    async function draft(status: "DRAFT" | "AWAITING_PAYMENT" = "DRAFT") {
      const release = await prisma.release.create({ data: { userId: user.id, title: "Submission Fixture", artistName: artist.artistName, genre: "Pop", releaseDate: new Date("2099-01-10"), releaseType: "single", status, paymentStatus: "pending", reviewConfirmedAt: new Date(), reviewConfirmedBy: user.id } });
      async function asset(file: string, mime: string) {
        const row = await prisma.storedAsset.create({ data: { ownerUserId: user.id, releaseId: release.id, assetType: mime === "image/jpeg" ? "private_unreleased_artwork" : "private_unreleased_audio", storageProvider: "local", objectKey: `checkout-fixture/${release.id}/${file}`, originalFilename: file, safeFilename: file, mimeType: mime, byteSize: 100, checksum: "fixture", accessClassification: "private", uploadStatus: "ready" } });
        return `/api/assets/${row.id}/download?filename=${file}`;
      }
      const artwork = await asset("cover.jpg", "image/jpeg");
      const audio = await asset("master.wav", "audio/wav");
      const metadata = { artistName: artist.artistName, releaseTitle: release.title, releaseType: "single", releaseDate: "2099-01-10", recordLabelName: "Fixture Records", primaryGenre: "Pop", secondaryGenre: "Indie Pop", language: "Hindi", contentType: "Original/Exclusive Licensed", territory: "Worldwide", releaseTiming: "schedule_release", platforms: ["Spotify"], copyrightOwner: "2026 Fixture Records", publishingRights: "2026 Fixture Artist", legal: { ownershipConfirmation: true, noInfringement: true, collaboratorsCredited: true, platformGuidelines: true, hymnNotLiable: true, termsAccepted: true, falseMetadataAcknowledged: true, fraudWarningAccepted: true }, paymentModel: "one_time", plan: "one_time", artworkFileKey: "artwork", uploadedArtworkUrl: artwork, tracks: [{ trackTitle: release.title, trackNumber: 1, primaryArtist: artist.artistName, artistProfileIds: [artist.id], songwriters: "Fixture Artist", composers: "Fixture Artist", producers: "Fixture Artist", version: "Instrumental", language: "Hindi", isCover: false, coverLicenseConfirmed: false, audioFileKey: "audio-0", uploadedAudioUrl: audio, duration: "180", explicitContent: false, dolbyAtmos: false }] };
      return { release, metadata };
    }
    async function subscription(plan = "half_yearly", limit: number | null = 1) {
      return prisma.subscription.create({ data: { userId: user.id, plan, status: "active", expiryDate: new Date("2099-12-31"), currentPeriodStart: new Date("2026-01-01"), currentPeriodEnd: new Date("2099-12-31"), releaseLimit: limit } });
    }
    async function create(draftId: number, plan = "one_time", extra = {}) {
      const response = await client.post("/api/distribution/payment/create-order", { data: { draftReleaseId: draftId, plan, paymentModel: plan === "one_time" ? "one_time" : "subscription", trackCount: 1, releaseType: "single", platforms: ["Spotify"], ...extra } });
      return { status: response.status(), body: await response.json() };
    }
    async function submit(draft: { release: { id: number }; metadata: Record<string, any> }, order: Record<string, any>, plan: string, extra = {}) {
      const paymentId = order.paymentId || (order.subscriptionCovered ? `subscription_fixture_${order.orderId}` : order.orderId.startsWith("free_first_release_") ? `free_fixture_${order.orderId}` : `pay_fixture_${order.orderId}`);
      const signature = createHmac("sha256", "fixture-razorpay-secret").update(`${order.orderId}|${paymentId}`).digest("hex");
      const payload = { razorpay_order_id: order.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature, draftReleaseId: draft.release.id, metadata: { ...draft.metadata, plan, paymentModel: plan === "one_time" ? "one_time" : "subscription" }, ...extra };
      const response = await client.post("/api/distribution/payment/verify-submit", { multipart: { payload: JSON.stringify(payload) } });
      return { status: response.status(), body: await response.json() };
    }
    return { user, artist, client, draft, subscription, create, submit };
  }
  const contexts: Awaited<ReturnType<typeof fixture>>[] = [];
  const make = async (credits = 0) => { const context = await fixture(credits); contexts.push(context); return context; };
  const captured = (orderId: string) => { const order = orders.get(orderId)!; assert(order); order.payment = { id: `pay_fixture_${orderId}`, order_id: orderId, amount: order.amount, currency: "INR", status: "captured" }; };
  const passed = (result: { status: number; body: any }, expected = 201) => assert.equal(result.status, expected, JSON.stringify(result.body));
  try {
    const active = await make();
    const sub = await active.subscription();
    const draft = await active.draft();
    const entitlement = await active.create(draft.release.id, "half_yearly"); passed(entitlement, 200);
    passed(await active.submit(draft, entitlement.body, "half_yearly"));
    assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: draft.release.id } })).status, "UNDER_REVIEW");
    passed(await active.submit(draft, entitlement.body, "half_yearly"), 200);
    assert.equal(await prisma.subscriptionReleaseUsage.count({ where: { subscriptionId: sub.id } }), 1);
    const exhausted = await active.draft("AWAITING_PAYMENT");
    passed(await active.create(exhausted.release.id, "half_yearly"), 409);
    const paidOrder = await active.create(exhausted.release.id, "one_time", { useHymnCredits: true }); passed(paidOrder, 200);
    assert.equal(paidOrder.body.requiresPayment, true); assert.equal(paidOrder.body.creditsUsed, 0);
    captured(paidOrder.body.orderId);
    passed(await active.submit(exhausted, paidOrder.body, "one_time"));
    assert.equal(await prisma.subscriptionReleaseUsage.count({ where: { subscriptionId: sub.id } }), 1);

    for (const credits of [99, 50]) {
      const account = await make(credits); const item = await account.draft();
      const order = await account.create(item.release.id, "one_time", { useHymnCredits: true }); passed(order, 200);
      assert.equal(order.body.creditsUsed, credits);
      if (order.body.requiresPayment) captured(order.body.orderId);
      passed(await account.submit(item, order.body, "one_time"));
      passed(await account.submit(item, order.body, "one_time"), 200);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: account.user.id } })).referralCredits, 0);
      assert.equal(await prisma.creditLedgerEntry.count({ where: { userId: account.user.id, type: "DISTRIBUTION_PURCHASE" } }), 1);
    }

    const stale = await make(99); await stale.subscription("yearly", 18); const item = await stale.draft();
    const original = await stale.create(item.release.id, "one_time", { useHymnCredits: true }); passed(original, 200);
    const resumed = await stale.create(item.release.id, "yearly"); passed(resumed, 200);
    assert.equal(resumed.body.orderId, original.body.orderId);
    passed(await stale.submit(item, resumed.body, "yearly"), 400);
    passed(await stale.submit(item, resumed.body, checkoutPlan(resumed.body, "yearly")));

    const unlimited = await make(); const unlimitedSub = await unlimited.subscription("yearly_plus", null);
    const unlimitedDraft = await unlimited.draft(); const unlimitedOrder = await unlimited.create(unlimitedDraft.release.id, "yearly_plus");
    passed(unlimitedOrder, 200); passed(await unlimited.submit(unlimitedDraft, unlimitedOrder.body, "yearly_plus"));
    assert.equal(await prisma.subscriptionReleaseUsage.count({ where: { subscriptionId: unlimitedSub.id } }), 1);

    const concurrent = await make(); const concurrentSub = await concurrent.subscription();
    const left = await concurrent.draft(); const right = await concurrent.draft();
    const leftOrder = await concurrent.create(left.release.id, "half_yearly"); const rightOrder = await concurrent.create(right.release.id, "half_yearly");
    const attempts = await Promise.all([concurrent.submit(left, leftOrder.body, "half_yearly"), concurrent.submit(right, rightOrder.body, "half_yearly")]);
    assert.equal(attempts.filter(result => result.status === 201).length, 1, JSON.stringify(attempts));
    assert.equal(await prisma.subscriptionReleaseUsage.count({ where: { subscriptionId: concurrentSub.id } }), 1);

    const retry = await make(); const retrySub = await retry.subscription(); const retryDraft = await retry.draft(); const retryOrder = await retry.create(retryDraft.release.id, "half_yearly");
    const validArtwork = retryDraft.metadata.uploadedArtworkUrl;
    retryDraft.metadata.uploadedArtworkUrl = "/api/assets/99999999/download?filename=missing.jpg";
    passed(await retry.submit(retryDraft, retryOrder.body, "half_yearly"), 400);
    assert.equal(await prisma.subscriptionReleaseUsage.count({ where: { subscriptionId: retrySub.id } }), 0);
    retryDraft.metadata.uploadedArtworkUrl = validArtwork;
    passed(await retry.submit(retryDraft, retryOrder.body, "half_yearly"));

    const expired = await make(99); const expiredDraft = await expired.draft();
    await prisma.distributionOrder.create({ data: { userId: expired.user.id, releaseId: expiredDraft.release.id, plan: "half_yearly", amount: 0, paymentStatus: "paid", razorpayOrderId: `sub_entitlement_expired_${expired.user.id}`, razorpayPaymentId: `subscription_expired_${expired.user.id}` } });
    const fallback = await expired.create(expiredDraft.release.id, "one_time", { useHymnCredits: true });
    passed(fallback, 200); assert.equal(fallback.body.plan, "one_time");
    passed(await expired.submit(expiredDraft, fallback.body, "one_time"));

    const invalid = await make(); const invalidDraft = await invalid.draft(); const invalidOrder = await invalid.create(invalidDraft.release.id);
    captured(invalidOrder.body.orderId);
    passed(await invalid.submit(invalidDraft, invalidOrder.body, "one_time", { razorpay_signature: "bad" }), 400);
    assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: invalidDraft.release.id } })).paymentStatus, "pending");
    passed(await invalid.submit(invalidDraft, invalidOrder.body, "one_time"));

    await prisma.promotion.upsert({ where: { code: "FIRST_RELEASE_FREE" }, update: { active: true }, create: { code: "FIRST_RELEASE_FREE", name: "Fixture first release", product: "distribution", discountType: "fixed", discountValue: 99 } });
    const free = await make(); const freeDraft = await free.draft(); const freeOrder = await free.create(freeDraft.release.id, "one_time", { promotionCode: "FIRST_RELEASE_FREE" });
    passed(freeOrder, 200); assert.equal(freeOrder.body.amount, 0);
    passed(await free.submit(freeDraft, freeOrder.body, "one_time", { promotionCode: "FIRST_RELEASE_FREE" }));
    assert.equal(await prisma.promotionRedemption.count({ where: { userId: free.user.id, status: "REDEEMED" } }), 1);
    console.log("Submission HTTP tests passed: subscription, exhausted allowance, zero/partial credits, captured payment, persisted-plan recovery, unlimited plan, last-slot concurrency, replay, invalid signature and free first release.");
  } finally { for (const context of contexts) await context.client.dispose(); }
}
