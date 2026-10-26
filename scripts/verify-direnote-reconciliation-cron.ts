import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { GET as cron } from "../app/api/cron/direnote-release-sync/route";
import { GET as revenueCron } from "../app/api/cron/direnote-revenue-sync/route";
import { pollDireNoteIngestJobs } from "../lib/direnote-ingest-jobs";

assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\/direnote_virtual/);
process.env.CRON_SECRET = "fixture-cron";
process.env.EMAIL_ENABLED = "false";

const originalFetch = globalThis.fetch;
const releasesByUpc = new Map<string, { title: string; isrc: string }>();
let failedUpc: string | null = null;
let failedRequests = 0;
let statusRequests = 0;
let ingestRequests = 0;

function upcFor(index: number) {
  const body = `3473620319${String(index).padStart(2, "0")}`;
  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(body[i]) * weight;
  return `${body}${(10 - sum % 10) % 10}`;
}

async function main() {
  const user = await prisma.user.create({ data: { googleId: "reconciliation-cron-fixture", name: "Fixture Artist", email: "reconciliation-cron@example.test", role: "CUSTOMER", status: "ACTIVE" } });
  const fixtures = [] as Array<{ id: number; upc: string; title: string; isrc: string; trackId: number }>;
  for (let index = 1; index <= 8; index++) {
    const title = `Deferred release ${index}`;
    const upc = upcFor(index);
    const isrc = `INDN2${String(2603200 + index).padStart(7, "0")}`;
    releasesByUpc.set(upc, { title, isrc });
    const release = await prisma.release.create({ data: {
      userId: user.id, title, artistName: "Fixture Artist", genre: "Pop", releaseType: "single", releaseDate: new Date("2099-01-01"),
      status: "UNDER_REVIEW", paymentStatus: "paid", upc, direNoteStatus: "processing",
      tracks: { create: [{ title, trackNumber: 1, isrc, primaryArtist: "Fixture Artist", metadata: { language: "English", version: "Original" } }] }
    }, include: { tracks: true } });
    await prisma.distributionSubmissionAttempt.create({ data: {
      releaseId: release.id, provider: "direnote", state: "reconciliation_required", isCurrent: true,
      idempotencyKey: `reconciliation-cron-${index}`, payloadHash: `reconciliation-cron-${index}`, upc,
      providerStatus: "processing", trackIdentifiers: [{ id: release.tracks[0].id, title, trackNumber: 1, isrc }]
    } });
    fixtures.push({ id: release.id, upc, title, isrc, trackId: release.tracks[0].id });
  }
  const abandonedTitle = "Resolved correction awaiting re-ingest";
  const abandonedUpc = upcFor(9);
  const abandoned = await prisma.release.create({ data: {
    userId: user.id, title: abandonedTitle, artistName: "Fixture Artist", genre: "Pop", releaseType: "single", releaseDate: new Date("2099-01-01"),
    status: "UNDER_REVIEW", paymentStatus: "paid", upc: abandonedUpc, direNoteStatus: "processing",
    tracks: { create: [{ title: abandonedTitle, trackNumber: 1, isrc: `INDN2${String(2603200 + 9).padStart(7, "0")}`, primaryArtist: "Fixture Artist", metadata: { language: "English", version: "Original" } }] }
  }, include: { tracks: true } });
  await prisma.distributionSubmissionAttempt.create({ data: {
    releaseId: abandoned.id, provider: "direnote", state: "submitted", isCurrent: true,
    idempotencyKey: "reconciliation-cron-abandoned", payloadHash: "reconciliation-cron-abandoned", upc: abandonedUpc,
    providerStatus: "changes_required", corrections: { status: "customer_resolved" },
    trackIdentifiers: [{ id: abandoned.tracks[0].id, title: abandonedTitle, trackNumber: 1, isrc: abandoned.tracks[0].isrc }]
  } });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.includes("check_release_status")) {
      statusRequests++;
      const fixture = releasesByUpc.get(String(body.upc));
      if (!fixture) return Response.json({ success: false, error: "Unknown fixture UPC." }, { status: 404 });
      if (String(body.upc) === failedUpc && failedRequests < 3) {
        failedRequests++;
        return Response.json({ success: false, error: "Fixture provider timeout." }, { status: 503 });
      }
      return Response.json({ success: true, release: { upc_code: body.upc, album_name: fixture.title, status: "Pending" }, tracks: [{ track_number: 1, track_name: fixture.title, isrc: fixture.isrc, status: "Rejected", remarks: "Please provide an acceptable sample licence." }] });
    }
    if (url.includes("check_qc_report")) return Response.json({ success: true, upc_code: body.upc, corrections: [] });
    if (url.includes("ingest_content")) ingestRequests++;
    return Response.json({ success: false, error: "Unmatched fixture request." }, { status: 404 });
  };

  try {
    failedUpc = fixtures[3].upc;
    const first = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    const firstResult = await first.json();
    const failedFixture = fixtures.find(fixture => fixture.upc === failedUpc)!;
    assert.equal(firstResult.candidateCount, 8, "The batch includes every current reconciliation-required attempt and excludes the abandoned resolved-correction attempt.");
    assert.equal(firstResult.checked, 8, "The worker must continue through all eligible releases after one provider failure.");
    assert.equal(firstResult.errorCount, 1, `A failed status lookup must be reported while other releases still sync: ${JSON.stringify(firstResult.results)}`);
    assert.equal(firstResult.results.find((item: any) => item.releaseId === failedFixture.id).success, false);
    assert.equal(firstResult.results.filter((item: any) => item.status === "changes_required").length, 7);
    assert.equal(ingestRequests, 0, "Status polling must never repeat provider ingestion for an ambiguous accepted attempt.");
    for (const fixture of fixtures.filter(fixture => fixture.id !== failedFixture.id)) {
      assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: fixture.id } })).status, "CHANGES_REQUESTED");
      assert.equal(await prisma.emailLog.count({ where: { entityId: String(fixture.id), template: "release_changes_requested" } }), 1);
    }

    const immediate = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    assert.equal((await immediate.json()).checked, 0, "Processing, correction and failed attempts must respect the polling interval.");
    await prisma.distributionSubmissionAttempt.updateMany({ where: { releaseId: { in: fixtures.map(fixture => fixture.id) }, isCurrent: true }, data: { lastCheckedAt: new Date(0) } });
    const second = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    const secondResult = await second.json();
    assert.equal(secondResult.checked, 8, "The failed release and already-corrected releases remain eligible for later reconciliation.");
    assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: failedFixture.id } })).status, "CHANGES_REQUESTED");
    for (const fixture of fixtures) assert.equal(await prisma.emailLog.count({ where: { entityId: String(fixture.id), template: "release_changes_requested" } }), 1, "Repeated correction polling must not duplicate the artist email.");
    assert.equal(statusRequests, 18, "Only the failed release should consume two bounded retries before succeeding in the next run.");
    await prisma.distributionSubmissionAttempt.updateMany({ where: { releaseId: { in: fixtures.map(fixture => fixture.id) }, isCurrent: true }, data: { lastCheckedAt: new Date(0) } });
    const reserved = await prisma.direNoteLog.count({ where: { action: "rate_limit_reservation" } });
    await prisma.direNoteLog.createMany({ data: Array.from({ length: Math.max(0, 95 - reserved) }, () => ({ action: "rate_limit_reservation", success: true, requestPayloadRedacted: { fixture: "budget-exhaustion" } })) });
    const failuresBefore = await prisma.direNoteLog.count({ where: { action: "release_sync_failed" } });
    const limited = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    const limitedResult = await limited.json();
    assert.equal(limited.status, 200, JSON.stringify(limitedResult));
    assert.equal(limitedResult.rateLimited, true);
    assert(limitedResult.retryAfterSeconds > 0);
    assert.equal(limitedResult.checked, 0);
    assert.equal(limitedResult.deferredCount, 8);
    assert.equal(limitedResult.errorCount, 0);
    assert.equal(statusRequests, 18, "Budget exhaustion must not send provider requests");
    assert.equal(await prisma.direNoteLog.count({ where: { action: "release_sync_failed" } }), failuresBefore);
    assert.equal(await prisma.distributionSubmissionAttempt.count({ where: { releaseId: { in: fixtures.map(fixture => fixture.id) }, lastCheckedAt: new Date(0) } }), 8, "Deferred releases must remain immediately eligible");
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await prisma.release.update({ where: { id: fixtures[0].id }, data: { status: "LIVE" } });
    const revenue = await revenueCron(new Request("http://localhost/api/cron/direnote-revenue-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    const revenueResult = await revenue.json();
    assert.equal(revenue.status, 200, JSON.stringify(revenueResult));
    assert.equal(revenueResult.rateLimited, true);
    assert.equal(revenueResult.checked, 0);
    assert(revenueResult.deferredCount > 0);
    const queued = await prisma.distributionSubmissionAttempt.updateMany({ where: { releaseId: fixtures[0].id, isCurrent: true }, data: { state: "submitted", providerStatus: "queued", responseRedacted: { ingestJobId: "budget-fixture-job" } } });
    assert.equal(queued.count, 1);
    const ingest = await pollDireNoteIngestJobs({ releaseId: fixtures[0].id });
    assert.equal(ingest.rateLimited, true);
    assert.equal(ingest.errorCount, 0);
    assert.equal(ingest.checked, 0);
    assert.equal(ingest.deferred, 1);
    await prisma.direNoteLog.deleteMany({ where: { action: "rate_limit_reservation", requestPayloadRedacted: { path: ["fixture"], equals: "budget-exhaustion" } } });
    await prisma.distributionSubmissionAttempt.updateMany({ where: { releaseId: fixtures[0].id, isCurrent: true }, data: { providerStatus: "processing", responseRedacted: {} } });
    const fixtureFetch = globalThis.fetch;
    let throttledCalls = 0;
    globalThis.fetch = async () => { throttledCalls++; return new Response("Slow down", { status: 429, headers: { "retry-after": "120" } }); };
    const throttled = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    const throttledResult = await throttled.json();
    assert.equal(throttled.status, 200, JSON.stringify(throttledResult));
    assert.equal(throttledResult.rateLimited, true);
    assert.equal(throttledResult.errorCount, 0);
    assert.equal(throttledResult.deferredCount, 8);
    assert(throttledCalls >= 1 && throttledCalls <= 3, "Only requests already in flight may reach a throttled provider");
    assert.equal(await prisma.direNoteLog.count({ where: { action: "release_sync_failed" } }), failuresBefore);
    await prisma.direNoteLog.deleteMany({ where: { action: "provider_rate_limit" } });
    globalThis.fetch = fixtureFetch;
    const resumed = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    const resumedResult = await resumed.json();
    assert.equal(resumedResult.checked, 8, JSON.stringify(resumedResult));
    assert.equal(resumedResult.errorCount, 0);
    console.log("PASS DireNote reconciliation: bounded polling, recovery, real error reporting, correction/email deduplication, no duplicate ingest, capacity deferral across release/revenue/ingest jobs, provider 429 cooldown and successful resumption.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
