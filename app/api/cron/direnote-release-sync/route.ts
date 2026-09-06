import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDireNoteRelease } from "@/lib/direnote-service";

export const runtime = "nodejs";

const RECENT_RELEASE_SYNC_MS = 30 * 60 * 1000;
const ESTABLISHED_RELEASE_SYNC_MS = 6 * 60 * 60 * 1000;
const MATURE_RELEASE_SYNC_MS = 24 * 60 * 60 * 1000;

function nextStatusCheckDelay(releaseCreatedAt: Date) {
  const age = Date.now() - releaseCreatedAt.getTime();
  if (age < 24 * 60 * 60 * 1000) return RECENT_RELEASE_SYNC_MS;
  if (age < 7 * 24 * 60 * 60 * 1000) return ESTABLISHED_RELEASE_SYNC_MS;
  return MATURE_RELEASE_SYNC_MS;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (process.env.DIRENOTE_RELEASE_SYNC_ENABLED === "false") return NextResponse.json({ success: true, skipped: "disabled" });
  // Keep delivered and live catalogue status visible to DireNote reconciliation
  // while excluding drafts. Keep provider corrections and HYMN re-review
  // eligible; the sync must not overwrite those states with provider processing.
  // The narrow
  // projection remains compatible with the legacy production schema while the
  // optional DireNote columns are awaiting migration.
  const candidates = await prisma.release.findMany({
    where: { archivedAt: null, OR: [
      { status: { in: ["SENT_TO_DISTRIBUTOR", "DISTRIBUTOR_PROCESSING", "PROCESSING", "SCHEDULED", "AWAITING_LIVE_CONFIRMATION", "PARTIALLY_LIVE", "DELIVERED", "LIVE"] } },
      { direNoteStatus: { not: null }, status: { in: ["CHANGES_REQUESTED", "RESUBMITTED", "SUBMITTED", "UNDER_REVIEW", "IN_QUEUE", "IN_QC_QUEUE", "APPROVED", "QUEUED_FOR_DISTRIBUTION"] } }
    ] },
    select: { id: true, createdAt: true, updatedAt: true },
    take: 100,
    orderBy: { updatedAt: "asc" }
  });
  const candidateIds = candidates.map((release) => release.id);
  const priorChecks = candidateIds.length ? await prisma.direNoteLog.findMany({
    where: { releaseId: { in: candidateIds }, action: { in: ["release_information", "upc_lookup"] } },
    select: { releaseId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 300
  }) : [];
  const lastCheckByRelease = new Map<number, Date>();
  for (const row of priorChecks) if (row.releaseId && !lastCheckByRelease.has(row.releaseId)) lastCheckByRelease.set(row.releaseId, row.createdAt);
  // Five releases use at most ten calls, including ISRC-to-UPC recovery,
  // leaving provider capacity for submissions and operators.
  const releases = candidates
    .filter((release) => {
      const lastCheck = lastCheckByRelease.get(release.id);
      return !lastCheck || Date.now() - lastCheck.getTime() >= nextStatusCheckDelay(release.createdAt);
    })
    .slice(0, 5);
  const results: Array<{ releaseId: number; success: boolean; error?: string }> = [];
  for (const release of releases) {
    try { await syncDireNoteRelease(release.id); results.push({ releaseId: release.id, success: true }); }
    catch (error) { results.push({ releaseId: release.id, success: false, error: error instanceof Error ? error.message : "Sync failed." }); }
  }
  return NextResponse.json({ success: true, eligible: candidates.length, checked: results.length, results });
}
