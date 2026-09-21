import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function validUpc(value: unknown) { const valueText = String(value ?? "").replace(/[\s-]/g, ""); return /^\d{12,14}$/.test(valueText) ? valueText : null; }

async function main() {
  const attempts = await db.distributionSubmissionAttempt.findMany({
    where: { provider: "direnote" }, include: { release: { include: { tracks: { orderBy: { trackNumber: "asc" } } } } }, orderBy: { id: "asc" }
  });
  const grouped = new Map<number, typeof attempts>();
  for (const attempt of attempts) grouped.set(attempt.releaseId, [...(grouped.get(attempt.releaseId) ?? []), attempt]);
  const repairs: Array<{ releaseId: number; attemptId: number; changes: Record<string, unknown> }> = [];
  for (const [releaseId, rows] of grouped) {
    const current = rows.filter(row => row.isCurrent).sort((a, b) => b.id - a.id);
    if (current.length > 1) repairs.push({ releaseId, attemptId: current[0].id, changes: { supersedeAttemptIds: current.slice(1).map(row => row.id) } });
    const attempt = current[0];
    if (!attempt) continue;
    const response = record(attempt.responseRedacted);
    const currentUpc = validUpc(attempt.upc) ?? validUpc(response.upc) ?? validUpc(record(attempt.rawStatusPayload).release && record(record(attempt.rawStatusPayload).release).upc_code);
    const identifiers = Array.isArray(attempt.trackIdentifiers) ? attempt.trackIdentifiers as Array<Record<string, unknown>> : [];
    const missingIsrc = attempt.release.tracks.filter(track => !track.isrc && identifiers.find(item => Number(item.id) === track.id && item.isrc));
    const staleHandoff = attempt.state === "submitted" && ["SUBMITTING_TO_DISTRIBUTOR", "QUEUED_FOR_DISTRIBUTION"].includes(attempt.release.status);
    if (currentUpc && attempt.release.upc !== currentUpc || missingIsrc.length || staleHandoff || current.length > 1) repairs.push({ releaseId, attemptId: attempt.id, changes: { upc: currentUpc && attempt.release.upc !== currentUpc ? currentUpc : undefined, isrcTrackIds: missingIsrc.map(track => track.id), status: staleHandoff ? "SENT_TO_DISTRIBUTOR" : undefined } });
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", repairCount: repairs.length, repairs }, null, 2));
  if (!apply) return;
  for (const repair of repairs) {
    await db.$transaction(async tx => {
      const supersedeAttemptIds = Array.isArray(repair.changes.supersedeAttemptIds) ? repair.changes.supersedeAttemptIds as number[] : [];
      if (supersedeAttemptIds.length) await tx.distributionSubmissionAttempt.updateMany({ where: { id: { in: supersedeAttemptIds } }, data: { isCurrent: false, providerStatus: "superseded" } });
      const attempt = await tx.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: repair.attemptId }, include: { release: { include: { tracks: true } } } });
      const upc = validUpc(repair.changes.upc);
      if (upc) await tx.release.update({ where: { id: repair.releaseId }, data: { upc } });
      const identifiers = Array.isArray(attempt.trackIdentifiers) ? attempt.trackIdentifiers as Array<Record<string, unknown>> : [];
      for (const track of attempt.release.tracks) {
        const isrc = String(identifiers.find(item => Number(item.id) === track.id)?.isrc ?? "").trim();
        if (isrc && !track.isrc) await tx.track.update({ where: { id: track.id }, data: { isrc } });
      }
      if (repair.changes.status === "SENT_TO_DISTRIBUTOR") await tx.release.update({ where: { id: repair.releaseId }, data: { status: "SENT_TO_DISTRIBUTOR" } });
    });
  }
}

main().finally(() => db.$disconnect());
