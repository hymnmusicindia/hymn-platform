import { NextResponse } from "next/server";
import type { Prisma, ReleaseStatus } from "@prisma/client";
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

    const distributionStatuses: ReleaseStatus[] = [
      "SENT_TO_DISTRIBUTOR",
      "DISTRIBUTOR_PROCESSING",
      "PROCESSING",
      "SCHEDULED",
      "AWAITING_LIVE_CONFIRMATION",
      "PARTIALLY_LIVE",
      "DELIVERED",
      "LIVE"
    ];
    const workflowStatuses: ReleaseStatus[] = [
      "CHANGES_REQUESTED",
      "RESUBMITTED",
      "SUBMITTED",
      "UNDER_REVIEW",
      "IN_QUEUE",
      "IN_QC_QUEUE",
      "APPROVED",
      "QUEUED_FOR_DISTRIBUTION",
      "REJECTED"
    ];
    const statusFilter: Prisma.ReleaseWhereInput = {
      OR: [
        { status: { in: distributionStatuses } },
        { status: { in: workflowStatuses }, direNoteStatus: { not: null } },
        { status: { in: workflowStatuses }, upc: null, tracks: { some: { isrc: { not: null } } } }
      ]
    };

    const started = Date.now();
    const maxRuntimeMs = 280_000;
    const batchSize = 250;
    const candidates = await prisma.release.findMany({
      where: {
        archivedAt: null,
        distributionSubmissions: { some: { provider: "direnote", state: "submitted", isCurrent: true } },
        AND: [statusFilter],
        OR: [
          { direNoteLastAttemptedAt: null },
          { direNoteLastAttemptedAt: { lte: new Date(Date.now() - 60 * 60 * 1000) } },
          { upc: null, tracks: { some: { isrc: { not: null } } } }
        ]
      },
      select: { id: true, title: true, status: true, upc: true, direNoteStatus: true },
      take: batchSize,
      orderBy: [{ direNoteLastAttemptedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }]
    });

    const results: Array<{ releaseId: number; title: string; success: boolean; pending?: boolean; before: { status: string; upc: string | null; direNoteStatus: string | null }; after?: { status: string; upc: string | null; direNoteStatus: string | null }; error?: string }> = [];
    for (const release of candidates) {
      if (Date.now() - started > maxRuntimeMs) break;
      const before = { status: release.status, upc: release.upc, direNoteStatus: release.direNoteStatus };
      try {
        await syncDireNoteRelease(release.id);
        const updated = await prisma.release.findUnique({ where: { id: release.id }, select: { status: true, upc: true, direNoteStatus: true } });
        results.push({ releaseId: release.id, title: release.title, success: true, before, after: updated ?? undefined });
      }
      catch (error) {
        const message = error instanceof Error ? error.message : "Sync failed.";
        const updated = await prisma.release.findUnique({ where: { id: release.id }, select: { status: true, upc: true, direNoteStatus: true } });
        const pending = /^Awaiting UPC:/.test(message);
        results.push({ releaseId: release.id, title: release.title, success: pending, pending, before, after: updated ?? undefined, error: message });
        if (/DIRENOTE_STATUS_AUTH_FAILED|capacity is exhausted/.test(message)) break;
      }
    }
    const summary = {
      eligible: candidates.length,
      checked: results.length,
      updates: results.filter(result => result.success && JSON.stringify(result.before) !== JSON.stringify(result.after)).length,
      errors: results.filter(result => !result.success).length,
      pending: results.filter(result => result.pending).length,
      rejected: results.filter(result => result.before.status !== "REJECTED" && result.after?.status === "REJECTED").length,
      durationMs: Date.now() - started,
      results
    };
    await prisma.direNoteLog.create({ data: { action: "hourly_status_sync", success: summary.errors === 0, responseJson: summary } });
    return NextResponse.json({ success: true, ...summary });
  }, { timeout: 290_000, maxWait: 5000 });
}
