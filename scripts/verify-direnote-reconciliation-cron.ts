import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { GET as cron } from "../app/api/cron/direnote-release-sync/route";

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

    await prisma.distributionSubmissionAttempt.updateMany({ where: { releaseId: failedFixture.id, isCurrent: true }, data: { lastCheckedAt: new Date(0) } });
    const second = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    const secondResult = await second.json();
    assert.equal(secondResult.checked, 8, "The failed release and already-corrected releases remain eligible for later reconciliation.");
    assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: failedFixture.id } })).status, "CHANGES_REQUESTED");
    for (const fixture of fixtures) assert.equal(await prisma.emailLog.count({ where: { entityId: String(fixture.id), template: "release_changes_requested" } }), 1, "Repeated correction polling must not duplicate the artist email.");
    assert.equal(statusRequests, 18, "Only the failed release should consume two bounded retries before succeeding in the next run.");
    console.log("PASS DireNote reconciliation cron: eight-release batches, reconciliation_required recovery, one provider failure without stopping peers, later retry, correction status projection, no duplicate email, and no duplicate ingest.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
