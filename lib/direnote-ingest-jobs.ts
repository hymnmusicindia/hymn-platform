import { flagAmendmentManualQc, recordAmendmentQcPassed } from './release-amendment-automation';
import { failArtistAmendment } from '@/lib/release-artist-amendment';
import "server-only";
import { prisma } from "@/lib/prisma";
import { getDireNoteIngestStatus } from "@/lib/direnote/direnote-client";
import { parseDireNoteResponse, redactDireNoteDiagnostic } from "@/lib/direnote";
import { reserveDireNoteRequest, isDireNoteRateLimit, enforceDireNoteResponseLimit } from "@/lib/direnote-rate-limit";
import { activateDireNoteAttempt, finishDistributionSubmission } from "@/lib/distribution-idempotency";
import { markReleaseDistributionSuccess, updateDetailedReleaseStatus, logDistributionEvent, createReleaseAuditLog } from "@/lib/distribution-db";
import { validIsrc, validReleaseBarcode } from "@/lib/release-input-rules";
import { statusAfterDireNoteAcceptance } from "@/lib/release-status-engine";
import { persistDireNoteArtistIds } from "@/lib/distribution-service";
import { verifiedDireNoteCatalogue } from './direnote-submission-evidence';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { upcFromDireNoteResponse } from './direnote-upc';

type JobRecord = Record<string, unknown>;
const object = (value: unknown): JobRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JobRecord : {};
const cleanText = (value: unknown, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";

function responseBody(log: { responseJson: unknown; responseRaw: string | null }) {
  const parsed = object(log.responseJson);
  if (Object.keys(parsed).length) return parsed;
  try { return object(JSON.parse(log.responseRaw || "{}")); } catch { return {}; }
}

async function recoverJobReference(attempt: { id: number; releaseId: number; responseRedacted: unknown; providerReference: string | null; idempotencyKey: string; payloadRedacted?: unknown }) {
  const stored = object(attempt.responseRedacted);
  const storedJobId = cleanText(stored.ingestJobId ?? stored.job_id, 200);
  const storedKey = cleanText(stored.providerIdempotencyKey ?? stored.idempotency_key, 200);
  if (storedJobId || storedKey) return { jobId: storedJobId || null, idempotencyKey: storedKey || null, stored };

  // Backfill jobs accepted before HYMN began storing their job_id on the attempt.
  const logs = await prisma.direNoteLog.findMany({
    where: { releaseId: attempt.releaseId, action: { in: ["release_submission", "retry_submission"] }, success: true, httpStatus: 202,
      OR:[{requestPayloadRedacted:{path:['idempotency_key'],equals:attempt.idempotencyKey}},{responseJson:{path:['idempotency_key'],equals:attempt.idempotencyKey}}] },
    orderBy: { id: "desc" }, take: 5, select: { responseJson: true, responseRaw: true, requestPayloadRedacted:true }
  });
  for (const log of logs) {
    const body = responseBody(log);
    const jobId = cleanText(body.job_id ?? body.jobId, 200);
    const idempotencyKey = cleanText(body.idempotency_key ?? body.idempotencyKey, 200);
    if(idempotencyKey && idempotencyKey!==attempt.idempotencyKey)continue;
    if(idempotencyKey!==attempt.idempotencyKey && object(log.requestPayloadRedacted).idempotency_key!==attempt.idempotencyKey)continue;
    if (!jobId && !idempotencyKey) continue;
    const responseRedacted = { ...stored, ingestJobId: jobId || null, providerIdempotencyKey: idempotencyKey || null, ingestJobStatus: cleanText(body.status, 30) || "queued", pollAfterSeconds: Number(body.poll_after_seconds) || 60 };
    await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { providerReference: attempt.providerReference || jobId || null, providerStatus: "queued", responseRedacted: responseRedacted as never } });
    return { jobId: jobId || null, idempotencyKey: idempotencyKey || null, stored: responseRedacted };
  }
  if(object(attempt.payloadRedacted).idempotency_key===attempt.idempotencyKey)return {jobId:null,idempotencyKey:attempt.idempotencyKey,stored};
  return { jobId: null, idempotencyKey: null, stored };
}

// Share the release-status lease: a poll, status sync and corrected submission
// must not replace one another's identifiers across app instances.
async function acquireJobLease(releaseId:number,runId:string){
  return prisma.$transaction(async tx=>{
    const lock=await tx.$queryRaw<Array<{locked:boolean}>>`SELECT pg_try_advisory_xact_lock(81422028, ${releaseId}::integer) AS locked`;
    if(!lock[0]?.locked)return false;
    const key=`direnote-release-sync:${releaseId}`;
    const rows=await tx.$queryRaw<Array<{run_id:string}>>`INSERT INTO cron_leases (lease_key,run_id,leased_until,updated_at)
      VALUES (${key},${runId},NOW()+INTERVAL '5 minutes',NOW()) ON CONFLICT(lease_key) DO UPDATE
      SET run_id=EXCLUDED.run_id,leased_until=EXCLUDED.leased_until,updated_at=NOW()
      WHERE cron_leases.leased_until<NOW() RETURNING run_id`;
    return rows[0]?.run_id===runId;
  },{timeout:10000,maxWait:5000});
}

async function recordPollFailure(attempt: { id: number; releaseId: number }, previous: JobRecord, message: string) {
  const safe = String(redactDireNoteDiagnostic(message)).slice(0, 500);
  await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { lastCheckedAt: new Date(), safeError: safe, responseRedacted: { ...previous, lastPollError: safe, lastPolledAt: new Date().toISOString() } as never } });
  await logDistributionEvent({ releaseId: attempt.releaseId, action: "ingest_status", errors: [safe], success: false });
}

export async function pollDireNoteIngestJobs(options: { limit?: number; releaseId?: number } = {}) {
  const now = new Date();
  // Filter terminal receipts before LIMIT. Completed jobs whose later lifecycle
  // status is 'processing' must not starve genuine queued jobs as volume grows.
  const candidateIds=await prisma.$queryRaw<Array<{id:number}>>(Prisma.sql`
    SELECT a.id FROM distribution_submission_attempts a JOIN releases r ON r.id=a.release_id
    WHERE a.provider='direnote' AND a.is_current=true AND a.state='submitted'
      AND a.provider_status IN ('queued','processing') AND r.archived_at IS NULL
      AND COALESCE(a.response_redacted->>'ingestJobStatus','')<>'completed'
      AND (a.last_checked_at IS NULL OR a.last_checked_at<=${new Date(now.getTime()-60000)})
      ${options.releaseId?Prisma.sql`AND a.release_id=${options.releaseId}`:Prisma.empty}
    ORDER BY a.last_checked_at ASC NULLS FIRST,a.started_at ASC,a.id ASC LIMIT 50`);
  const candidates = await prisma.distributionSubmissionAttempt.findMany({
    where: {
      id:{in:candidateIds.map(row=>row.id)},
      provider: "direnote", isCurrent: true, state: "submitted", providerStatus: { in: ["queued", "processing"] }, release: { archivedAt: null },
      ...(options.releaseId ? { releaseId: options.releaseId } : {}),
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: new Date(now.getTime() - 60_000) } }]
    },
    include: { release: { select: { id: true, title: true, status: true, upc: true, releaseDate: true, metadata: true, tracks: { orderBy: { trackNumber: "asc" }, select: { id: true, title: true, trackNumber: true, isrc: true } } } } },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }, { startedAt: "asc" }, { id: "asc" }],
    // Look ahead so accepted jobs with no recoverable reference can be
    // quarantined without starving later jobs in the queue.
    take: 50
  });
  let checked = 0, queued = 0, processing = 0, completed = 0, failed = 0, errorCount = 0;
  let retryAfterSeconds = 0;
  const maxProviderCalls = Math.max(1, Math.min(options.limit ?? 1, 10));
  const results: Array<{ releaseId: number; state: string; progress?: string; error?: string }> = [];

  for (const attempt of candidates) {
    if (checked >= maxProviderCalls) break;
    if (attempt.responseRedacted && (attempt.responseRedacted as JobRecord).ingestJobStatus === "completed") continue;
    const runId=randomUUID(),leaseKey=`direnote-release-sync:${attempt.releaseId}`;
    if(!await acquireJobLease(attempt.releaseId,runId)){results.push({releaseId:attempt.releaseId,state:'deferred'});continue;}
    try {
    const latest=await prisma.distributionSubmissionAttempt.findFirst({where:{id:attempt.id,isCurrent:true,state:'submitted'},select:{id:true,responseRedacted:true}});
    if(!latest || object(latest.responseRedacted).ingestJobStatus==='completed')continue;
    const reference = await recoverJobReference(attempt);
    if (!reference.jobId && !reference.idempotencyKey) {
      if (verifiedDireNoteCatalogue(attempt, attempt.release)) {
        await prisma.distributionSubmissionAttempt.updateMany({ where: { id:attempt.id, state:'submitted', isCurrent:true }, data: { providerStatus:'catalogue_confirmed', lastCheckedAt:new Date(), safeError:null } });
        results.push({ releaseId:attempt.releaseId, state:'catalogue_confirmed', progress:'Verified catalogue delivery; track lifecycle by UPC rather than ingest job.' });
        continue;
      }
      await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { state: "reconciliation_required", lastCheckedAt: new Date(), safeError: "DireNote accepted this job, but no job_id or idempotency key was recorded. Manual provider reconciliation is required." } });
      await createReleaseAuditLog({ releaseId: attempt.releaseId, action: "DIRENOTE_INGEST_JOB_REFERENCE_MISSING", details: { attemptId: attempt.id } });
      errorCount++;
      results.push({ releaseId: attempt.releaseId, state: "reconciliation_required", error: "Accepted job has no usable status reference." });
      continue;
    }
    try {
      await reserveDireNoteRequest("ingest_status", attempt.releaseId);
      checked++;
      const response = await getDireNoteIngestStatus({ jobId: reference.jobId, idempotencyKey: reference.idempotencyKey }, { timeoutMs: 20_000 });
      await enforceDireNoteResponseLimit(response, attempt.releaseId);
      const body = object(response.data);
      const responseJobId = cleanText(body.job_id ?? body.jobId, 200);
      // A documented terminal job failure includes an error string even though
      // the status lookup itself succeeded. The generic transport parser marks
      // error-bearing bodies unsuccessful; require exact job identity here.
      const confirmedFailure = response.httpStatus === 200 && body.success === true && cleanText(body.status, 30).toLowerCase() === 'failed' && (reference.jobId ? responseJobId === reference.jobId : cleanText(body.idempotency_key, 200) === reference.idempotencyKey);
      if ((!response.success && !confirmedFailure) || body.success !== true) throw new Error(response.error || cleanText(body.error) || "DireNote job status was not confirmed.");
      if (reference.jobId && responseJobId && responseJobId !== reference.jobId) throw new Error("DireNote returned a different job ID than the accepted submission.");
      const responseKey=cleanText(body.idempotency_key ?? body.idempotencyKey,200);
      if(responseKey && reference.idempotencyKey && responseKey!==reference.idempotencyKey)throw Error('DireNote returned a different idempotency key than the accepted submission.');
      if(!(reference.jobId && responseJobId===reference.jobId) && !(reference.idempotencyKey && responseKey===reference.idempotencyKey))throw Error('DireNote did not confirm the accepted submission identity.');
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

      if (status === "completed" && attempt.responseRedacted && (attempt.responseRedacted as JobRecord).ingestJobStatus === "completed") {
        // The ingest result is already validated and persisted. Once ingest
        // completes, use the UPC status endpoint as a separate lifecycle
        // reconciliation signal; never poll the completed ingest as if it
        // were still running.
        await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { providerStatus: "completed", lastCheckedAt: checkedAt, safeError: null } });
        completed++;
        results.push({ releaseId: attempt.releaseId, state: "completed", progress: "Ingest completed; release status is tracked separately." });
        continue;
      }

      if (status === "failed") {
        const failure = cleanText(object(body.error).message ?? body.error, 500) || "DireNote could not finish processing the ingest job.";
        const canResubmit = body.can_resubmit === true;
        const isAmendment = Number(object(reference.stored).amendmentRequestId) > 0;
        const responseRedacted = { ...jobMetadata, canResubmit, error: failure };
        await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { state: canResubmit ? "retryable" : "failed", isCurrent: false, providerStatus: "failed", lastCheckedAt: checkedAt, safeError: failure, responseRedacted: responseRedacted as never, completedAt: checkedAt } });
        if (isAmendment) { await failArtistAmendment(Number(object(reference.stored).amendmentRequestId), attempt.id); await flagAmendmentManualQc(Number(object(reference.stored).amendmentRequestId), failure); }
        else await updateDetailedReleaseStatus(attempt.releaseId, "delivery_failed", `DireNote ingest job failed: ${failure}`);
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
      const usedTracks = new Set<typeof parsed.trackIsrcs[number]>();
      const mappedTracks = attempt.release.tracks.map(track => {
        const remote = parsed.trackIsrcs.find(item => item.trackNumber === track.trackNumber || item.trackTitle?.trim().toLowerCase() === track.title.trim().toLowerCase());
        const duplicate = remote && usedTracks.has(remote);
        if (remote) usedTracks.add(remote);
        const replacement = 'identifierPolicy' in reference.stored && reference.stored.identifierPolicy === 'replace';
        return { id: track.id, title: track.title, trackNumber: track.trackNumber, isrc: duplicate ? null : remote?.isrc ?? (replacement ? null : track.isrc ?? null) };
      });
      const invalidIdentity = !upc || upcFromDireNoteResponse(result)!==upc || !validReleaseBarcode(upc) || albumName && albumName !== expectedTitle || trackCount !== attempt.release.tracks.length || parsed.trackIsrcs.length !== attempt.release.tracks.length || new Set(mappedTracks.map(track=>track.isrc)).size!==mappedTracks.length || mappedTracks.some(track => !track.isrc || !validIsrc(track.isrc));
      const safeResult = { upc: upc ?? null, albumName: cleanText(result.album_name ?? result.albumname, 300) || null, trackCount, releaseDate: cleanText(result.release_date, 30) || null, distributorReleaseId: parsed.distributorReleaseId ?? null, tracks: parsed.trackIsrcs, artists: parsed.artists, songwriters: parsed.songwriters, warnings: parsed.warnings };
      if (invalidIdentity) {
        const reason = "DireNote completed the ingest job, but its release identifiers or metadata did not match HYMN's release. Review the stored job result before syncing.";
        const identifierRecoveryAttempts=Number(object(reference.stored).identifierRecoveryAttempts||0)+1;
        const retryIdentifiers=identifierRecoveryAttempts<3;
        await prisma.distributionSubmissionAttempt.updateMany({ where: { id: attempt.id, state: "submitted", isCurrent: true }, data: { state: retryIdentifiers?'submitted':"reconciliation_required", providerStatus: retryIdentifiers?'processing':"completed", lastCheckedAt: checkedAt, safeError: reason, responseRedacted: { ...jobMetadata, ingestJobStatus:retryIdentifiers?'awaiting_identifiers':'completed',identifierRecoveryAttempts,result: safeResult } as never } });
        await createReleaseAuditLog({ releaseId: attempt.releaseId, action: "DIRENOTE_INGEST_JOB_RECONCILIATION_REQUIRED", details: { attemptId: attempt.id, hasUpc: Boolean(upc), trackCount, expectedTrackCount: attempt.release.tracks.length, albumName: safeResult.albumName } });
        if (Number(object(reference.stored).amendmentRequestId) > 0) await flagAmendmentManualQc(Number(object(reference.stored).amendmentRequestId), reason);
        errorCount++;
        results.push({ releaseId: attempt.releaseId, state: retryIdentifiers?'identifier_retry':"reconciliation_required", error: reason });
        continue;
      }

      const completedData = { ...jobMetadata, ingestJobStatus: "completed", result: safeResult };
      // The completed ingest result itself is authoritative provider evidence.
      // Keep it distinct from a later catalog/status lookup; a correction
      // resubmission can legitimately receive a new UPC and track ISRCs.
      await activateDireNoteAttempt(attempt.id, { upc: upc!, providerStatus: "processing", trackIdentifiers: mappedTracks as never, responseRedacted: completedData as never }, { replaceIdentifiers: "identifierPolicy" in reference.stored && reference.stored.identifierPolicy === "replace" });
      // Bind async-ingestion identities to the already attached cards so the
      // normal artist refresh can verify/fill their stored store mappings.
      if (Number(object(reference.stored).amendmentRequestId) > 0) await recordAmendmentQcPassed(Number(object(reference.stored).amendmentRequestId), attempt.id);
      await persistDireNoteArtistIds(attempt.releaseId, parsed.artists, attempt.id);
      if (attempt.release.status === "SUBMITTING_TO_DISTRIBUTOR") await updateDetailedReleaseStatus(attempt.releaseId, "sent_to_distributor", "DireNote completed the accepted ingest job.");
      const currentRelease = await prisma.release.findUniqueOrThrow({ where: { id: attempt.releaseId } });
      const priorMetadata = object(currentRelease.metadata);
      await prisma.release.update({ where: { id: attempt.releaseId }, data: { metadata: { ...priorMetadata, direnoteAccepted: true, direnoteAcceptedAt: checkedAt.toISOString(), direnoteStatus: "accepted", direnoteResponse: safeResult, latestStatusSyncAt: checkedAt.toISOString() } } });
      await markReleaseDistributionSuccess({ releaseId: attempt.releaseId, notify: !(Number(object(reference.stored).amendmentRequestId) > 0), status: statusAfterDireNoteAcceptance({ releaseDate: attempt.release.releaseDate.toISOString(), releaseTiming: String(object(attempt.release.metadata).releaseTiming ?? "quick_release") }), distributorReleaseId: parsed.distributorReleaseId, upc: upc!, trackIsrcs: parsed.trackIsrcs, responsePayload: safeResult, warnings: parsed.warnings });
      await finishDistributionSubmission(attempt.id, { state: "submitted", providerStatus: "completed", safeError: null, httpStatus: response.httpStatus, providerReference: parsed.distributorReleaseId ?? upc ?? attempt.providerReference, responseRedacted: completedData as never });
      await logDistributionEvent({ releaseId: attempt.releaseId, action: "ingest_status", httpStatus: response.httpStatus, responsePayload: { job_id: responseJobId || reference.jobId, status, result: safeResult }, success: true });
      await createReleaseAuditLog({ releaseId: attempt.releaseId, action: "DIRENOTE_INGEST_JOB_COMPLETED", details: { attemptId: attempt.id, jobId: reference.jobId ?? responseJobId, upc, trackCount } });
      completed++;
      results.push({ releaseId: attempt.releaseId, state: "completed" });
    } catch (error) {
      if (isDireNoteRateLimit(error)) { retryAfterSeconds = error.retryAfterSeconds; break; }
      const message = error instanceof Error ? error.message : "DireNote job status polling failed.";
      await recordPollFailure(attempt, reference.stored, message);
      errorCount++;
      results.push({ releaseId: attempt.releaseId, state: "poll_error", error: String(redactDireNoteDiagnostic(message)).slice(0, 300) });
    }
    } finally {
      await prisma.$executeRaw`UPDATE cron_leases SET leased_until=NOW(),updated_at=NOW() WHERE lease_key=${leaseKey} AND run_id=${runId}`;
    }
  }
  return { checked, queued, processing, completed, failed, errorCount, rateLimited: retryAfterSeconds > 0, retryAfterSeconds, deferred: Math.max(0, candidates.length - results.length), results };
}
