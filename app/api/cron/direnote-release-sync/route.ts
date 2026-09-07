import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDireNoteRelease } from "@/lib/direnote-service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (process.env.DIRENOTE_RELEASE_SYNC_ENABLED === "false") return NextResponse.json({ success: true, skipped: "disabled" });
  return prisma.$transaction(async lock => {
    const rows = await lock.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422029) AS locked`;
    if (!rows[0]?.locked) return NextResponse.json({ success: true, skipped: "already_running" });
  const candidates = await prisma.release.findMany({
    where: { archivedAt: null, AND: [{ OR: [{ direNoteLastAttemptedAt: null }, { direNoteLastAttemptedAt: { lte: new Date(Date.now() - 60 * 60 * 1000) } }] }], OR: [
      { status: { in: ["SENT_TO_DISTRIBUTOR", "DISTRIBUTOR_PROCESSING", "PROCESSING", "SCHEDULED", "AWAITING_LIVE_CONFIRMATION", "PARTIALLY_LIVE", "DELIVERED"] } },
      { direNoteStatus: { not: null }, status: { in: ["CHANGES_REQUESTED", "RESUBMITTED", "SUBMITTED", "UNDER_REVIEW", "IN_QUEUE", "IN_QC_QUEUE", "APPROVED", "QUEUED_FOR_DISTRIBUTION"] } }
    ] },
    select: { id: true },
    take: 50,
    orderBy: [{ direNoteLastAttemptedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }]
  });
  const results: Array<{ releaseId: number; success: boolean; error?: string }> = [];
  const started = Date.now();
  for (const release of candidates) {
    if (Date.now() - started > 180_000) break;
    try { await syncDireNoteRelease(release.id); results.push({ releaseId: release.id, success: true }); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      results.push({ releaseId: release.id, success: false, error: message });
      if (/DIRENOTE_STATUS_AUTH_FAILED|capacity is exhausted/.test(message)) break;
    }
  }
  await prisma.direNoteLog.create({ data: { action: "hourly_status_sync", success: results.every(result => result.success), responseJson: { eligible: candidates.length, checked: results.length, results } } });
  return NextResponse.json({ success: true, eligible: candidates.length, checked: results.length, results });
  }, { timeout: 290_000, maxWait: 5000 });
}
