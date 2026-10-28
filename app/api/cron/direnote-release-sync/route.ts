import { cronHandler } from "@/lib/cron/runtime";
export const GET = cronHandler("direnote-release-sync", runJob);
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runPendingDistributionQc } from "@/lib/distribution-auto-qc";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncDireNoteArtistInformation, syncDireNoteRelease, syncDireNoteSongwriterInformation } from "@/lib/direnote-service";
import { submitRelease } from "@/lib/distribution-service";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { isDireNoteRateLimit } from "@/lib/direnote-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

const LEASE_KEY = "direnote-release-sync";
const CONCURRENCY = Math.max(1, Math.min(Number(process.env.DIRENOTE_RELEASE_SYNC_CONCURRENCY || 3), 5));
const STATUS_POLL_INTERVAL_MS = 15 * 60 * 1000;
// Hostinger's edge abandons a request after 60s. Reserve time for provider calls
// already in flight and for persisting the complete run summary.
const START_WORK_UNTIL_MS = 50_000;
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

async function runJob(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "X-HYMN-DireNote-Sync-Version": "corrections-v2" } });
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
    // Recover a verified, QC-passed release if its request ended before the
    // background handoff ran. The submission lock and attempt state prevent duplicates.
    const autoQcCandidates = await prisma.release.findMany({
      where: { archivedAt: null, paymentStatus: "paid", status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "QUEUED_FOR_DISTRIBUTION"] }, OR: [{ metadata: { path: ["autoQc", "status"], equals: "passed" } }, { metadata: { path: ["autoQc", "status"], equals: "pending" } }], distributionSubmissions: { none: { provider: "direnote", state: { in: ["submitted", "reconciliation_required", "processing", "failed"] } } } },
      select: { id: true, status: true, distributionSubmissions: { where: { provider: "direnote" }, select: { state: true }, orderBy: { startedAt: "desc" }, take: 1 } },
      orderBy: { id: "asc" }, take: 5
    });
    const autoQcResults: Array<{ releaseId: number; outcome: string }> = [];
    for (const candidate of autoQcCandidates) {
      if (Date.now() - started > 10_000) break;
      const attemptState = candidate.distributionSubmissions[0]?.state;
      if (attemptState === "submitted" || attemptState === "reconciliation_required" || attemptState === "processing" || attemptState === "failed") continue;
      if (candidate.status === "QUEUED_FOR_DISTRIBUTION" && attemptState !== "retryable") continue;
      try {
        if(!await runPendingDistributionQc(candidate.id, getPublicAppUrl(request.url))) continue;
        const qcRelease = await prisma.release.findUnique({ where: { id: candidate.id }, select: { metadata: true } });
        const result = await submitRelease(candidate.id, { siteUrl: getPublicAppUrl(request.url), retry: attemptState === "retryable", automaticQcRevision: String((qcRelease?.metadata as {autoQc?:{revision?:string}}|null)?.autoQc?.revision || "missing") });
        autoQcResults.push({ releaseId: candidate.id, outcome: result.submitted ? "submitted" : "inProgress" in result && result.inProgress ? "in_progress" : result.retryable ? "retryable" : "failed" });
      } catch (error) {
        console.error("Auto QC DireNote recovery failed", { releaseId: candidate.id, error });
        autoQcResults.push({ releaseId: candidate.id, outcome: "failed" });
      }
    }
    const candidateRows = await prisma.distributionSubmissionAttempt.findMany({
      where: {
        // Accepted requests that need reconciliation are still safe to poll:
        // this path only reads release status and never submits another ingest.
        provider: "direnote", isCurrent: true, state: { in: ["submitted", "reconciliation_required"] }, release: { archivedAt: null },
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { lte: new Date(Date.now() - STATUS_POLL_INTERVAL_MS) } }
        ]
      },
      include: { release: { select: { id: true, title: true } } },
      orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: Math.max(CONCURRENCY, Math.min(Number(process.env.DIRENOTE_RELEASE_SYNC_BATCH_SIZE || 30), 100))
    });
    const candidates = candidateRows.filter(item => !item.corrections || typeof item.corrections !== "object" || Array.isArray(item.corrections) || (item.corrections as Prisma.JsonObject).status !== "customer_resolved");
    // Recover accepted legacy attempts whose current flag was never persisted.
    // This is status reconciliation only, never a second ingestion request.
    const missingLineageRows = await prisma.distributionSubmissionAttempt.findMany({
      where: { provider: "direnote", state: "submitted", OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: new Date(Date.now() - STATUS_POLL_INTERVAL_MS) } }], release: { archivedAt: null,
        distributionSubmissions: { none: { provider: "direnote", isCurrent: true } } } },
      include: { release: { select: { id: true, title: true } } },
      orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { id: "desc" }], take: 5
    });
    const missingLineage = missingLineageRows.filter(item => !item.corrections || typeof item.corrections !== "object" || Array.isArray(item.corrections) || (item.corrections as Prisma.JsonObject).status !== "customer_resolved");
    for (const candidate of missingLineage) if (!candidates.some(item => item.releaseId === candidate.releaseId)) candidates.unshift(candidate);
    const results: Array<{ releaseId: number; title: string; success: boolean; pending?: boolean; reason?: string; error?: string; upc?: string | null; status?: string }> = [];
    let cursor = 0;
    let retryAfterSeconds = 0;
    const worker = async () => {
      while (!retryAfterSeconds && cursor < candidates.length && Date.now() - started < START_WORK_UNTIL_MS) {
        const candidate = candidates[cursor++];
        try {
          const outcome = await syncDireNoteRelease(candidate.releaseId, null, { deadlineAt: started + 55_000 });
          results.push({ releaseId: candidate.releaseId, title: candidate.release.title, success: true, ...( "skipped" in outcome ? { pending: true, reason: outcome.skipped } : { upc: outcome.upc, status: outcome.status }) });
        }
        catch (error) {
          if (isDireNoteRateLimit(error)) { retryAfterSeconds = Math.max(retryAfterSeconds, error.retryAfterSeconds); break; }
          // Failed/missing-UPC records used to stay at the front forever. Rotate
          // them behind unchecked work; retain the error and retry next run.
          await prisma.distributionSubmissionAttempt.updateMany({ where: { id: candidate.id }, data: { lastCheckedAt: new Date() } }).catch(() => undefined);
          const message = error instanceof Error ? error.message : "Sync failed.";
          // DireNote assigns UPCs after delivery, so waiting for one is an expected
          // state. Counting it as an error failed the whole job every run.
          if (/^Awaiting (UPC|DireNote identifiers)/.test(message)) results.push({ releaseId: candidate.releaseId, title: candidate.release.title, success: true, pending: true, reason: message });
          else results.push({ releaseId: candidate.releaseId, title: candidate.release.title, success: false, error: message });
        }
      }
    };
    const staleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const identityBudget = 10;
    const refreshIdentities = async () => {
      // Newly provisioned artists can gain their store pages days apart. Keep asking
      // check_artist hourly until both music identities arrive, then refresh weekly.
      const pendingArtists = await prisma.artistCard.findMany({
        where: { direNoteArtistId: { not: null }, archivedAt: null, AND: [
          { OR: [{ spotifyProfileUrl: null }, { spotifyProfileUrl: "" }, { appleMusicProfileUrl: null }, { appleMusicProfileUrl: "" }] },
          { OR: [{ direNoteLastSyncedAt: null }, { direNoteLastSyncedAt: { lte: new Date(Date.now() - 60 * 60 * 1000) } }] }
        ] }, select: { id: true }, take: identityBudget, orderBy: { direNoteLastSyncedAt: { sort: "asc", nulls: "first" } }
      });
      const [staleArtists, songwriters] = await Promise.all([
        identityBudget > pendingArtists.length ? prisma.artistCard.findMany({ where: { id: { notIn: pendingArtists.map(item => item.id) }, direNoteArtistId: { not: null }, archivedAt: null, OR: [{ direNoteLastSyncedAt: null }, { direNoteLastSyncedAt: { lt: staleBefore } }] }, select: { id: true }, take: identityBudget - pendingArtists.length, orderBy: { direNoteLastSyncedAt: { sort: "asc", nulls: "first" } } }) : Promise.resolve([]),
        prisma.contributorParty.findMany({ where: { direNoteSongwriterId: { not: null }, mergedIntoId: null, OR: [{ direNoteLastSyncedAt: null }, { direNoteLastSyncedAt: { lt: staleBefore } }] }, select: { id: true }, take: 3, orderBy: { direNoteLastSyncedAt: { sort: "asc", nulls: "first" } } })
      ]);
      const artists = [...pendingArtists, ...staleArtists];
      const identityTimeout = () => ({ timeoutMs: Math.max(1000, Math.min(12000, started + 55_000 - Date.now())) });
      const tasks = [...artists.map(item => () => syncDireNoteArtistInformation(item.id, null, null, identityTimeout())), ...songwriters.map(item => () => syncDireNoteSongwriterInformation(item.id, null, null, identityTimeout()))];
      const outcomes: PromiseSettledResult<unknown>[] = [];
      let identityCursor = 0;
      await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, async () => {
        while (!retryAfterSeconds && identityCursor < tasks.length && Date.now() - started < START_WORK_UNTIL_MS) {
          const task = tasks[identityCursor++];
          try { outcomes.push({ status: "fulfilled", value: await task() }); }
          catch (reason) {
            if (isDireNoteRateLimit(reason)) { retryAfterSeconds = Math.max(retryAfterSeconds, reason.retryAfterSeconds); break; }
            outcomes.push({ status: "rejected", reason });
          }
        }
      }));
      return outcomes;
    };
    // Runs alongside the release syncs so a full release batch cannot use up the
    // time budget and starve identity refresh. allSettled keeps a failed identity
    // lookup from leaving the release workers running after the response.
    const [, identity] = await Promise.allSettled([
      Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker)),
      refreshIdentities()
    ]);
    if (identity.status === "rejected") throw identity.reason;
    const identityResults = identity.value;
    const identityErrors = identityResults.filter(item => item.status === "rejected").length;
    const summary = { runId, candidateCount: candidates.length, autoQcRecoveryCount: autoQcResults.length, autoQcResults, providerRequestCount: results.length + identityResults.length + autoQcResults.length, processedCount: results.length, changedCount: results.filter(result => result.success && !result.pending).length, pendingCount: results.filter(result => result.pending).length, identifierRepairCount: results.filter(result => result.success && Boolean(result.upc)).length, statusRepairCount: results.filter(result => result.success && Boolean(result.status)).length, correctionCount: results.filter(result => result.status === "changes_required").length, identityRefreshCount: identityResults.length - identityErrors, identityErrorCount: identityErrors, errorCount: results.filter(result => !result.success).length + identityErrors + autoQcResults.filter(result => result.outcome === "failed").length, deferredCount: candidates.length - results.length, durationMs: Date.now() - started, eligible: candidates.length, checked: results.length };
    const diagnosticSummary = { ...summary, rateLimited: retryAfterSeconds > 0, retryAfterSeconds, syncVersion: "corrections-v2", results };
    await prisma.direNoteSyncRun.update({ where: { runId }, data: { status: summary.errorCount ? "completed_with_errors" : "completed", completedAt: new Date(), candidateCount: summary.candidateCount, providerRequestCount: summary.providerRequestCount, processedCount: summary.processedCount, changedCount: summary.changedCount, identifierRepairCount: summary.identifierRepairCount, statusRepairCount: summary.statusRepairCount, correctionCount: summary.correctionCount, errorCount: summary.errorCount, deferredCount: summary.deferredCount, durationMs: summary.durationMs, summary: diagnosticSummary } });
    await prisma.direNoteLog.create({ data: { action: "hourly_status_sync", success: summary.errorCount === 0, responseJson: diagnosticSummary } });
    return NextResponse.json({ success: true, ...diagnosticSummary });
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
