import {
  buildDireNotePayload,
  parseDireNoteResponse,
  redactDireNotePayload,
  redactDireNoteDiagnostic,
  submitToDireNote,
  validateDireNotePayload,
  type DireNotePayload
} from "@/lib/direnote";
import {
  createReleaseAuditLog,
  getDetailedReleaseById,
  logDistributionEvent,
  markReleaseDistributionSuccess,
  transitionDistributionQueueEntry,
  listDistributionQueueEntries,
  updateDetailedReleaseStatus
} from "@/lib/distribution-db";
import { createNotification, findUserById, listArtistProfilesByUser } from "@/lib/db";
import type { Release } from "@/lib/types";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";
import { getDireNoteConfig } from "@/lib/direnote/direnote-config";
import { claimDistributionSubmission, finishDistributionSubmission } from "@/lib/distribution-idempotency";
import { reserveDireNoteRequest } from "@/lib/direnote-rate-limit";
import { createDistributorAssetUrl } from "@/lib/distributor-asset-delivery";

export type DistributionValidationIssue = {
  field: string;
  message: string;
};

export type DistributorPayload = DireNotePayload;

function displayName(release: Release) {
  return release.releaseTitle || release.trackName || "Untitled release";
}

async function notifyRelease(release: Release | null, input: { title: string; body: string; priority?: "low" | "normal" | "high"; eventKey?: string; metadata?: Record<string, unknown> }) {
  if (!release) return;
  await createNotification({
    userId: release.userId,
    title: input.title,
    body: input.body,
    type: "release",
    href: `/dashboard/releases?releaseId=${release.id}`,
    actionLabel: "View release",
    priority: input.priority ?? "normal",
    eventKey: input.eventKey,
    metadata: { releaseId: release.id, ...(input.metadata ?? {}) }
  });
}

async function moveQueue(releaseId: number, nextStage: "sent_to_direnote" | "processing" | "rejected", actorId?: number | null, notes?: string, metadata?: Record<string, unknown>) {
  const entry = (await listDistributionQueueEntries()).find((item) => item.releaseId === releaseId);
  if (!entry) return null;
  try {
    return transitionDistributionQueueEntry({ entryId: entry.id, nextStage, operatorId: actorId ?? null, notes: notes ?? null, metadata });
  } catch {
    return null;
  }
}

function validationResult(payload: DireNotePayload, options: { adminConfirmedExistingArtists?: boolean } = {}) {
  const result = validateDireNotePayload(payload, options);
  const config = getDireNoteConfig();
  if (!config.endpoint) result.issues.unshift({ field: "endpoint", message: "DireNote endpoint is not configured.", severity: "error" });
  return {
    ok: result.ok,
    issues: result.issues as DistributionValidationIssue[],
    warnings: result.warnings as DistributionValidationIssue[]
  };
}

export async function buildDireNotePayloadForRelease(release: Release, options: { siteUrl?: string; adminConfirmedExistingArtists?: boolean } = {}) {
  const [owner, artistProfiles, artworkUrl, tracks] = await Promise.all([
    findUserById(release.userId),
    listArtistProfilesByUser(release.userId),
    createDistributorAssetUrl(release.artworkUrl, options.siteUrl),
    Promise.all((release.tracks ?? []).map(async (track) => ({ ...track, audioUrl: await createDistributorAssetUrl(track.audioUrl, options.siteUrl) }))),
  ]);

  return buildDireNotePayload({ ...release, artworkUrl, tracks }, {
    siteUrl: options.siteUrl,
    ownerEmail: owner?.email ?? null,
    artistProfiles,
    adminConfirmedExistingArtists: options.adminConfirmedExistingArtists
  });
}

export async function validateRelease(release: Release, options: { siteUrl?: string; adminConfirmedExistingArtists?: boolean } = {}) {
  const payload = await buildDireNotePayloadForRelease(release, options);
  return validationResult(payload, options);
}

export function buildDistributorPayload(release: Release, options: { siteUrl?: string } = {}): DistributorPayload {
  return buildDireNotePayload(release, { siteUrl: options.siteUrl });
}

function retryCountFromRelease(release: Release) {
  const value = (release as any).direnoteRetryCount ?? (release as any).distributionRetryCount ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function httpErrorMode(status: number) {
  if (status === 400) return { retryable: false, releaseStatus: "changes_requested" as const, queueStage: "rejected" as const, action: "DIRENOTE_VALIDATION_REJECTED" };
  if (status === 401) return { retryable: false, releaseStatus: "delivery_failed" as const, queueStage: "rejected" as const, action: "DIRENOTE_CREDENTIAL_ERROR" };
  if (status === 405) return { retryable: false, releaseStatus: "delivery_failed" as const, queueStage: "rejected" as const, action: "DIRENOTE_METHOD_ERROR" };
  if (status === 429 || status >= 500) return { retryable: true, releaseStatus: "queued_for_distribution" as const, queueStage: null, action: "DIRENOTE_RETRYABLE_ERROR" };
  return { retryable: false, releaseStatus: "delivery_failed" as const, queueStage: "rejected" as const, action: "DIRENOTE_FAILED" };
}

export async function submitRelease(releaseId: number, options: { actorId?: number | null; siteUrl?: string; retry?: boolean; adminConfirmedExistingArtists?: boolean } = {}) {
  const release = await getDetailedReleaseById(releaseId);
  if (!release) throw new Error("Release not found.");

  await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: options.retry ? "DIRENOTE_RETRY_STARTED" : "APPROVE_RELEASE_STARTED" });

  const payload = await buildDireNotePayloadForRelease(release, options);
  const validation = validationResult(payload, options);
  const redactedPayload = redactDireNotePayload(payload);

  console.info("[DireNote] Final rights lines", {
    releaseId,
    cLine: redactedPayload.cLine,
    pLine: redactedPayload.pLine
  });

  if (!validation.ok) {
    await updateDetailedReleaseStatus(releaseId, "changes_requested", "DireNote validation failed.");
    await logDistributionEvent({
      releaseId,
      requestPayload: redactedPayload,
      responsePayload: null,
      warnings: validation.warnings.map((warning) => warning.message),
      errors: validation.issues.map((issue) => issue.message),
      success: false
    });
    await moveQueue(releaseId, "rejected", options.actorId, "DireNote validation failed.", { issues: validation.issues, warnings: validation.warnings });
    await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: "DIRENOTE_VALIDATION_FAILED", details: { issues: validation.issues, warnings: validation.warnings } });
    await createAdminTaskOnce({ eventKey: `release:${releaseId}:direnote:validation`, type: "DireNote Failed", priority: "high", title: `DireNote validation failed: ${displayName(release)}`, body: validation.issues[0]?.message ?? "Release needs corrections before DireNote submission.", href: `/admin?tab=releases&releaseId=${releaseId}`, entityType: "release", entityId: releaseId });
    await notifyRelease(release, {
      title: `DireNote validation failed: ${displayName(release)}`,
      body: validation.issues[0]?.message ?? "HYMN needs corrections before this release can be submitted to DireNote.",
      priority: "high",
      eventKey: `release:${release.id}:direnote:validation-failed`,
      metadata: { issues: validation.issues }
    });
    return { release: await getDetailedReleaseById(releaseId), validation, submitted: false, retryable: false, payload: redactedPayload };
  }

  const claim = await claimDistributionSubmission(releaseId, payload);
  if (claim.alreadySubmitted) return { release, validation, submitted: true, duplicate: true, retryable: false };
  if (!claim.claimed) return {
    release,
    validation,
    submitted: false,
    duplicate: true,
    retryable: true,
    retryAfterSeconds: claim.retryAfterSeconds,
    error: claim.retryAfterSeconds
      ? `DireNote submission is cooling down. Try again in ${Math.ceil(claim.retryAfterSeconds / 60)} minute${Math.ceil(claim.retryAfterSeconds / 60) === 1 ? "" : "s"}.`
      : "An identical DireNote submission is already processing.",
  };

  await updateDetailedReleaseStatus(releaseId, "queued_for_distribution", "Validated and queued for DireNote API.");
  await updateDetailedReleaseStatus(releaseId, "submitting_to_distributor", "DireNote submission claimed and started.");

  try {
    await reserveDireNoteRequest("content_ingestion", releaseId, options.actorId);
    const response = await submitToDireNote(payload);
    const data = response.data ?? (response.error ? { error: response.error } : {});
    if (!response.success) {
      const status = response.httpStatus ?? 503;
      const mode = httpErrorMode(status);
      const parsed = parseDireNoteResponse(data);
      const message = response.error || parsed.message || `DireNote API returned ${status}.`;
      console.error("[DireNote] Provider rejected submission", { releaseId, httpStatus: response.httpStatus, message, response: redactDireNoteDiagnostic(data) });
      await updateDetailedReleaseStatus(releaseId, mode.releaseStatus, message);
      await finishDistributionSubmission(claim.attempt.id, { state: mode.retryable ? "retryable" : "failed", httpStatus: response.httpStatus, safeError: message.slice(0, 500), responseRedacted: { message, warnings: parsed.warnings } });
      await logDistributionEvent({ releaseId, action: options.retry ? "retry_submission" : "release_submission", httpStatus: response.httpStatus, createdByAdminId: options.actorId, requestPayload: redactedPayload, responsePayload: data, responseRaw: response.raw, warnings: parsed.warnings, errors: [message], success: false });
      if (mode.queueStage) await moveQueue(releaseId, mode.queueStage, options.actorId, message, { status: response.httpStatus, response: data });
      await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: mode.action, details: { status: response.httpStatus, message } });
      if (response.httpStatus === 400) {
        await notifyRelease(release, {
          title: `DireNote needs fixes: ${displayName(release)}`,
          body: message,
          priority: "high",
          eventKey: `release:${release.id}:direnote:http-400`,
          metadata: { status: response.httpStatus }
        });
      }
      return { release: await getDetailedReleaseById(releaseId), validation, submitted: false, retryable: mode.retryable, retryCount: retryCountFromRelease(release) + 1, error: message, direnoteResponse: data };
    }

    const parsed = parseDireNoteResponse(data);
    const automaticStatus = "sent_to_distributor" as const;
    const updatedRelease = await markReleaseDistributionSuccess({
      releaseId,
      status: automaticStatus,
      distributorReleaseId: parsed.distributorReleaseId,
      upc: parsed.upc,
      trackIsrcs: parsed.trackIsrcs,
      responsePayload: data,
      warnings: parsed.warnings
    });

    await logDistributionEvent({ releaseId, action: options.retry ? "retry_submission" : "release_submission", httpStatus: response.httpStatus, createdByAdminId: options.actorId, requestPayload: redactedPayload, responsePayload: data, responseRaw: response.raw, warnings: parsed.warnings, success: true });
    await moveQueue(releaseId, "sent_to_direnote", options.actorId, "Release sent to DireNote.", { direnoteResponse: data, warnings: parsed.warnings });
    await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: "DIRENOTE_ACCEPTED", details: { status: automaticStatus, upc: parsed.upc, warnings: parsed.warnings } });
    await resolveAdminTask(`release:${releaseId}:direnote:validation`, "DireNote submission accepted.");
    await resolveAdminTask(`release:${releaseId}:direnote:network`, "DireNote submission accepted.");
    await notifyRelease(updatedRelease ?? release, {
      title: `Release sent to DireNote: ${displayName(updatedRelease ?? release)}`,
      body: "Your release has cleared HYMN review and has been submitted to DireNote for distribution.",
      eventKey: `release:${releaseId}:status:sent_to_direnote`,
      metadata: { upc: parsed.upc ?? null, warnings: parsed.warnings }
    });
    await finishDistributionSubmission(claim.attempt.id, { state: "submitted", httpStatus: response.httpStatus, providerReference: parsed.distributorReleaseId ?? parsed.upc ?? null, responseRedacted: { distributorReleaseId: parsed.distributorReleaseId ?? null, upc: parsed.upc ?? null, trackIsrcs: parsed.trackIsrcs, warnings: parsed.warnings } });
    await notifyRelease(updatedRelease ?? release, {
      title: `Release processing: ${displayName(updatedRelease ?? release)}`,
      body: "Your release has cleared distribution submission. Platform availability may still take time depending on DSP processing.",
      eventKey: `release:${releaseId}:status:processing`
    });
    if (parsed.upc) {
      await notifyRelease(updatedRelease ?? release, {
        title: `UPC generated: ${displayName(updatedRelease ?? release)}`,
        body: `DireNote returned UPC ${parsed.upc}.`,
        eventKey: `release:${releaseId}:upc:${parsed.upc}`,
        metadata: { upc: parsed.upc }
      });
    }
    for (const track of parsed.trackIsrcs.filter((item) => item.isrc)) {
      await notifyRelease(updatedRelease ?? release, {
        title: `ISRC generated: ${track.trackTitle ?? displayName(updatedRelease ?? release)}`,
        body: `DireNote returned ISRC ${track.isrc}.`,
        eventKey: `release:${releaseId}:isrc:${track.isrc}`,
        metadata: { isrc: track.isrc, trackTitle: track.trackTitle ?? null }
      });
    }
    return { release: updatedRelease, validation, submitted: true, retryable: false, warnings: parsed.warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "DireNote submission failed.";
    console.error("[DireNote] Submission pipeline failed", { releaseId, message });
    await updateDetailedReleaseStatus(releaseId, "queued_for_distribution", message);
    await finishDistributionSubmission(claim.attempt.id, { state: "retryable", safeError: message.slice(0, 500) });
    await logDistributionEvent({ releaseId, requestPayload: redactedPayload, responsePayload: null, errors: [message], success: false });
    await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: "DIRENOTE_NETWORK_ERROR", details: { message } });
    await createAdminTaskOnce({ eventKey: `release:${releaseId}:direnote:network`, type: "DireNote Failed", priority: "critical", title: `DireNote submission failed: ${displayName(release)}`, body: message, href: `/admin?tab=releases&releaseId=${releaseId}`, entityType: "release", entityId: releaseId });
    return { release: await getDetailedReleaseById(releaseId), validation, submitted: false, retryable: true, retryCount: retryCountFromRelease(release) + 1, error: message };
  }
}

export async function retrySubmission(releaseId: number, options: { actorId?: number | null; siteUrl?: string } = {}) {
  return submitRelease(releaseId, { ...options, retry: true });
}

export const DistributionService = {
  validateRelease,
  buildDistributorPayload,
  buildDireNotePayloadForRelease,
  submitRelease,
  retrySubmission,
  logDistributionEvent
};

// vercel trigger
// vercel trigger 8
// vercel trigger 9

// vercel trigger 12

// vercel trigger 14
