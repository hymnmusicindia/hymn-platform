import {
  buildDireNotePayload,
  parseDireNoteResponse,
  redactDireNotePayload,
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
import { statusAfterDireNoteAcceptance } from "@/lib/release-status-engine";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";

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
  return {
    ok: result.ok,
    issues: result.issues as DistributionValidationIssue[],
    warnings: result.warnings as DistributionValidationIssue[]
  };
}

export async function buildDireNotePayloadForRelease(release: Release, options: { siteUrl?: string; adminConfirmedExistingArtists?: boolean } = {}) {
  const [owner, artistProfiles] = await Promise.all([
    findUserById(release.userId),
    listArtistProfilesByUser(release.userId)
  ]);

  return buildDireNotePayload(release, {
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
  if (status === 401) return { retryable: false, releaseStatus: "failed" as const, queueStage: "rejected" as const, action: "DIRENOTE_CREDENTIAL_ERROR" };
  if (status === 405) return { retryable: false, releaseStatus: "failed" as const, queueStage: "rejected" as const, action: "DIRENOTE_METHOD_ERROR" };
  if (status === 429 || status >= 500) return { retryable: true, releaseStatus: "queued_for_distribution" as const, queueStage: null, action: "DIRENOTE_RETRYABLE_ERROR" };
  return { retryable: false, releaseStatus: "failed" as const, queueStage: "rejected" as const, action: "DIRENOTE_FAILED" };
}

export async function submitRelease(releaseId: number, options: { actorId?: number | null; siteUrl?: string; retry?: boolean; adminConfirmedExistingArtists?: boolean } = {}) {
  const release = await getDetailedReleaseById(releaseId);
  if (!release) throw new Error("Release not found.");

  await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: options.retry ? "DIRENOTE_RETRY_STARTED" : "APPROVE_RELEASE_STARTED" });

  const payload = await buildDireNotePayloadForRelease(release, options);
  const validation = validationResult(payload, options);
  const redactedPayload = redactDireNotePayload(payload);

  console.log("======= DIRENOTE PAYLOAD BEING GENERATED =======");
  console.log(JSON.stringify(payload, null, 2));
  console.log("======= INTERNAL VALIDATION RESULT =======");
  console.log(JSON.stringify(validation, null, 2));
  console.log("================================================");

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

  await updateDetailedReleaseStatus(releaseId, "queued_for_distribution", "Validated and queued for DireNote API.");

  try {
    const response = await submitToDireNote(payload);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const mode = httpErrorMode(response.status);
      const parsed = parseDireNoteResponse(data);
      const message = parsed.message || `DireNote API returned ${response.status}.`;
      await updateDetailedReleaseStatus(releaseId, mode.releaseStatus, message);
      await logDistributionEvent({ releaseId, requestPayload: redactedPayload, responsePayload: data, warnings: parsed.warnings, errors: [`HTTP ${response.status}: ${message}`], success: false });
      if (mode.queueStage) await moveQueue(releaseId, mode.queueStage, options.actorId, message, { status: response.status, response: data });
      await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: mode.action, details: { status: response.status, message } });
      if (response.status === 400) {
        await notifyRelease(release, {
          title: `DireNote needs fixes: ${displayName(release)}`,
          body: message,
          priority: "high",
          eventKey: `release:${release.id}:direnote:http-400`,
          metadata: { status: response.status }
        });
      }
      return { release: await getDetailedReleaseById(releaseId), validation, submitted: false, retryable: mode.retryable, retryCount: retryCountFromRelease(release) + 1 };
    }

    const parsed = parseDireNoteResponse(data);
    const automaticStatus = statusAfterDireNoteAcceptance(release);
    const updatedRelease = await markReleaseDistributionSuccess({
      releaseId,
      status: automaticStatus,
      distributorReleaseId: null,
      upc: parsed.upc,
      trackIsrcs: parsed.trackIsrcs,
      responsePayload: data,
      warnings: parsed.warnings
    });

    await logDistributionEvent({ releaseId, requestPayload: redactedPayload, responsePayload: data, warnings: parsed.warnings, success: true });
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
    if (automaticStatus === "scheduled") {
      await notifyRelease(updatedRelease ?? release, {
        title: `Release scheduled: ${displayName(updatedRelease ?? release)}`,
        body: `Your release has been accepted for distribution and is scheduled for ${release.releaseDate}.`,
        eventKey: `release:${releaseId}:status:scheduled`,
        metadata: { releaseDate: release.releaseDate }
      });
    } else {
      await notifyRelease(updatedRelease ?? release, {
        title: `Release processing: ${displayName(updatedRelease ?? release)}`,
        body: "Your release has cleared distribution submission. Platform availability may still take time depending on DSP processing.",
        eventKey: `release:${releaseId}:status:processing`
      });
    }
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
    await updateDetailedReleaseStatus(releaseId, "queued_for_distribution", message);
    await logDistributionEvent({ releaseId, requestPayload: redactedPayload, responsePayload: null, errors: [message], success: false });
    await createReleaseAuditLog({ releaseId, userId: options.actorId ?? null, action: "DIRENOTE_NETWORK_ERROR", details: { message } });
    await createAdminTaskOnce({ eventKey: `release:${releaseId}:direnote:network`, type: "DireNote Failed", priority: "critical", title: `DireNote submission failed: ${displayName(release)}`, body: message, href: `/admin?tab=releases&releaseId=${releaseId}`, entityType: "release", entityId: releaseId });
    return { release: await getDetailedReleaseById(releaseId), validation, submitted: false, retryable: true, retryCount: retryCountFromRelease(release) + 1 };
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
