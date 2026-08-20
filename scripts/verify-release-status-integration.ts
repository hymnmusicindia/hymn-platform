import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { updateDetailedReleaseStatus } from "../lib/distribution-db";

async function main() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { googleId: `status-${stamp}`, name: "Status Fixture", email: `status-${stamp}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  const release = await prisma.release.create({ data: { userId: user.id, title: "Concurrent Release", artistName: user.name, genre: "Test", releaseDate: new Date(), releaseType: "single", status: "UNDER_REVIEW", paymentStatus: "paid" } });

  const outcomes = await Promise.allSettled([
    updateDetailedReleaseStatus(release.id, "approved", "Approved in concurrency fixture."),
    updateDetailedReleaseStatus(release.id, "changes_requested", "Metadata correction required.")
  ]);
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
  const afterRace = await prisma.release.findUniqueOrThrow({ where: { id: release.id } });
  assert.equal(afterRace.version, release.version + 1);
  assert.equal(await prisma.releaseStatusTransition.count({ where: { releaseId: release.id } }), 1);

  await assert.rejects(() => updateDetailedReleaseStatus(release.id, "live"), /cannot move|requires a reason/i);
  const beforeOverride = await prisma.release.findUniqueOrThrow({ where: { id: release.id } });
  await updateDetailedReleaseStatus(release.id, "live", "Operations verified platform availability.", undefined, { manualOverride: true, actorType: "admin", actorId: user.id });
  const afterOverride = await prisma.release.findUniqueOrThrow({ where: { id: release.id } });
  assert.equal(afterOverride.status, "LIVE");
  assert.equal(afterOverride.version, beforeOverride.version + 1);
  const override = await prisma.releaseStatusTransition.findFirstOrThrow({ where: { releaseId: release.id, newStatus: "LIVE" }, orderBy: { createdAt: "desc" } });
  assert.equal((override.metadata as { manualOverride?: boolean }).manualOverride, true);
  assert.equal(override.reason, "Operations verified platform availability.");
  console.log("Release status concurrency and override integration verification passed.");
}

main().finally(() => prisma.$disconnect());
// vercel trigger 9
