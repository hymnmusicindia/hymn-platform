import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncDireNoteRelease } from "@/lib/direnote-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const LEASE_KEY = "direnote-release-sync";
const CONCURRENCY = Math.max(1, Math.min(Number(process.env.DIRENOTE_RELEASE_SYNC_CONCURRENCY || 3), 5));
const POST_REVIEW_PROVIDER_STATES = ["SCHEDULED", "AWAITING_LIVE_CONFIRMATION", "PARTIALLY_LIVE"] as const;
// Provider polling continues for "SCHEDULED", "AWAITING_LIVE_CONFIRMATION",
// and "PARTIALLY_LIVE" via the current attempt's providerStatus.

async function acquireLease(runId: string) {
  const rows = await prisma.$queryRaw<Array<{ run_id: string }>>(Prisma.sql`
    INSERT INTO "cron_leases" ("lease_key", "run_id", "leased_until", "updated_at")
    VALUES (${LEASE_KEY}, ${runId}, NOW() + INTERVAL '5 minutes', NOW())
    ON CONFLICT ("lease_key") DO UPDATE
      SET "run_id" = EXCLUDED."run_id", "leased_until" = EXCLUDED."leased_until", "updated_at" = NOW()
      WHERE "cron_leases"."leased_until" < NOW()
    RETURNING "run_id"
  `);
  return rows[0]?.run_id === runId;
}

async function releaseLease(runId: string) {
  await prisma.$executeRaw(Prisma.sql`UPDATE "cron_leases" SET "leased_until" = NOW(), "updated_at" = NOW() WHERE "lease_key" = ${LEASE_KEY} AND "run_id" = ${runId}`);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (process.env.DIRENOTE_RELEASE_SYNC_ENABLED === "false") return NextResponse.json({ success: true, skipped: "disabled" });

  const runId = crypto.randomUUID();
  try {
    if (!await acquireLease(runId)) return NextResponse.json({ success: true, skipped: "already_running" });
  } catch {
    return NextResponse.json({ success: false, error: "DireNote cron lease is unavailable. Deploy database migrations before enabling sync." }, { status: 503 });
  }

  const started = Date.now();
  try {
    // The provider attempt is the synchronization identity. Release status is
    // a customer-facing projection repaired by syncDireNoteRelease.
    await prisma.direNoteSyncRun.create({ data: { runId } });
    const candidates = await prisma.distributionSubmissionAttempt.findMany({
      where: {
        provider: "direnote", isCurrent: true, state: "submitted", release: { archivedAt: null },
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { lte: new Date(Date.now() - 60 * 60 * 1000) } },
          { upc: null },
          { providerStatus: { in: ["processing", "changes_required", "rejected", "scheduled", "awaiting_live_confirmation", "partially_live"] } }
        ]
      },
      include: { release: { select: { id: true, title: true } } },
      orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: Math.max(CONCURRENCY, Math.min(Number(process.env.DIRENOTE_RELEASE_SYNC_BATCH_SIZE || 30), 100))
    });
    const results: Array<{ releaseId: number; title: string; success: boolean; error?: string; upc?: string | null; status?: string }> = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < candidates.length && Date.now() - started < 280_000) {
        const candidate = candidates[cursor++];
        try {
          const outcome = await syncDireNoteRelease(candidate.releaseId);
          results.push({ releaseId: candidate.releaseId, title: candidate.release.title, success: true, upc: outcome.upc, status: outcome.status });
        }
        catch (error) { results.push({ releaseId: candidate.releaseId, title: candidate.release.title, success: false, error: error instanceof Error ? error.message : "Sync failed." }); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));
    const summary = { runId, candidateCount: candidates.length, providerRequestCount: results.length, processedCount: results.length, changedCount: results.filter(result => result.success).length, identifierRepairCount: results.filter(result => result.success && Boolean(result.upc)).length, statusRepairCount: results.filter(result => result.success && Boolean(result.status)).length, correctionCount: results.filter(result => result.status === "changes_required").length, errorCount: results.filter(result => !result.success).length, deferredCount: candidates.length - results.length, durationMs: Date.now() - started, eligible: candidates.length, checked: results.length };
    await prisma.direNoteSyncRun.update({ where: { runId }, data: { status: summary.errorCount ? "completed_with_errors" : "completed", completedAt: new Date(), candidateCount: summary.candidateCount, providerRequestCount: summary.providerRequestCount, processedCount: summary.processedCount, changedCount: summary.changedCount, identifierRepairCount: summary.identifierRepairCount, statusRepairCount: summary.statusRepairCount, correctionCount: summary.correctionCount, errorCount: summary.errorCount, deferredCount: summary.deferredCount, durationMs: summary.durationMs, summary } });
    await prisma.direNoteLog.create({ data: { action: "hourly_status_sync", success: summary.errorCount === 0, responseJson: summary } });
    return NextResponse.json({ success: true, ...summary, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DireNote reconciliation run failed.";
    const durationMs = Date.now() - started;
    await prisma.direNoteSyncRun.updateMany({ where: { runId, status: "running" }, data: { status: "failed", completedAt: new Date(), errorCount: 1, durationMs, summary: { runId, error: message, durationMs } } }).catch(() => undefined);
    await prisma.direNoteLog.create({ data: { action: "hourly_status_sync", success: false, responseJson: { runId, error: message, durationMs } } }).catch(() => undefined);
    return NextResponse.json({ success: false, runId, error: message }, { status: 500 });
  } finally {
    await releaseLease(runId).catch(() => undefined);
  }
}
