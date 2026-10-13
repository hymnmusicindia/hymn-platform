import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { syncReleaseContributions } from "../lib/release-contributor-sync";

assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\/direnote_virtual/);

async function main() {
  const user = await prisma.user.create({ data: { name: "Album credit fixture", email: `credit-batch-${Date.now()}@example.test`, googleId: `credit-batch-${Date.now()}` } });
  const release = await prisma.release.create({ data: { userId: user.id, title: "Five-track album", artistName: "Fixture", genre: "Hip-Hop", releaseDate: new Date("2099-01-01") } });
  const tracks = [];
  for (let i = 0; i < 5; i++) {
    const track = await prisma.track.create({ data: { releaseId: release.id, title: `Recording ${i + 1}`, trackNumber: i + 1 } });
    tracks.push({ trackId: track.id, contributions: [
      ...Array.from({ length: 5 }, (_, j) => ({ role: j === 4 ? "producer" : j % 2 ? "composer" : "songwriter", legalName: "Same legal name", artistName: "Fixture Producer", clientReference: `recording-${i}-person-${j}` })),
      { role: "composer", legalName: "Shared composer", clientReference: "shared-person" },
      { role: "songwriter", legalName: "Shared composer", clientReference: "shared-person" },
    ] });
  }
  let calls = 0;
  const delayed = (value: any): any => new Proxy(value, { get(target, key) {
    const item = target[key];
    if (typeof item === "function") return async (...args: any[]) => { calls++; await new Promise(resolve => setTimeout(resolve, 350)); return item.apply(target, args); };
    if (item && typeof item === "object") return delayed(item);
    return item;
  } });
  const started = Date.now();
  await prisma.$transaction(tx => syncReleaseContributions(delayed(tx), { actorUserId: user.id, tracks }), { timeout: 30_000 });
  assert.ok(calls <= 12, `Fresh album credits used ${calls} round trips.`);
  assert.ok(Date.now() - started < 10_000, "Credit save must fit the previous timeout even with simulated remote database latency.");
  assert.equal(await prisma.contributorParty.count({ where: { createdByUserId: user.id } }), 26, "References share identities across tracks; equal names with different references never merge.");
  assert.equal(await prisma.trackContribution.count({ where: { trackId: { in: tracks.map(track => track.trackId) } } }), 35);
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
  console.log(`Album credit batching passed: 35 credits, 26 identities, ${calls} database calls with 350ms simulated latency; identity reuse, retry, source preservation and rollback verified.`);
}
main().finally(() => prisma.$disconnect());
