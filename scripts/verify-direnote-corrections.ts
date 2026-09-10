import assert from "node:assert/strict";
import { extractDireNoteCorrections, matchDireNoteTrack, direNoteCorrectionFingerprint } from "../lib/direnote-corrections";
import { normalizeDireNoteUpc, upcFromDireNoteIsrcReport } from "../lib/direnote-upc";

// Isolated stubs only: no real provider, database, email, or customer is contacted.
process.env.DATABASE_URL = "postgresql://test:test@localhost:1/corrections_test";
process.env.DIRENOTE_CLIENT_ID = "fixture-client";
process.env.DIRENOTE_API_PIN = "fixture-pin";
process.env.DIRENOTE_INGEST_ENDPOINT = "https://direnote.invalid/ingest_content";
const tracks = [
  { id: 101, title: "purple", isrc: "INDN22602442", trackNumber: 1 },
  { id: 102, title: "pink", isrc: "INDN22602443", trackNumber: 2 }
];
const remark = "Seems like an instrumental please select relevant track";
assert.equal(normalizeDireNoteUpc("auto-generated"), null);
assert.equal(normalizeDireNoteUpc("890-1234 567890"), "8901234567890");
assert.equal(upcFromDireNoteIsrcReport({ track: { isrc: tracks[0].isrc, release_title: "Wrong album", upc: "8901234567890" } }, tracks[0].isrc, "Magenta"), null);
assert.equal(upcFromDireNoteIsrcReport({ track: { isrc: tracks[1].isrc, release_title: "Magenta", upc: "8901234567890" } }, tracks[0].isrc, "Magenta"), null);
assert.equal(upcFromDireNoteIsrcReport({ data: { track: { isrc: tracks[0].isrc, album_name: "Magenta", upc_code: "8901234567890" } } }, tracks[0].isrc, "Magenta"), "8901234567890");
assert.equal(upcFromDireNoteIsrcReport({ result: { tracks: [{ isrc: tracks[1].isrc, release_name: "Magenta", upc: "8901234567891" }, { isrc: tracks[0].isrc, release_name: "Magenta", UPC: "8901234567890" }] } }, tracks[0].isrc, "Magenta"), "8901234567890");
assert.equal(upcFromDireNoteIsrcReport({ data: { track: { isrc: tracks[0].isrc, upc: "8901234567890" } } }, tracks[0].isrc, "Magenta"), "8901234567890");
assert.equal(upcFromDireNoteIsrcReport({ data: { release: { upc_code: "8901234567890" }, track: { isrc: tracks[0].isrc, release_title: "Magenta" } } }, tracks[0].isrc, "Magenta"), "8901234567890");
const payload = { success: true, release: { status: "Pending" }, tracks: tracks.map((track, index) => ({ track_name: track.title, isrc: track.isrc, status: "Pending", remarks: index ? remark : "NONE" })) };
const issues = extractDireNoteCorrections(payload, tracks, 19);
const contentIdCorrection = extractDireNoteCorrections({ release: { remarks: "PLEASE CLARIFY WHY THE CONTENT ID SET TO 'NO'" } }, tracks, 19)[0];
assert.equal(contentIdCorrection.field, "rights.contentId");
assert.equal(contentIdCorrection.label, "Rights · Content ID");
assert.equal(extractDireNoteCorrections({ remarks: "TRACK 2 SEEMS LIKE AN INSTRUMENTAL. PLEASE SELECT RELEVANT TRACK LANGUAGE" }, tracks, 19)[0].field, "tracks.1.trackLanguage");
assert.equal(issues.length, 1);
assert.match(issues[0].field, /^tracks\.1\.providerCorrection\./);
assert.equal(issues[0].label, "Track 2 · DireNote correction");
assert.match(issues[0].note, /instrumental/);
assert.equal(extractDireNoteCorrections({ message: "Release information fetched successfully", tracks: [{ status: "Pending", remarks: "NONE" }, { remarks: "ISRC generated" }] }, tracks, 19).length, 0);
assert.equal(extractDireNoteCorrections({ release: { remarks: "Please update the artwork" } }, tracks, 19)[0].label, "Release · DireNote correction");
assert.equal(extractDireNoteCorrections({ tracks: [{ ...payload.tracks[1], status: "Correction Required" }] }, tracks, 19).length, 1);
assert.equal(extractDireNoteCorrections({ tracks: [{ ...payload.tracks[1], remarks: undefined, remark }] }, tracks, 19).length, 1);
assert.equal(matchDireNoteTrack({ isrc: "", track_name: "" }, tracks), undefined);
assert.equal(matchDireNoteTrack({ track_name: "pink" }, tracks)?.id, 102);
assert.equal(direNoteCorrectionFingerprint(issues), direNoteCorrectionFingerprint(extractDireNoteCorrections({ ...payload, tracks: [...payload.tracks].reverse() }, tracks, 19)));

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { syncDireNoteRelease } = await import("../lib/direnote-service");
  const { parseDireNoteResponse } = await import("../lib/direnote");
  assert.equal(parseDireNoteResponse({ success: true, upc: "auto-generated" }).upc, null);
  let response: unknown = payload;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(response), { status: 200 });
  const release: any = { id: 19, userId: 7, title: "Magenta", status: "SENT_TO_DISTRIBUTOR", upc: "8901234567890", artistName: "Fixture artist", version: 1, metadata: {}, createdAt: new Date(), releaseDate: new Date("2027-01-01"), tracks: tracks.map(track => ({ ...track, createdAt: new Date(), metadata: {} })) };
  const notifications: any[] = [];
  const tasks = new Map();
  let transitions = 0;
  let notificationWrites = 0;
  const db = prisma as any;
  const attempts: any[] = [];
  db.distributionSubmissionAttempt.findFirst = async ({ where }: any) => structuredClone(attempts.find(item => (!where.id || item.id === where.id) && (!where.isCurrent || item.isCurrent) && (!where.state || item.state === where.state)) ?? null);
  db.distributionSubmissionAttempt.create = async ({ data }: any) => { const row = { id: attempts.length + 1, ...data }; attempts.push(row); return structuredClone(row); };
  db.distributionSubmissionAttempt.update = async ({ where, data }: any) => { const row = attempts.find(item => item.id === where.id); Object.assign(row, data); return structuredClone(row); };
  db.$transaction = async (fn: any) => fn(db);
  db.$executeRaw = async () => 1;
  db.$queryRaw = async (query: any) => String(query).includes("pg_try_advisory") ? [{ locked: true }] : [structuredClone(release)];
  db.release.findUnique = db.release.findUniqueOrThrow = async () => structuredClone(release);
  db.release.update = async ({ data }: any) => { Object.assign(release, data); return structuredClone(release); };
  db.release.updateMany = async ({ data }: any) => { const { version, ...rest } = data; Object.assign(release, rest); if (version) release.version++; return { count: 1 }; };
  db.track.findMany = async () => structuredClone(release.tracks);
  db.track.update = async ({ where, data }: any) => Object.assign(release.tracks.find((track: any) => track.id === where.id), data);
  db.direNoteLog.count = async () => 0;
  db.direNoteLog.findFirst = async () => null;
  db.direNoteLog.create = async () => ({});
  db.direNoteReconciliationDiscrepancy.findFirst = async () => null;
  db.direNoteReconciliationDiscrepancy.create = async () => ({});
  db.releaseStatusTransition.create = async () => { transitions++; return {}; };
  db.auditLog.create = async () => ({});
  db.user.findUnique = async () => null; // Suppress email delivery in this isolated test.
  db.notification.upsert = async ({ create }: any) => {
    notificationWrites++;
    const existing = notifications.find(item => item.eventKey === create.eventKey);
    if (existing) return existing;
    const result = { id: notifications.length + 1, ...create, createdAt: new Date(), readAt: null };
    notifications.push(result); return result;
  };
  db.adminTask.findUnique = async ({ where }: any) => tasks.get(where.eventKey) ?? null;
  db.adminTask.create = async ({ data }: any) => { const task = { id: tasks.size + 1, ...data }; tasks.set(data.eventKey, task); return task; };
  db.adminTaskHistory.create = async () => ({});
  try {
    await syncDireNoteRelease(19);
    assert.equal(release.status, "CHANGES_REQUESTED");
    assert.match(release.correctionReason, /instrumental/);
    assert.match(release.reviewIssues.fields[0].field, /^tracks\.1\./);
    assert.equal(release.tracks[0].title, "purple");
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].href, "/dashboard/releases/19?tab=corrections");
    for (let cycle = 0; cycle < 10; cycle++) await syncDireNoteRelease(19);
    assert.equal(notifications.length, 1);
    assert.equal(tasks.size, 1);
    assert.equal(transitions, 1);
    assert.equal(notificationWrites, 1);
    const { updateDetailedReleaseStatus } = await import("../lib/distribution-db");
    await updateDetailedReleaseStatus(19, "changes_requested", "Already awaiting corrections", undefined, { manualOverride: true });
    assert.equal(notificationWrites, 1, "A no-op status transition must not notify again");
    release.status = "RESUBMITTED";
    await syncDireNoteRelease(19);
    assert.equal(release.status, "RESUBMITTED", "Old remarks must not reopen a resubmission");
    response = { ...payload, tracks: payload.tracks.map(track => ({ ...track, remarks: "NONE" })) };
    await syncDireNoteRelease(19);
    assert.equal(release.status, "RESUBMITTED", "Pending must not bypass HYMN re-review");
    release.status = "CHANGES_REQUESTED";
    await syncDireNoteRelease(19);
    assert.equal(release.status, "CHANGES_REQUESTED", "Pending must not clear unresolved corrections");
    release.upc = "auto-generated";
    attempts[0].upc = null;
    await assert.rejects(() => syncDireNoteRelease(19), /Awaiting UPC/);
    assert.equal(release.upc, "auto-generated");
    const requested: string[] = [];
    db.externalIdentifierHistory.create = async () => ({});
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      requested.push(request.isrc ? "isrc" : "upc");
      return new Response(JSON.stringify(request.isrc
        ? { success: true, track: { isrc: tracks[0].isrc, release_title: "Magenta", upc: "8901234567890" } }
        : { ...payload, release: { ...payload.release, upc_code: "8901234567890" } }), { status: 200 });
    };
    await syncDireNoteRelease(19);
    assert.deepEqual(requested, ["isrc", "upc"]);
    assert.equal(release.upc, "8901234567890", "Verified UPC must be persisted without resubmitting the album");
    release.upc = null;
    attempts[0].upc = null;
    await syncDireNoteRelease(19);
    assert.equal(release.upc, "8901234567890", "New submissions with no UPC must recover too");
    release.upc = null;
    release.metadata = {};
    attempts[0].upc = null;
    attempts[0].responseRedacted = {};
    attempts[0].rawStatusPayload = {};
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false, error: "Invalid PIN or client_id" }), { status: 401 });
    await assert.rejects(() => syncDireNoteRelease(19), /DIRENOTE_STATUS_AUTH_FAILED/);
    assert.equal(release.upc, null);
    assert.equal(release.status, "CHANGES_REQUESTED");
    assert.equal(notifications.length, 1);
    console.log("DireNote correction parser and sync regression verification passed.");
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
