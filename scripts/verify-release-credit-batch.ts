import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { saveReleaseTracks, releaseSaveFailure } from "../lib/release-track-save";
import type { CanonicalContributionInput } from "../lib/contributor-identity";
import { syncReleaseContributions } from "../lib/release-contributor-sync";
import { submitPaidDistributionRelease, updatePaidDistributionRelease } from "../lib/distribution-db";

assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\/direnote_virtual/);

async function main() {
  const user = await prisma.user.create({ data: { name: "Album credit fixture", email: `credit-batch-${Date.now()}@example.test`, googleId: `credit-batch-${Date.now()}` } });
  const release = await prisma.release.create({ data: { userId: user.id, title: "Large album", artistName: "Fixture", genre: "Hip-Hop", releaseDate: new Date("2099-01-01") } });
  const tracks: { trackId: number; contributions: CanonicalContributionInput[] }[] = [];
  const trackRows = Array.from({ length: 50 }, (_, i) => ({ title: `Recording ${i + 1}`, trackNumber: i + 1, primaryArtist: "Fixture", audioUrl: "", metadata: {} }));
  const credits = (i: number) => [
    ...Array.from({ length: 5 }, (_, j) => ({ role: j === 4 ? "producer" : j % 2 ? "composer" : "songwriter", legalName: "Same legal name", artistName: "Fixture Producer", clientReference: `recording-${i}-person-${j}` })),
    { role: "composer", legalName: "Shared composer", clientReference: "shared-person" },
    { role: "songwriter", legalName: "Shared composer", clientReference: "shared-person" },
  ];
  let calls = 0;
  const delayed = (value: any): any => new Proxy(value, { get(target, key) {
    const item = target[key];
    if (typeof item === "function") return async (...args: any[]) => { calls++; await new Promise(resolve => setTimeout(resolve, 350)); return item.apply(target, args); };
    if (item && typeof item === "object") return delayed(item);
    return item;
  } });
  const started = Date.now();
  await prisma.$transaction(async tx => {
    const remote = delayed(tx);
    const savedTracks = await saveReleaseTracks(remote, release.id, trackRows, []);
    tracks.push(...savedTracks.map((track, i) => ({ trackId: track.id, contributions: credits(i) })));
    await syncReleaseContributions(remote, { actorUserId: user.id, tracks });
  }, { timeout: 30_000 });
  assert.ok(calls <= 15, `Fresh album credits used ${calls} round trips.`);
  assert.ok(Date.now() - started < 10_000, "Credit save must fit the previous timeout even with simulated remote database latency.");
  assert.equal(await prisma.contributorParty.count({ where: { createdByUserId: user.id } }), 251, "References share identities across tracks; equal names with different references never merge.");
  assert.equal(await prisma.trackContribution.count({ where: { trackId: { in: tracks.map(track => track.trackId) } } }), 350);
  const originalTracks = await prisma.track.findMany({ where: { releaseId: release.id }, orderBy: { trackNumber: "asc" } });
  await prisma.track.update({ where: { id: originalTracks[0].id }, data: { isrc: "INABC2600001" } });
  const repeatTracks = await prisma.$transaction(tx => saveReleaseTracks(tx, release.id, trackRows, originalTracks));
  assert.deepEqual(repeatTracks.map(track => track.id), originalTracks.map(track => track.id));
  assert.equal((await prisma.track.findUniqueOrThrow({ where: { id: originalTracks[0].id } })).isrc, "INABC2600001", "Autosave must preserve existing recording identifiers.");
  assert.equal(releaseSaveFailure({ code: "P2028" })?.retryable, true);
  assert.equal(releaseSaveFailure({ code: "P2034" })?.retryable, true);
  assert.equal(releaseSaveFailure(new Error("Fix the title")), null);
  const beforeRetry = await prisma.trackContribution.findMany({ where: { trackId: { in: tracks.map(track => track.trackId) } }, orderBy: { id: "asc" } });
  await prisma.$transaction(tx => syncReleaseContributions(tx, { actorUserId: user.id, tracks }));
  assert.deepEqual(await prisma.trackContribution.findMany({ where: { trackId: { in: tracks.map(track => track.trackId) } }, orderBy: { id: "asc" } }), beforeRetry, "An unchanged retry preserves credit IDs and timestamps.");
  const shared = await prisma.contributorExternalIdentifier.findUniqueOrThrow({ where: { scheme_value: { scheme: "HYMN_CREDIT_REF", value: `${user.id}:shared-person` } } });
  await prisma.trackContribution.updateMany({ where: { trackId: tracks[0].trackId, partyId: shared.partyId, role: "COMPOSER" }, data: { source: "BEAT_PURCHASE" } });
  await prisma.$transaction(tx => syncReleaseContributions(tx, { actorUserId: user.id, tracks: [{ trackId: tracks[0].trackId, contributions: [] }] }));
  assert.equal(await prisma.trackContribution.count({ where: { trackId: tracks[0].trackId } }), 1, "Removing form credits preserves purchased-beat credits.");
  const auditBefore = await prisma.auditLog.count({ where: { actorId: user.id } });
  await assert.rejects(prisma.$transaction(async tx => {
    await syncReleaseContributions(tx, { actorUserId: user.id, tracks: [{ trackId: tracks[1].trackId, contributions: [{ role: "composer", legalName: "Rollback", clientReference: "rollback-person" }] }] });
    throw new Error("Simulated later save failure");
  }), /Simulated later save failure/);
  assert.equal(await prisma.contributorExternalIdentifier.count({ where: { value: `${user.id}:rollback-person` } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { actorId: user.id } }), auditBefore, "Identity, credit and audit writes roll back together.");
  const submissionMetadata: any = { artistName: "Fixture", releaseTitle: "Submission batch fixture", primaryGenre: "Hip-Hop", releaseType: "album", releaseDate: "2099-01-01", platforms: ["Spotify"], paymentModel: "one_time", distributionPlan: "one_time", tracks: trackRows.slice(0, 5).map((row, i) => ({ ...row, trackTitle: row.title, explicitContent: false, dolbyAtmos: false, duration: "180", contributors: credits(i) })) };
  const releaseCount = await prisma.release.count({ where: { userId: user.id } });
  await assert.rejects(submitPaidDistributionRelease({ userId: user.id, razorpayOrderId: "fixture-failed-order", razorpayPaymentId: "fixture-failed-payment", metadata: { ...submissionMetadata, tracks: [submissionMetadata.tracks[0], { ...submissionMetadata.tracks[1], contributors: [{ role: "INVALID", legalName: "Broken" }] }] } }), /Unsupported/);
  assert.equal(await prisma.release.count({ where: { userId: user.id } }), releaseCount, "Failed new submissions cannot leave partial paid releases.");
  const submitted = await submitPaidDistributionRelease({ userId: user.id, razorpayOrderId: "fixture-success-order", razorpayPaymentId: "fixture-success-payment", metadata: submissionMetadata });
  assert.equal(submitted.tracks.length, 5);
  const submittedIds = submitted.tracks.map((track: any) => track.id);
  await prisma.release.update({ where: { id: submitted.id }, data: { status: "CHANGES_REQUESTED" } });
  const corrected = await updatePaidDistributionRelease({ userId: user.id, releaseId: submitted.id, metadata: { ...submissionMetadata, releaseTitle: "Corrected batch fixture" } });
  assert.deepEqual(corrected.tracks.map((track: any) => track.id), submittedIds, "Paid submission retries preserve linked track IDs.");
  assert.equal((await prisma.release.findUniqueOrThrow({ where: { id: submitted.id } })).paymentStatus, "paid");
  console.log(`Album credit batching passed: 50 tracks, 350 credits, 251 identities, ${calls} database calls with 350ms simulated latency; identity reuse, retry, source preservation and rollback verified.`);
}
main().finally(() => prisma.$disconnect());
