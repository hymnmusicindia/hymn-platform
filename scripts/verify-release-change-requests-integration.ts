import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { createReleaseChangeRequest, reviewReleaseChangeRequest } from "../lib/release-change-requests";

async function main() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { googleId: `change-${stamp}`, name: "Change Fixture", email: `change-${stamp}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  const release = await prisma.release.create({ data: { userId: user.id, title: "Live Fixture", artistName: user.name, genre: "Test", releaseDate: new Date(), releaseType: "single", status: "LIVE", paymentStatus: "paid" } });
  const request = await createReleaseChangeRequest({ releaseId: release.id, userId: user.id, requestType: "metadata_update", reason: "Correct the songwriter spelling in store metadata.", requestedChanges: { songwriter: "Correct Name" } });
  const duplicate = await createReleaseChangeRequest({ releaseId: release.id, userId: user.id, requestType: "metadata_update", reason: "This duplicate must resolve to the active request." });
  assert.equal(duplicate.id, request.id);
  await assert.rejects(() => reviewReleaseChangeRequest({ id: request.id, adminId: user.id, decision: "completed", note: "Illegal direct completion." }), /cannot move/);
  await reviewReleaseChangeRequest({ id: request.id, adminId: user.id, decision: "approved", note: "Metadata correction approved." });
  await reviewReleaseChangeRequest({ id: request.id, adminId: user.id, decision: "submitted_to_partner", note: "Submitted to distributor support.", providerReference: "DN-CHANGE-123" });
  await reviewReleaseChangeRequest({ id: request.id, adminId: user.id, decision: "completed", note: "Distributor confirmed the metadata update." });
  const completed = await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id: request.id }, include: { events: { orderBy: { createdAt: "asc" } } } });
  assert.deepEqual(completed.events.map(event => event.newStatus), ["submitted", "approved", "submitted_to_partner", "completed"]);
  assert.equal(completed.providerReference, "DN-CHANGE-123");

  const takedown = await createReleaseChangeRequest({ releaseId: release.id, userId: user.id, requestType: "takedown", reason: "Remove this release from every destination immediately." });
  await reviewReleaseChangeRequest({ id: takedown.id, adminId: user.id, decision: "approved", note: "Rights-owner takedown approved." });
  await assert.rejects(() => reviewReleaseChangeRequest({ id: takedown.id, adminId: user.id, decision: "submitted_to_partner", note: "Missing partner reference." }), /reference/);
  await reviewReleaseChangeRequest({ id: takedown.id, adminId: user.id, decision: "submitted_to_partner", note: "Takedown sent to distributor.", providerReference: "DN-TAKEDOWN-456" });
  await reviewReleaseChangeRequest({ id: takedown.id, adminId: user.id, decision: "completed", note: "Distributor confirmed removal." });
  const takenDown = await prisma.release.findUniqueOrThrow({ where: { id: release.id } });
  assert.equal(takenDown.status, "TAKEN_DOWN");
  assert.equal(await prisma.releaseStatusTransition.count({ where: { releaseId: release.id, newStatus: { in: ["TAKEDOWN_REQUESTED", "TAKEDOWN_PROCESSING", "TAKEN_DOWN"] } } }), 3);
  console.log("Release change request workflow and takedown integration verification passed.");
}

main().finally(() => prisma.$disconnect());
// vercel trigger 9
