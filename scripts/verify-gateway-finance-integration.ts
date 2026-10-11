import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { allocateCreatorShare, minor, normalizeRecon, validateMonth } from "../lib/gateway-finance-domain";
import { settlementWorkspace, syncSettlementMonth } from "../lib/gateway-settlements";
import { cancelRouteReservation, linkRouteAccount, refreshRouteTransfer, releaseRouteTransfer, reserveRouteEarning, routeWorkspace, submitRouteTransfer } from "../lib/razorpay-route";
import { processRazorpayEvent, receiveRazorpayEvent } from "../lib/payment-webhooks";

assert.match(process.env.DATABASE_URL || "", /127\.0\.0\.1:\d+\/gateway_fixture$/);
process.env.RAZORPAY_ROUTE_ENABLED = "true";
process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
process.env.RAZORPAY_KEY_SECRET = "fixture-secret";
const transfers: Array<Record<string, any>> = [];
let dispatchCount = 0; let uncertain = false; let failReportPage = false;
let rows: Array<Record<string, unknown>> = [];
const capturedAmount = 10000;
let providerRefund = 0;
let accountActivated = true;
let reportAmount = 9710;
const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = new URL(String(input)); assert.equal(url.origin, "https://api.razorpay.com");
  const path = url.pathname; const method = init?.method || "GET";
  if (path === "/v1/settlements/recon/combined") {
    const skip = Number(url.searchParams.get("skip")); const count = Number(url.searchParams.get("count"));
    if (failReportPage && skip > 0) return Response.json({}, { status: 500 });
    return Response.json({ items: rows.slice(skip, skip + count) });
  }
  if (path.startsWith("/v1/settlements/")) return Response.json({ id: path.split("/").at(-1), amount: reportAmount, status: "processed", utr: "FIXTURE-UTR", created_at: 1791806400 });
  if (path.includes("/products/")) return Response.json({ id: "acc_prd_fixture", account_id: "acc_fixture", product_name: "route", activation_status: accountActivated ? "activated" : "under_review" });
  if (path === "/v2/accounts/acc_fixture") return Response.json({ id: "acc_fixture", email: "creator@gateway.invalid" });
  if (/\/v1\/payments\/pay_\w+\/transfers/.test(path)) {
    const paymentId = path.split("/")[3];
    if (method === "POST") {
      dispatchCount++;
      const body = JSON.parse(String(init?.body));
      const transfer = { ...body.transfers[0], id: `trf_fixture${dispatchCount}`, source: paymentId, recipient: body.transfers[0].account, status: "processed", amount_reversed: 0, recipient_settlement_id: null };
      transfers.push(transfer);
      if (uncertain) throw new Error("Simulated response timeout after provider accepted transfer.");
      return Response.json({ items: [transfer] });
    }
    return Response.json({ items: transfers.filter(row => row.source === paymentId) });
  }
  if (path.startsWith("/v1/payments/")) return Response.json({ id: path.split("/").at(-1), order_id: `order_${path.split("/").at(-1)}`, status: "captured", amount: path.endsWith("pay_studioB") ? 5000 : capturedAmount, currency: "INR", amount_refunded: providerRefund });
  if (path.startsWith("/v1/transfers/")) {
    const row = transfers.find(item => item.id === path.split("/").at(-1)); assert.ok(row);
    if (method === "PATCH") Object.assign(row, JSON.parse(String(init?.body)));
    return Response.json(row);
  }
  if (path === "/v1/transfers") return Response.json({ items: transfers.filter(row => row.recipient_settlement_id === url.searchParams.get("recipient_settlement_id")) });
  throw new Error(`Unexpected provider request: ${method} ${path}`);
};

async function main() {
  await prisma.$executeRawUnsafe('TRUNCATE "users" RESTART IDENTITY CASCADE');
  await prisma.gatewayReconEntry.deleteMany(); await prisma.gatewaySettlement.deleteMany(); await prisma.gatewaySyncRun.deleteMany();
  assert.throws(() => minor(undefined)); assert.throws(() => minor(-1)); assert.throws(() => minor(1.2));
  assert.throws(() => validateMonth("2026-13")); assert.equal(validateMonth("2026-10").start.toISOString(), "2026-09-30T18:30:00.000Z");
  const allocated = allocateCreatorShare([{ paymentId: "a", amountMinor: 333 }, { paymentId: "b", amountMinor: 667 }], 701);
  assert.equal(allocated.reduce((sum, row) => sum + row.amountMinor, 0), 701);
  assert.throws(() => allocateCreatorShare([{ paymentId: "a", amountMinor: 100 }], 101));

  const creator = await prisma.user.create({ data: { googleId: "gateway-creator", email: "creator@gateway.invalid", name: "Fixture creator", referralCode: "GWCREATOR" } });
  const buyer = await prisma.user.create({ data: { googleId: "gateway-buyer", email: "buyer@gateway.invalid", name: "Fixture buyer", referralCode: "GWBUYER" } });
  const upload = await prisma.upload.create({ data: { userId: creator.id, kind: "AUDIO", storageKey: "gateway/beat", fileName: "beat.mp3", mimeType: "audio/mpeg", sizeBytes: 1 } });
  const beat = await prisma.beat.create({ data: { userId: creator.id, title: "Gateway test beat", bpm: 100, genre: "test", mood: "test", keySignature: "C", priceCents: 10000, generalPriceCents: 10000, exclusivePriceCents: 50000, status: "PUBLISHED", enabled: true, audioUploadId: upload.id } });
  await prisma.artistPayoutBalance.create({ data: { userId: creator.id, availableBalance: 1000, lifetimeEarnings: 1000 } });
  async function sale(paymentId: string) {
    const order = await prisma.checkoutOrder.create({ data: { userId: buyer.id, originalPrice: 100, finalAmount: 100, razorpayOrderId: `order_${paymentId}`, razorpayPaymentId: paymentId, paymentStatus: "paid" } });
    return prisma.beatSale.create({ data: { beatId: beat.id, producerUserId: creator.id, buyerUserId: buyer.id, orderId: order.id, paymentId, grossAmount: 100, netSaleAmount: 100, hymnCommissionAmount: 30, producerEarningAmount: 70, licenseType: "general" } });
  }
  await linkRouteAccount(creator.id, "acc_fixture", "acc_prd_fixture", null);
  await assert.rejects(linkRouteAccount(buyer.id, "acc_fixture", "acc_prd_fixture", null), /email/);
  const first = await sale("pay_first"); const key = `beat:${first.id}`;
  const [intent] = await reserveRouteEarning(key, null);
  await reserveRouteEarning(key, null);
  let balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: creator.id } });
  assert.equal(Number(balance.availableBalance), 930); assert.equal(Number(balance.pendingBalance), 70);
  assert.equal(await prisma.routeTransfer.count({ where: { sourceKey: key } }), 1);
  assert.equal((await submitRouteTransfer(intent.id, null)).status, "held");
  await submitRouteTransfer(intent.id, null); assert.equal(dispatchCount, 1);
  await assert.rejects(cancelRouteReservation(intent.id, null), /attempted/);
  providerRefund = 1; await assert.rejects(releaseRouteTransfer(intent.id, null), /refunded/); providerRefund = 0;
  accountActivated = false; await assert.rejects(releaseRouteTransfer(intent.id, null), /activated/); accountActivated = true;
  assert.equal((await releaseRouteTransfer(intent.id, null)).status, "processing");
  balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: creator.id } }); assert.equal(Number(balance.lifetimePaid), 0, "A released transfer is not yet a paid bank settlement.");
  transfers[0].recipient_settlement_id = "setl_creator";
  assert.equal((await refreshRouteTransfer(intent.id)).status, "processing", "Settlement ID alone cannot prove the creator was paid.");
  transfers[0].settlement_status = "settled";
  assert.equal((await refreshRouteTransfer(intent.id)).status, "settled");
  await refreshRouteTransfer(intent.id);
  balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: creator.id } });
  assert.equal(Number(balance.pendingBalance), 0); assert.equal(Number(balance.lifetimePaid), 70);
  assert.equal(await prisma.walletTransaction.count({ where: { idempotencyKey: `route:${intent.id}:settled` } }), 1);

  const timeoutSale = await sale("pay_timeout"); const [timeoutIntent] = await reserveRouteEarning(`beat:${timeoutSale.id}`, null);
  uncertain = true; await assert.rejects(submitRouteTransfer(timeoutIntent.id, null), /timeout/); uncertain = false;
  const before = dispatchCount; assert.equal((await submitRouteTransfer(timeoutIntent.id, null)).status, "held"); assert.equal(dispatchCount, before, "Uncertain POST must be reconciled, never replayed.");
  transfers[1].amount_reversed = 100; assert.equal((await refreshRouteTransfer(timeoutIntent.id)).status, "review");
  await assert.rejects(releaseRouteTransfer(timeoutIntent.id, null), /unreversed/);

  const cancelledSale = await sale("pay_cancel"); const [cancelled] = await reserveRouteEarning(`beat:${cancelledSale.id}`, null);
  const oldBalance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: creator.id } });
  await cancelRouteReservation(cancelled.id, null);
  const afterCancel = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: creator.id } });
  assert.equal(Number(afterCancel.availableBalance), Number(oldBalance.availableBalance) + 70);
  await assert.rejects(cancelRouteReservation(cancelled.id, null));
  const badSale = await sale("pay_refund"); await prisma.beatSale.update({ where: { id: badSale.id }, data: { refundedAmount: 1 } });
  await assert.rejects(reserveRouteEarning(`beat:${badSale.id}`, null), /unrefunded/);

  const concurrentSale = await sale("pay_concurrent");
  await Promise.allSettled([reserveRouteEarning(`beat:${concurrentSale.id}`, null), reserveRouteEarning(`beat:${concurrentSale.id}`, null)]);
  assert.equal(await prisma.routeTransfer.count({ where: { sourceKey: `beat:${concurrentSale.id}` } }), 1, "Concurrent reservations cannot create two intents.");

  const party = await prisma.contributorParty.create({ data: { publicId: "HYM_GATEWAY_ENGINEER", professionalName: "Fixture engineer", displayName: "Fixture engineer", claimedByUserId: creator.id, createdByUserId: creator.id, identityState: "CLAIMED" } });
  const engineer = await prisma.engineerProfile.create({ data: { contributorPartyId: party.id, slug: "gateway-engineer", professionalName: "Fixture engineer" } });
  const listing = await prisma.studioServiceListing.create({ data: { engineerProfileId: engineer.id, title: "Fixture master", description: "Fixture", standardPrice: 150, includedRevisions: 1, additionalRevisionPrice: 50, turnaroundDays: 1, sourceRequirements: {}, deliverables: {} } });
  const studioOrder = await prisma.studioServiceOrder.create({ data: { customerId: buyer.id, engineerPartyId: party.id, engineerProfileId: engineer.id, serviceListingId: listing.id, serviceType: "MIXING_MASTERING", projectTitle: "Fixture master", basePrice: 100, finalPrice: 100, includedRevisions: 1, additionalRevisionPrice: 50, turnaroundDays: 1, commissionRate: 0.25, engineerShareRate: 0.75, status: "COMPLETED", paymentStatus: "RELEASED", termsVersion: "fixture", termsAcceptedAt: new Date() } });
  for (const [index, amount] of [100, 50].entries()) await prisma.studioPayment.create({ data: { orderId: studioOrder.id, purpose: index === 0 ? "INITIAL_ORDER" : "ADDITIONAL_REVISION", amount, status: "CAPTURED", razorpayOrderId: `order_pay_studio${index ? "B" : "A"}`, razorpayPaymentId: `pay_studio${index ? "B" : "A"}`, idempotencyKey: `fixture-studio-${index}` } });
  const earning = await prisma.studioEarning.create({ data: { orderId: studioOrder.id, engineerPartyId: party.id, grossAmount: 150, commissionAmount: 37.5, netAmount: 112.5, idempotencyKey: "fixture-studio-earning" } });
  const studioIntents = await reserveRouteEarning(`studio:${earning.id}`, null);
  assert.deepEqual(studioIntents.map(row => row.amountMinor).sort((a, b) => a - b), [3750, 7500]);
  await submitRouteTransfer(studioIntents[0].id, null);
  await assert.rejects(cancelRouteReservation(studioIntents[1].id, null), /attempted/);

  const baseRow = { entity_id: "pay_first", type: "payment", amount: 10000, credit: 9710, debit: 0, fee: 290, tax: 44, currency: "INR", on_hold: false, settled: true, created_at: 1791806400, settled_at: 1791806400, settlement_id: "setl_hymn" };
  assert.equal(normalizeRecon(baseRow).paymentId, "pay_first");
  rows = [baseRow]; await syncSettlementMonth("2026-10"); await syncSettlementMonth("2026-10");
  assert.equal(await prisma.gatewayReconEntry.count(), 1);
  const workspace = await settlementWorkspace("2026-10");
  assert.equal(workspace.summary.grossMinor, 10000); assert.equal(workspace.summary.bankMinor, 9710); assert.equal(workspace.entries[0].match, "Matched");
  assert.equal(workspace.settlements[0].reconciliation, "Reconciled");
  assert.equal(workspace.settlements[0].differenceMinor, 0);
  reportAmount = 9709; await syncSettlementMonth("2026-10");
  assert.equal((await settlementWorkspace("2026-10")).settlements[0].reconciliation, "Difference to review");
  reportAmount = 9710;
  rows = [{ ...baseRow, amount: 11000 }]; await syncSettlementMonth("2026-10");
  assert.equal((await settlementWorkspace("2026-10")).entries[0].match, "Amount mismatch");
  // A later failed page must not overwrite the last complete snapshot.
  rows = Array.from({ length: 1001 }, (_, i) => ({ ...baseRow, entity_id: `pay_page${i}` })); failReportPage = true;
  await assert.rejects(syncSettlementMonth("2026-10"), /HTTP 500/);
  assert.equal(await prisma.gatewayReconEntry.count(), 1);
  assert.equal((await settlementWorkspace("2026-10")).latestRun?.status, "failed");
  failReportPage = false; rows = [baseRow]; reportAmount = 9710;
  const payload = { event: "settlement.processed", id: "evt_gateway", payload: { settlement: { entity: { id: "setl_hymn" } } } };
  const event = await receiveRazorpayEvent(Buffer.from(JSON.stringify(payload)), payload);
  await processRazorpayEvent(event.id); await processRazorpayEvent(event.id);
  assert.equal((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: event.id } })).processingState, "processed");
  assert.equal(dispatchCount, 3);
  writeFileSync(".cache/gateway-settlement-fixture.json", JSON.stringify(await settlementWorkspace("2026-10")));
  writeFileSync(".cache/gateway-route-fixture.json", JSON.stringify(await routeWorkspace()));
  console.log("PASS: settlement matching, idempotent imports, incomplete pagination, verified accounts, wallet reservations, held transfers, release, provider settlement, duplicate delivery, timeout recovery, reversals and cancellation.");
}
main().finally(async () => { global.fetch = originalFetch; await prisma.$disconnect(); }).catch(error => { console.error(error); process.exitCode = 1; });
