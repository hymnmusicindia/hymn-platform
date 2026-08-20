import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { parseDireNoteResponse } from "../lib/direnote";
import { submitToDireNote } from "../lib/direnote/direnote-client";
import { markReleaseDistributionSuccess } from "../lib/distribution-db";
import { claimDistributionSubmission, finishDistributionSubmission } from "../lib/distribution-idempotency";

async function main() {
  process.env.DIRENOTE_CLIENT_ID = "fixture-client";
  process.env.DIRENOTE_API_PIN = "fixture-pin";
  process.env.DIRENOTE_INGEST_ENDPOINT = "https://direnote.invalid/fixture";
  const rejected = await submitToDireNote({}, { fetchImpl: async () => new Response(JSON.stringify({ success: false, error: "metadata rejected" }), { status: 400 }) });
  assert.equal(rejected.success, false);
  assert.equal(rejected.httpStatus, 400);
  const timedOut = await submitToDireNote({}, { timeoutMs: 5, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  assert.equal(timedOut.success, false);
  assert.match(timedOut.error ?? "", /timed out/);

  const parsed = parseDireNoteResponse({ success: true, release_id: "dn_rel_123", upc: "8901234567890", tracks: [{ track_name: "Fixture Track", isrc: "INHYM2600001", status: "processing" }] });
  assert.equal(parsed.distributorReleaseId, "dn_rel_123");
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { googleId: `direnote-${stamp}`, name: "DireNote Fixture", email: `direnote-${stamp}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  const release = await prisma.release.create({ data: { userId: user.id, title: "Fixture Release", artistName: user.name, genre: "Test", releaseDate: new Date(), releaseType: "single", status: "SUBMITTING_TO_DISTRIBUTOR", paymentStatus: "paid", tracks: { create: { title: "Fixture Track", trackNumber: 1, primaryArtist: user.name } } } });
  const claims = await Promise.all([claimDistributionSubmission(release.id, { album: "Fixture Release" }), claimDistributionSubmission(release.id, { album: "Fixture Release" })]);
  assert.equal(claims.filter(claim => claim.claimed).length, 1);
  assert.equal(claims.filter(claim => !claim.claimed).length, 1);
  const claimed = claims.find(claim => claim.claimed)!;
  await finishDistributionSubmission(claimed.attempt.id, { state: "retryable", safeError: "fixture timeout" });
  const retry = await claimDistributionSubmission(release.id, { album: "Fixture Release" });
  assert.equal(retry.claimed, true);
  assert.equal(retry.attempt.attemptCount, 2);
  await finishDistributionSubmission(retry.attempt.id, { state: "submitted", providerReference: "dn_rel_123" });
  const duplicate = await claimDistributionSubmission(release.id, { album: "Fixture Release" });
  assert.equal(duplicate.alreadySubmitted, true);
  await markReleaseDistributionSuccess({ releaseId: release.id, status: "sent_to_distributor", distributorReleaseId: parsed.distributorReleaseId, upc: parsed.upc, trackIsrcs: parsed.trackIsrcs, responsePayload: parsed.raw });
  const persisted = await prisma.release.findUniqueOrThrow({ where: { id: release.id }, include: { tracks: true } });
  assert.equal(persisted.distributorReleaseId, "dn_rel_123");
  assert.equal(persisted.upc, "8901234567890");
  assert.equal(persisted.tracks[0].isrc, "INHYM2600001");
  assert.equal(persisted.status, "SENT_TO_DISTRIBUTOR");
  console.log("DireNote timeout, rejection, and identifier persistence integration verification passed.");
}

main().finally(() => prisma.$disconnect());
// vercel trigger 9
