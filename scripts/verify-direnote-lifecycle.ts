import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { redactDireNoteDiagnostic } from "../lib/direnote";
import { prisma } from "../lib/prisma";
import { submitRelease } from "../lib/distribution-service";
import { syncDireNoteRelease } from "../lib/direnote-service";
import { getDetailedReleaseById, updatePaidDistributionRelease, saveDraftDistributionRelease } from "../lib/distribution-db";
import { GET as cron } from "../app/api/cron/direnote-release-sync/route";
import { startDireNoteBrowser } from "./direnote-browser-fixture";
import { getDireNoteReleaseInformation } from "../lib/direnote/direnote-client";
import { currentDireNoteAttempt } from "../lib/distribution-idempotency";
import { assertDireNoteSchemaReady } from "../lib/direnote-schema-readiness";
import { validateReleaseForDireNote } from "../lib/direnote-readiness";
import { readTrackLanguage } from "../lib/track-language";
import { startCheckoutMock, verifySubmissionCheckout } from "./verify-submission-checkout";

assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\/direnote_virtual/);
let mode = "pending";
let returnedArtist: { name: string; links: Record<string, string> } | undefined;
let ingests = 0;
const statusUpcs: string[] = [];
const ingestPayloads: Array<Record<string, any>> = [];
let browser: Awaited<ReturnType<typeof startDireNoteBrowser>> | undefined;
let checkoutMock: Awaited<ReturnType<typeof startCheckoutMock>> | undefined;
const oldUpc = "3473620313503";
const newUpc = "3473620313504";
const oldIsrcs = ["INDN22602442", "INDN22602443"];
const newIsrcs = ["INTST2600001", "INTST2600002"];
const remark = "TRACK 2 SEEMS LIKE AN INSTRUMENTAL. PLEASE SELECT RELEVANT TRACK LANGUAGE";
const server = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw || "{}");
  assert.equal(body.pin, "fixture-pin");
  assert.equal(body.client_id, "fixture-client");
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/ingest_content") {
    assert.equal(request.method, "POST");
    ingestPayloads.push(body);
    ingests++;
    response.end(JSON.stringify({ success: true, upc: ingests === 1 ? oldUpc : newUpc, tracks: [1, 2].map((n, index) => ({ track_name: `Track ${n}`, isrc: (ingests === 1 ? oldIsrcs : newIsrcs)[index], status: "Pending" })) }));
    return;
  }
  statusUpcs.push(body.upc);
  if (mode === "401" || mode === "500") {
    response.statusCode = Number(mode);
    response.end(JSON.stringify({ error: "fixture-pin fixture-client" }));
    return;
  }
  if (mode === "malformed") { response.end("not JSON"); return; }
  const ids = body.upc === oldUpc ? oldIsrcs : newIsrcs;
  response.end(JSON.stringify({ success: true, release: { album_name: "Magenta", upc_code: body.upc, status: mode === "accepted" ? "Accepted" : "Pending" }, tracks: ids.map((isrc, index) => ({ track_number: index + 1, track_name: `Track ${index + 1}`, isrc, artist: returnedArtist, status: "Pending", remarks: mode === "remark" && index === 1 ? remark : "NONE" })) }));
});

async function main() {
  checkoutMock = await startCheckoutMock();
  await new Promise<void>(resolve => server.listen(55440, "127.0.0.1", resolve));
  // Reproduce a database where the earlier history migration predates snapshots.
  await prisma.$executeRawUnsafe('ALTER TABLE "distribution_submission_attempts" DROP COLUMN "payload_redacted", DROP COLUMN "payload_diff"');
  await assert.rejects(() => assertDireNoteSchemaReady(prisma), /payload_redacted, payload_diff/);
  const snapshots = await readFile("prisma/migrations/20260908000000_direnote_payload_snapshots/migration.sql", "utf8");
  await prisma.$executeRawUnsafe(snapshots);
  await prisma.$executeRawUnsafe(snapshots);
  const lifecycleMigration = await readFile("prisma/migrations/20260911000000_direnote_attempt_lifecycle/migration.sql", "utf8");
  await prisma.$executeRawUnsafe(lifecycleMigration);
  await prisma.$executeRawUnsafe(lifecycleMigration);
  await assertDireNoteSchemaReady(prisma);
  assert.equal(await prisma.distributionSubmissionAttempt.findFirst(), null);
  const migration = await readFile("prisma/migrations/20260906000000_direnote_attempt_history/migration.sql", "utf8");
  for (let run = 0; run < 2; run++) for (const statement of migration.split(";").filter(value => value.trim())) await prisma.$executeRawUnsafe(statement);
  const user = await prisma.user.create({ data: { googleId: "fixture-gxrry", name: "gxrry", email: "gxrry@example.test", role: "CUSTOMER", status: "ACTIVE" } });
  const artist = await prisma.artistCard.create({ data: { userId: user.id, artistName: "gxrry", instagramUrl: "https://instagram.com/fixture_gxrry" } });
  const release = await prisma.release.create({ data: {
    userId: user.id, title: "Magenta", artistName: "gxrry", genre: "Pop", releaseType: "ep", releaseDate: new Date("2099-01-10"), status: "APPROVED", paymentStatus: "paid", artworkUrl: "https://cdn.example.test/cover.jpg",
    metadata: { releaseTitle: "Magenta", releaseDate: "2099-01-10", releaseTiming: "schedule_release", language: "Hindi", mood: "Happy", secondaryGenre: "Indie Pop", labelName: "Fixture Records", copyrightOwner: "2026 Fixture Records", publishingRights: "2026 Fixture Artist", contentType: "original", platforms: ["Spotify"], territory: "Worldwide", ownershipConfirmed: true, noUnauthorizedSamples: true, collaboratorsCredited: true, platformCompliant: true, hymnNotLiable: true, agreedToTerms: true, falseMetadataAcknowledged: true },
    tracks: { create: [1, 2].map(n => ({ title: n === 1 ? "purple" : "pink", trackNumber: n, primaryArtist: "gxrry", audioUrl: `https://cdn.example.test/track${n}.wav`, metadata: { metadata: { artistProfileIds: [artist.id] }, language: "Hindi", version: "Original", songwriters: "Fixture Artist", composers: "Fixture Artist", producers: "Fixture Artist", duration: "180", explicitContent: false } })) }
  }, include: { tracks: true } });
  await prisma.track.update({ where: { id: release.tracks[0].id }, data: { metadata: { ...(release.tracks[0].metadata as object), explicitContent: true } } });
  const initial = await submitRelease(release.id);
  assert.equal(initial.submitted, true, JSON.stringify(initial));
  assert.equal(ingests, 1);
  const replay = await submitRelease(release.id);
  assert.equal(replay.submitted, true, JSON.stringify(replay));
  assert.equal(replay.duplicate, true);
  assert.equal(replay.release?.status, "sent_to_distributor");
  assert.equal(ingests, 1, "Accepted releases must not be sent twice.");
  assert.equal(ingestPayloads[0].tracks[0].explicitLyrics, "Yes");
  assert(!ingestPayloads[0].tracks[0].trackLyrics, "Explicit content must submit without lyrics.");
  const firstAttempt = await prisma.distributionSubmissionAttempt.findFirstOrThrow({ where: { releaseId: release.id, isCurrent: true } });
  assert.equal(firstAttempt.upc, oldUpc);
  assert.equal((await currentDireNoteAttempt(release.id)).id, firstAttempt.id);
  assert.equal((await currentDireNoteAttempt(release.id)).id, firstAttempt.id);
  await prisma.release.update({ where: { id: release.id }, data: { direNoteLastAttemptedAt: new Date(0) } });
  const pendingCycle = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
  assert.equal((await pendingCycle.json()).checked, 1);
  assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: release.id } })).status, "DISTRIBUTOR_PROCESSING");
  mode = "remark";
  for (let cycle = 0; cycle < 10; cycle++) {
    await prisma.release.update({ where: { id: release.id }, data: { direNoteLastAttemptedAt: new Date(0) } });
    await prisma.direNoteLog.updateMany({ where: { releaseId: release.id, action: { in: ["release_information", "upc_lookup"] } }, data: { createdAt: new Date(0) } });
    const result = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    assert.equal((await result.json()).checked, 1);
  }
  const corrected = await prisma.release.findUniqueOrThrow({ where: { id: release.id } });
  assert.equal(corrected.status, "CHANGES_REQUESTED");
  assert.match(JSON.stringify(corrected.reviewIssues), /tracks\.1\.trackLanguage/);
  assert.equal(await prisma.notification.count({ where: { userId: user.id, title: { startsWith: "Fix required" } } }), 1);
  assert.equal(await prisma.emailLog.count({ where: { userId: user.id, template: "release_changes_requested" } }), 1);
  assert.equal(await prisma.adminTask.count({ where: { entityId: String(release.id), type: "DireNote Correction" } }), 1);
  if (process.argv.includes("--browser")) { browser = await startDireNoteBrowser(user.id); await browser.correction(release.id); await browser.artistWizard(); }
  const detailed = await getDetailedReleaseById(release.id);
  assert(detailed);
  const editedTracks = detailed.tracks!.map(track => ({ ...track, language: "Hindi", version: track.trackNumber === 2 ? "Instrumental" : track.version }));
  if (browser) await browser.editLanguage(release.id);
  else await updatePaidDistributionRelease({ userId: user.id, releaseId: release.id, metadata: { ...detailed, tracks: editedTracks } });
  const savedInstrumental = (await getDetailedReleaseById(release.id))?.tracks?.[1];
  assert.equal(savedInstrumental?.version, "Instrumental");
  assert.equal(savedInstrumental?.language, "Hindi", "Stale stored language must not control Instrumental delivery.");
  assert.equal(readTrackLanguage(savedInstrumental), "Instrumental");
  assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: release.id } })).status, "CHANGES_REQUESTED");
  assert.deepEqual((await prisma.track.findMany({ where: { releaseId: release.id }, orderBy: { trackNumber: "asc" } })).map(track => track.id), release.tracks.map(track => track.id));
  assert.equal((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: firstAttempt.id } })).corrections && ((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: firstAttempt.id } })).corrections as any).status, "customer_resolved");
  await syncDireNoteRelease(release.id);
  assert.equal(((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: firstAttempt.id } })).corrections as any).status, "customer_resolved");
  await prisma.distributionSubmissionAttempt.update({ where: { id: firstAttempt.id }, data: { startedAt: new Date(0) } });
  if (browser) await browser.submit(release.id);
  else {
    const reingested = await submitRelease(release.id, { correctionReingest: true });
    assert.equal(reingested.submitted, true, JSON.stringify(reingested));
  }
  assert.equal(ingests, 2);
  assert.equal(ingestPayloads[0].tracks[1].trackLanguage, "Hindi");
  assert.equal(ingestPayloads[1].tracks[1].trackLanguage, "Instrumental");
  assert.equal(ingestPayloads[1].albumLanguage, browser ? "Tamil" : "Hindi");
  assert.equal(ingestPayloads[1].tracks[0].trackLanguage, "Hindi");
  assert.equal(ingestPayloads[1].contenttype, "Original/Exclusive Licensed");
  await writeFile(".cache/direnote-magenta-track2-virtual-after.json", JSON.stringify(redactDireNoteDiagnostic(ingestPayloads[1].tracks[1]), null, 2));
  assert.equal(ingestPayloads[1].upc, undefined);
  assert(ingestPayloads[1].tracks.every((track: any) => !track.isrc));
  const attempts = await prisma.distributionSubmissionAttempt.findMany({ where: { releaseId: release.id }, orderBy: { id: "asc" } });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].isCurrent, false);
  assert.equal(attempts[0].upc, oldUpc);
  assert.equal(attempts[1].isCurrent, true);
  assert.equal(attempts[1].upc, newUpc);
  assert.equal((attempts[0].payloadRedacted as any).tracks[1].trackLanguage, "Hindi");
  assert.equal((attempts[1].payloadRedacted as any).tracks[1].trackLanguage, "Instrumental");
  assert.deepEqual(redactDireNoteDiagnostic(ingestPayloads[1]), attempts[1].payloadRedacted, "The entire HTTP body must match the saved canonical payload snapshot.");
  await writeFile(".cache/direnote-correction-http-body.json", JSON.stringify(redactDireNoteDiagnostic(ingestPayloads[1]), null, 2));
  assert((attempts[1].payloadDiff as any[]).some(change => change.field === "tracks.1.trackLanguage" && change.before === "Hindi" && change.after === "Instrumental"));
  assert.equal(await prisma.release.count({ where: { userId: user.id } }), 1);
  mode = "pending";
  await prisma.release.update({ where: { id: release.id }, data: { direNoteLastAttemptedAt: new Date(0) } });
  await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
  assert.equal(statusUpcs.at(-1), newUpc);
  for (const failure of ["401", "500", "malformed"]) {
    mode = failure;
    await assert.rejects(() => syncDireNoteRelease(release.id));
    const unchanged = await prisma.release.findUniqueOrThrow({ where: { id: release.id } });
    assert.equal(unchanged.status, "DISTRIBUTOR_PROCESSING");
    assert.equal(unchanged.upc, newUpc);
    assert(!JSON.stringify(await prisma.direNoteLog.findMany()).includes("fixture-pin"));
  }
  mode = "remark";
  await syncDireNoteRelease(release.id);
  assert.equal(await prisma.notification.count({ where: { userId: user.id, title: { startsWith: "Fix required" } } }), 2);
  mode = "accepted";
  await syncDireNoteRelease(release.id);
  assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: release.id } })).status, "SCHEDULED");
  assert.equal(((await prisma.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: attempts[1].id } })).corrections as any).status, "closed");
  if (browser) { await browser.history(release.id); await browser.admin(release.id); }
  const timeout = await getDireNoteReleaseInformation(newUpc, { timeoutMs: 5, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("timeout"), { name: "AbortError" })))) });
  assert.equal(timeout.success, false);
  assert.match(timeout.error ?? "", /timed out/);
  await prisma.$transaction(async lock => {
    await lock.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${release.id}::integer)`;
    await assert.rejects(() => syncDireNoteRelease(release.id), /already being/);
  });
  await prisma.$transaction(async lock => {
    await lock.$executeRaw`SELECT pg_advisory_xact_lock(81422029)`;
    const response = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    assert.equal((await response.json()).skipped, "already_running");
  });
  const transfer = await prisma.release.create({ data: {
    userId: user.id, title: "Transfer fixture", artistName: "gxrry", genre: "Pop", releaseType: "ep", releaseDate: new Date("2099-01-10"), status: "CHANGES_REQUESTED", paymentStatus: "paid", artworkUrl: "https://cdn.example.test/cover.jpg", direNoteStatus: "changes_required", upc: "3473620313505",
    metadata: { ...(release.metadata as object), releaseTitle: "Transfer fixture", releasePreviouslyReleased: true, originalReleaseDate: "2020-01-01" },
    tracks: { create: [1, 2].map((n, index) => ({ title: `Track ${n}`, trackNumber: n, primaryArtist: "gxrry", audioUrl: `https://cdn.example.test/track${n}.wav`, isrc: oldIsrcs[index], metadata: { language: "English", songwriters: "Fixture Artist", composers: "Fixture Artist", duration: "180" } })) }
  } });
  const transferAttempt = await currentDireNoteAttempt(transfer.id);
  await prisma.distributionSubmissionAttempt.update({ where: { id: transferAttempt.id }, data: { startedAt: new Date(0) } });
  const transferred = await submitRelease(transfer.id, { correctionReingest: true });
  assert.equal(transferred.submitted, true, JSON.stringify(transferred));
  assert(ingestPayloads.at(-1)!.tracks.every((track: any) => !track.isrc), "A correction must never reuse historical ISRC values in its ingest request.");
  assert.deepEqual((await prisma.track.findMany({ where: { releaseId: transfer.id }, orderBy: { trackNumber: "asc" } })).map(track => track.isrc), newIsrcs, "DireNote's re-ingest identifiers become the current track projection.");
  const paidDraft = await prisma.release.create({ data: { userId: user.id, title: "Paid draft", artistName: "gxrry", genre: "Pop", releaseDate: new Date("2099-01-10"), status: "DRAFT", paymentStatus: "paid" } });
  await saveDraftDistributionRelease({ userId: user.id, draftReleaseId: paidDraft.id, metadata: { artistName: "gxrry", trackName: "Paid draft", tracks: [] } as any });
  assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: paidDraft.id } })).paymentStatus, "paid", "Saving a draft must not erase payment.");
  const paidOrder = await prisma.distributionOrder.create({ data: { userId: user.id, releaseId: paidDraft.id, plan: "one_time", amount: 99, paymentStatus: "paid", razorpayOrderId: "order_fixture_paid_draft", razorpayPaymentId: "pay_fixture_paid_draft", fulfilledAt: new Date() } });
  if (browser) {
    await prisma.release.update({ where: { id: paidDraft.id }, data: { paymentStatus: "pending" } });
    await browser.paidDraftCheckout(paidDraft.id, true);
    assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: paidDraft.id } })).paymentStatus, "paid");
    await prisma.release.update({ where: { id: paidDraft.id }, data: { paymentStatus: "pending" } });
    await prisma.distributionOrder.update({ where: { id: paidOrder.id }, data: { fulfilledAt: null } });
    await browser.paidDraftCheckout(paidDraft.id, false);
    assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: paidDraft.id } })).paymentStatus, "pending", "Unfulfilled capture must still pass verify-submit.");
    assert.equal(await prisma.distributionOrder.count({ where: { releaseId: paidDraft.id } }), 1);
    const otherUser = await prisma.user.create({ data: { googleId: "fixture-other-paid-owner", name: "Other owner", email: "other-paid@example.test", role: "CUSTOMER", status: "ACTIVE" } });
    await prisma.distributionOrder.update({ where: { id: paidOrder.id }, data: { userId: otherUser.id, fulfilledAt: new Date() } });
    await browser.paidDraftCheckout(paidDraft.id, true, 409);
    assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: paidDraft.id } })).paymentStatus, "pending", "Another customer's payment must never restore entitlement.");
  }
  const single = await prisma.release.create({ data: {
    userId: user.id, title: "HARADO TEST fixture", artistName: "gxrry", genre: "Pop", releaseType: "single", releaseDate: new Date("2099-01-10"), status: "APPROVED", paymentStatus: "paid", artworkUrl: "https://cdn.example.test/cover.jpg",
    metadata: { ...(release.metadata as object), releaseTitle: "HARADO TEST fixture", language: "English", mood: "" },
    tracks: { create: [{ title: "HARADO TEST fixture", trackNumber: 1, primaryArtist: "gxrry", audioUrl: "https://cdn.example.test/track1.wav", metadata: { language: "English", version: "Original", songwriters: "Fixture Artist", composers: "Fixture Artist" } }] }
  } });
  const singleDetail = await getDetailedReleaseById(single.id);
  assert(singleDetail);
  const readiness = await validateReleaseForDireNote(singleDetail);
  assert.equal(readiness.payload.tracks.length, 1);
  assert.equal(readiness.ready, true, JSON.stringify(readiness.issues));
  assert.match(readiness.payload.cover_art_url, /cover\.jpg$/);
  if (browser) {
    const stale = await prisma.release.create({ data: {
      userId: user.id, title: "Stale two-track fixture", artistName: "gxrry", genre: "Pop", releaseType: "ep", releaseDate: new Date("2099-01-10"), status: "LIVE", paymentStatus: "paid", artworkUrl: "https://cdn.example.test/cover.png",
      metadata: { ...(release.metadata as object), contentType: "", releaseTitle: "Stale two-track fixture" },
      tracks: { create: [1, 2].map(n => ({ title: `Stale ${n}`, trackNumber: n, primaryArtist: "gxrry", audioUrl: "https://cdn.example.test/track1.wav", metadata: { version: n === 2 ? "Instrumental" : "Original", songwriters: "Fixture Artist", composers: "Fixture Artist" } })) }
    } });
    await browser.readinessIsolation(single.id, stale.id);
  }
  for (const language of [null, "Hindi"]) {
    const derived = await prisma.release.create({ data: {
      userId: user.id, title: `Derived ${language ?? "null"}`, artistName: "gxrry", genre: "Pop", releaseType: "ep", releaseDate: new Date("2099-01-10"), status: "APPROVED", paymentStatus: "paid", artworkUrl: "https://cdn.example.test/cover.jpg",
      metadata: { ...(release.metadata as object), releaseTitle: `Derived ${language ?? "null"}` },
      tracks: { create: [1, 2].map(n => ({ title: `Derived Track ${n}`, trackNumber: n, primaryArtist: "gxrry", audioUrl: "https://cdn.example.test/track1.wav", metadata: { language: n === 2 ? language : "Hindi", version: n === 2 ? "Instrumental" : "Original", songwriters: "Fixture Artist", composers: "Fixture Artist" } })) }
    } });
    const sent = await submitRelease(derived.id);
    assert.equal(sent.submitted, true, JSON.stringify(sent));
    assert.equal(ingestPayloads.at(-1)!.tracks[1].trackLanguage, "Instrumental");
    assert.equal(ingestPayloads.at(-1)!.tracks[0].trackLanguage, "Hindi");
    if (browser) {
      const beforeReplay = ingests;
      await browser.repeatAcceptedSubmission(derived.id);
      assert.equal(ingests, beforeReplay, "Admin send/retry endpoints must not repeat accepted ingestion.");
      assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: derived.id } })).status, "SENT_TO_DISTRIBUTOR");
    }
  }
  // Exercise the actual hourly handler against documented artist links returned by the mock.
  await prisma.release.updateMany({ where: { id: { not: release.id } }, data: { status: "DRAFT" } });
  const unrelated = await prisma.artistCard.create({ data: { userId: user.id, artistName: "Unattached Artist" } });
  const pollArtist = async () => {
    await prisma.release.update({ where: { id: release.id }, data: { direNoteLastAttemptedAt: new Date(0), status: "DISTRIBUTOR_PROCESSING" } });
    await prisma.direNoteLog.updateMany({ where: { releaseId: release.id }, data: { createdAt: new Date(0) } });
    const response = await cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: "Bearer fixture-cron" } }));
    assert.equal((await response.json()).checked, 1);
    return prisma.artistCard.findUniqueOrThrow({ where: { id: artist.id } });
  };
  const spotify = "https://open.spotify.com/artist/66x9igCk2Vdjrhm1ULpe6r";
  returnedArtist = { name: "Unattached Artist", links: { spotify } };
  await pollArtist();
  assert.equal((await prisma.artistCard.findUniqueOrThrow({ where: { id: unrelated.id } })).spotifyProfileUrl, null);
  returnedArtist = { name: artist.artistName, links: { spotify } };
  const partial = await pollArtist();
  assert.equal(partial.spotifyProfileUrl, spotify);
  assert.equal(partial.spotifyArtistId, "66x9igCk2Vdjrhm1ULpe6r");
  assert.equal(partial.appleMusicProfileUrl, null);
  returnedArtist.links.apple = "https://music.apple.com/us/artist/test/1800353038";
  const complete = await pollArtist();
  assert.equal(complete.appleArtistId, "1800353038");
  await pollArtist();
  assert.equal(await prisma.artistCard.count({ where: { userId: user.id, artistName: artist.artistName } }), 1);
  returnedArtist.links.spotify = "https://open.spotify.com/artist/0123456789012345678901";
  assert.equal((await pollArtist()).spotifyProfileUrl, spotify);
  await pollArtist();
  assert.equal(await prisma.direNoteReconciliationDiscrepancy.count({ where: { releaseId: release.id, field: `artist_${artist.id}_link_spotify`, status: "open" } }), 1);
  returnedArtist.links = { spotify: "https://evil.test/artist/fake", apple: "https://music.apple.com/us/album/not-an-artist/123" };
  assert.equal((await pollArtist()).spotifyProfileUrl, spotify);
  if (browser) await browser.savedArtistLinks(artist.id, spotify, "https://music.apple.com/us/artist/test/1800353038");
  console.log("Hourly artist enrichment passed: canonical attachment, partial links, IDs, repeated polling, conflict deduplication and invalid-link rejection.");
  if (browser) await verifySubmissionCheckout();
  console.log("Virtual PostgreSQL lifecycle, null/stale Instrumental HTTP mapping, paid draft recovery, one-track JPEG readiness and release isolation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.stop(); if (checkoutMock) await checkoutMock.stop(); await prisma.$disconnect(); server.close(); });
