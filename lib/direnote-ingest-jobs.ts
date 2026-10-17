import "server-only";
import { prisma } from "@/lib/prisma";
import { getDireNoteIngestStatus } from "@/lib/direnote/direnote-client";
import { parseDireNoteResponse, redactDireNoteDiagnostic } from "@/lib/direnote";
import { reserveDireNoteRequest } from "@/lib/direnote-rate-limit";
import { activateDireNoteAttempt, finishDistributionSubmission } from "@/lib/distribution-idempotency";
import { markReleaseDistributionSuccess, updateDetailedReleaseStatus, logDistributionEvent, createReleaseAuditLog } from "@/lib/distribution-db";
import { validIsrc, validReleaseBarcode } from "@/lib/release-input-rules";

type JobRecord = Record<string, unknown>;
const object = (value: unknown): JobRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JobRecord : {};
const cleanText = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";

function responseBody(log: { responseJson: unknown; responseRaw: string | null }) {
  const parsed = object(log.responseJson);
  if (Object.keys(parsed).length) return parsed;
  try { return object(JSON.parse(log.responseRaw || "{}")); } catch { return {}; }
}

async function recoverJobReference(attempt: { id: number; releaseId: number; responseRedacted: unknown; providerReference: string | null; idempotencyKey: string }) {
  const stored = object(attempt.responseRedacted);
  const storedJobId = cleanText(stored.ingestJobId ?? stored.job_id, 200);
  const storedKey = cleanText(stored.providerIdempotencyKey ?? stored.idempotency_key, 200);
  if (storedJobId || storedKey) return { jobId: storedJobId || null, idempotencyKey: storedKey || null, stored };

  // Backfill jobs accepted before HYMN began storing their job_id on the attempt.
  const logs = await prisma.direNoteLog.findMany({
    where: { releaseId: attempt.releaseId, action: { in: ["release_submission", "retry_submission"] }, success: true, httpStatus: 202 },
    orderBy: { id: "desc" }, take: 5, select: { responseJson: true, responseRaw: true }
  });
  for (const log of logs) {
    const body = responseBody(log);
    const jobId = cleanText(body.job_id ?? body.jobId, 200);
    const idempotencyKey = cleanText(body.idempotency_key ?? body.idempotencyKey, 200);
    if (!jobId && !idempotencyKey) continue;
    const responseRedacted = { ...stored, ingestJobId: jobId || null, providerIdempotencyKey: idempotencyKey || null, ingestJobStatus: cleanText(body.status, 30) || "queued", pollAfterSeconds: Number(body.poll_after_seconds) || 60 };
    await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { providerReference: attempt.providerReference || jobId || null, providerStatus: "queued", responseRedacted: responseRedacted as never } });
    return { jobId: jobId || null, idempotencyKey: idempotencyKey || null, stored: responseRedacted };
  }
  return { jobId: null, idempotencyKey: null, stored };
}

async function recordPollFailure(attempt: { id: number; releaseId: number }, previous: JobRecord, message: string) {
  const safe = String(redactDireNoteDiagnostic(message)).slice(0, 500);
  await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { lastCheckedAt: new Date(), safeError: safe, responseRedacted: { ...previous, lastPollError: safe, lastPolledAt: new Date().toISOString() } as never } });
  await logDistributionEvent({ releaseId: attempt.releaseId, action: "ingest_status", errors: [safe], success: false });
}

export async function pollDireNoteIngestJobs(options: { limit?: number } = {}) {
  const now = new Date();
  const candidates = await prisma.distributionSubmissionAttempt.findMany({
    where: {
      provider: "direnote", isCurrent: true, state: "submitted", providerStatus: { in: ["queued", "processing"] }, release: { archivedAt: null },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: new Date(now.getTime() - 60_000) } }]
    },
    include: { release: { select: { id: true, title: true, status: true, upc: true, releaseDate: true, tracks: { orderBy: { trackNumber: "asc" }, select: { id: true, title: true, trackNumber: true, isrc: true } } } } },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { startedAt: "asc" }, { id: "asc" }],
    // Look ahead so accepted jobs with no recoverable reference can be
    // quarantined without starving later jobs in the queue.
    take: 50
  });
  let checked = 0, queued = 0, processing = 0, completed = 0, failed = 0, errorCount = 0;
  const maxProviderCalls = Math.max(1, Math.min(options.limit ?? 1, 10));
  const results: Array<{ releaseId: number; state: string; progress?: string; error?: string }> = [];

  for (const attempt of candidates) {
    if (checked >= maxProviderCalls) break;
    if (attempt.responseRedacted && (attempt.responseRedacted as JobRecord).ingestJobStatus === "completed") continue;
    const reference = await recoverJobReference(attempt);
    if (!reference.jobId && !reference.idempotencyKey) {
      await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { state: "reconciliation_required", lastCheckedAt: new Date(), safeError: "DireNote accepted this job, but no job_id or idempotency key was recorded. Manual provider reconciliation is required." } });
      await createReleaseAuditLog({ releaseId: attempt.releaseId, action: "DIRENOTE_INGEST_JOB_REFERENCE_MISSING", details: { attemptId: attempt.id } });
      errorCount++;
      results.push({ releaseId: attempt.releaseId, state: "reconciliation_required", error: "Accepted job has no usable status reference." });
      continue;
    }
    try {
      checked++;
      await reserveDireNoteRequest("ingest_status", attempt.releaseId);
      const response = await getDireNoteIngestStatus({ jobId: reference.jobId, idempotencyKey: reference.idempotencyKey }, { timeoutMs: 20_000 });
      const body = object(response.data);
      if (!response.success || body.success !== true) throw new Error(response.error || cleanText(body.error) || "DireNote job status was not confirmed.");
      const responseJobId = cleanText(body.job_id ?? body.jobId, 200);
      if (reference.jobId && responseJobId && responseJobId !== reference.jobId) throw new Error("DireNote returned a different job ID than the accepted submission.");
      const status = cleanText(body.status, 30).toLowerCase();
      if (!["queued", "processing", "completed", "failed"].includes(status)) throw new Error("DireNote returned an unsupported ingest job status.");
      const checkedAt = new Date();
      const progress = cleanText(body.progress, 200);
      const jobMetadata: JobRecord = {
        ...reference.stored,
        ingestJobId: (reference.jobId ?? responseJobId) || null,
        providerIdempotencyKey: (reference.idempotencyKey ?? cleanText(body.idempotency_key, 200)) || null,
        ingestJobStatus: status,
        progress: progress || null,
        jobAttempts: Number.isFinite(Number(body.attempts)) ? Number(body.attempts) : null,
        pollAfterSeconds: Number.isFinite(Number(body.poll_after_seconds)) ? Math.max(1, Math.min(3600, Number(body.poll_after_seconds))) : 60,
        lastPolledAt: checkedAt.toISOString()
      };

      if (status === "queued" || status === "processing") {
        await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { providerStatus: status, lastCheckedAt: checkedAt, safeError: null, responseRedacted: jobMetadata as never } });
        await logDistributionEvent({ releaseId: attempt.releaseId, action: "ingest_status", httpStatus: response.httpStatus, responsePayload: { job_id: responseJobId || reference.jobId, status, progress: progress || null, attempts: jobMetadata.jobAttempts, poll_after_seconds: jobMetadata.pollAfterSeconds }, success: true });
        if (status === "processing" && attempt.release.status === "SENT_TO_DISTRIBUTOR") await updateDetailedReleaseStatus(attempt.releaseId, "distributor_processing", "DireNote is processing the accepted ingest job.", undefined, { notify: false });
        if (status === "queued") queued++; else processing++;
        results.push({ releaseId: attempt.releaseId, state: status, ...(progress ? { progress } : {}) });
        continue;
      }

      if (status === "failed") {
        const failure = cleanText(object(body.error).message ?? body.error, 500) || "DireNote could not finish processing the ingest job.";
        const canResubmit = body.can_resubmit === true;
        const responseRedacted = { ...jobMetadata, canResubmit, error: failure };
        await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { state: canResubmit ? "retryable" : "failed", isCurrent: false, providerStatus: "failed", lastCheckedAt: checkedAt, safeError: failure, responseRedacted: responseRedacted as never, completedAt: checkedAt } });
        await updateDetailedReleaseStatus(attempt.releaseId, "delivery_failed", `DireNote ingest job failed: ${failure}`);
        await logDistributionEvent({ releaseId: attempt.releaseId, action: "ingest_status", httpStatus: response.httpStatus, responsePayload: { job_id: responseJobId || reference.jobId, status, can_resubmit: canResubmit, error: failure }, errors: [failure], success: false });
        await createReleaseAuditLog({ releaseId: attempt.releaseId, action: "DIRENOTE_INGEST_JOB_FAILED", details: { attemptId: attempt.id, canResubmit, error: failure } });
        failed++;
        results.push({ releaseId: attempt.releaseId, state: canResubmit ? "retryable" : "failed", error: failure });
        continue;
      }

      const result = object(body.result);
      const parsed = parseDireNoteResponse({ success: true, ...result });
      const upc = parsed.upc;
      const albumName = cleanText(result.album_name ?? result.albumname, 300).replace(/\s+/g, " ").toLowerCase();
      const expectedTitle = attempt.release.title.trim().replace(/\s+/g, " ").toLowerCase();
      const trackCount = Number(result.track_count ?? parsed.trackIsrcs.length);
      const mappedTracks = attempt.release.tracks.map(track => {
        const remote = parsed.trackIsrcs.find(item => item.trackNumber === track.trackNumber || item.trackTitle?.trim().toLowerCase() === track.title.trim().toLowerCase());
        return { id: track.id, title: track.title, trackNumber: track.trackNumber, isrc: remote?.isrc ?? track.isrc ?? null };
      });
      const invalidIdentity = !upc || !validReleaseBarcode(upc) || albumName && albumName !== expectedTitle || trackCount !== attempt.release.tracks.length || parsed.trackIsrcs.length !== attempt.release.tracks.length || mappedTracks.some(track => !track.isrc || !validIsrc(track.isrc));
      const safeResult = { upc: upc ?? null, albumName: cleanText(result.album_name ?? result.albumname, 300) || null, trackCount, releaseDate: cleanText(result.release_date, 30) || null, distributorReleaseId: parsed.distributorReleaseId ?? null, tracks: parsed.trackIsrcs, artists: parsed.artists, songwriters: parsed.songwriters, warnings: parsed.warnings };
      if (invalidIdentity) {
        const reason = "DireNote completed the ingest job, but its release identifiers or metadata did not match HYMN's release. Review the stored job result before syncing.";
        await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { state: "reconciliation_required", providerStatus: "completed", lastCheckedAt: checkedAt, safeError: reason, responseRedacted: { ...jobMetadata, result: safeResult } as never } });
        await createReleaseAuditLog({ releaseId: attempt.releaseId, action: "DIRENOTE_INGEST_JOB_RECONCILIATION_REQUIRED", details: { attemptId: attempt.id, hasUpc: Boolean(upc), trackCount, expectedTrackCount: attempt.release.tracks.length, albumName: safeResult.albumName } });
        errorCount++;
        results.push({ releaseId: attempt.releaseId, state: "reconciliation_required", error: reason });
        continue;
      }

      const completedData = { ...jobMetadata, ingestJobStatus: "completed", result: safeResult };
      await activateDireNoteAttempt(attempt.id, { upc: upc!, providerStatus: "processing", trackIdentifiers: mappedTracks as never, responseRedacted: completedData as never });
      if (attempt.release.status === "SUBMITTING_TO_DISTRIBUTOR") await updateDetailedReleaseStatus(attempt.releaseId, "sent_to_distributor", "DireNote completed the accepted ingest job.");
      const currentRelease = await prisma.release.findUniqueOrThrow({ where: { id: attempt.releaseId } });
      const priorMetadata = object(currentRelease.metadata);
      await prisma.release.update({ where: { id: attempt.releaseId }, data: { metadata: { ...priorMetadata, direnoteAccepted: true, direnoteAcceptedAt: checkedAt.toISOString(), direnoteStatus: "accepted", direnoteResponse: safeResult, latestStatusSyncAt: checkedAt.toISOString() } } });
      await markReleaseDistributionSuccess({ releaseId: attempt.releaseId, status: attempt.release.releaseDate > checkedAt ? "scheduled" : "awaiting_live_confirmation", distributorReleaseId: parsed.distributorReleaseId, upc: upc!, trackIsrcs: parsed.trackIsrcs, responsePayload: safeResult, warnings: parsed.warnings });
      await finishDistributionSubmission(attempt.id, { state: "submitted", providerStatus: "processing", httpStatus: response.httpStatus, providerReference: parsed.distributorReleaseId ?? upc ?? attempt.providerReference, responseRedacted: completedData as never });
      await logDistributionEvent({ releaseId: attempt.releaseId, action: "ingest_status", httpStatus: response.httpStatus, responsePayload: { job_id: responseJobId || reference.jobId, status, result: safeResult }, success: true });
      await createReleaseAuditLog({ releaseId: attempt.releaseId, action: "DIRENOTE_INGEST_JOB_COMPLETED", details: { attemptId: attempt.id, jobId: reference.jobId ?? responseJobId, upc, trackCount } });
      completed++;
      results.push({ releaseId: attempt.releaseId, state: "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "DireNote job status polling failed.";
      await recordPollFailure(attempt, reference.stored, message);
      errorCount++;
      results.push({ releaseId: attempt.releaseId, state: "poll_error", error: String(redactDireNoteDiagnostic(message)).slice(0, 300) });
    }
  }
  return { checked, queued, processing, completed, failed, errorCount, deferred: Math.max(0, candidates.length - checked - errorCount), results };
}
