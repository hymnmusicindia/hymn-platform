import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { upcFromDireNoteResponse } from "@/lib/direnote-upc";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function distributionPayloadIdentity(releaseId: number, payload: unknown) {
  const payloadHash = crypto.createHash("sha256").update(canonical(payload)).digest("hex");
  return { payloadHash, idempotencyKey: `direnote:release:${releaseId}:${payloadHash}` };
}

export async function claimDistributionSubmission(releaseId: number, payload: unknown, correctionAttemptId?: number) {
  const identity = distributionPayloadIdentity(releaseId, correctionAttemptId ? { payload, correctionAttemptId } : payload);
  const cooldownMs = 5 * 60 * 1000;
  const latestAttempt = await prisma.distributionSubmissionAttempt.findFirst({
    where: { releaseId, provider: "direnote" },
    orderBy: { startedAt: "desc" },
  });
  // A lost response is not proof of rejection. The provider has no documented
  // ingestion idempotency key, so a new payload hash must not bypass this guard.
  const unresolved = await prisma.distributionSubmissionAttempt.findFirst({ where: { releaseId, provider: "direnote", state: { in: ["processing", "reconciliation_required"] } }, orderBy: { id: "desc" } });
  if (unresolved) return { attempt: unresolved, claimed: false, alreadySubmitted: false, retryAfterSeconds: undefined };
  if (latestAttempt && latestAttempt.startedAt > new Date(Date.now() - cooldownMs)) {
    const retryAfterSeconds = Math.max(1, Math.ceil((latestAttempt.startedAt.getTime() + cooldownMs - Date.now()) / 1000));
    return {
      attempt: latestAttempt,
      claimed: false,
      alreadySubmitted: latestAttempt.state === "submitted" && latestAttempt.idempotencyKey === identity.idempotencyKey,
      retryAfterSeconds,
    };
  }
  let existing = await prisma.distributionSubmissionAttempt.findFirst({ where: { idempotencyKey: identity.idempotencyKey } });
  if (!existing) {
    try {
      const attempt = await prisma.distributionSubmissionAttempt.create({ data: { releaseId, ...identity } });
      return { attempt, claimed: true, alreadySubmitted: false, retryAfterSeconds: undefined };
    } catch (error) {
      existing = await prisma.distributionSubmissionAttempt.findFirst({ where: { idempotencyKey: identity.idempotencyKey } });
      if (!existing) throw error;
    }
  }
  if (existing.state === "submitted") return { attempt: existing, claimed: false, alreadySubmitted: true, retryAfterSeconds: undefined };
  if (existing.attemptCount >= 5 || existing.state !== "retryable") return { attempt: existing, claimed: false, alreadySubmitted: false, retryAfterSeconds: undefined };
  const claimed = await prisma.distributionSubmissionAttempt.updateMany({ where: { id: existing.id, state: { in: ["failed", "retryable"] }, startedAt: existing.startedAt }, data: { state: "processing", attemptCount: { increment: 1 }, safeError: null, startedAt: new Date(), completedAt: null } });
  return { attempt: await prisma.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: existing.id } }), claimed: claimed.count >= 1, alreadySubmitted: false, retryAfterSeconds: undefined };
}

export async function finishDistributionSubmission(id: number, input: { state: "submitted" | "failed" | "retryable" | "reconciliation_required"; httpStatus?: number | null; providerReference?: string | null; safeError?: string | null; responseRedacted?: Prisma.InputJsonValue }) {
  return prisma.distributionSubmissionAttempt.update({ where: { id }, data: { ...input, completedAt: new Date() } });
}

/** Pure read of the canonical provider identity. This function never backfills
 * attempts or mutates identifier projections. */
export async function getCurrentDireNoteAttempt(releaseId: number) {
  return prisma.distributionSubmissionAttempt.findFirst({
    where: { releaseId, provider: "direnote", isCurrent: true },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }]
  });
}

/** Controlled migration/backfill for historic releases. Call only from an
 * explicit reconciliation or correction workflow, never from a display path. */
export async function ensureCurrentDireNoteAttempt(releaseId: number) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422027, ${releaseId}::integer)`;
    const currentCandidates = await tx.distributionSubmissionAttempt.findMany({
      where: { releaseId, provider: "direnote", isCurrent: true },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }]
    });
    const current = currentCandidates[0] ?? null;
    if (currentCandidates.length > 1) {
      const staleIds = currentCandidates.slice(1).map((item) => item.id);
      if (staleIds.length) {
        await tx.distributionSubmissionAttempt.updateMany({
          where: { id: { in: staleIds } },
          data: { isCurrent: false, providerStatus: "superseded" }
        });
      }
    }
    const release = await tx.release.findUniqueOrThrow({ where: { id: releaseId }, include: { tracks: true } });
    if (current) {
      const recoveredUpc = normalizeDireNoteAttemptUpc(current.responseRedacted) ?? normalizeDireNoteAttemptUpc(current.rawStatusPayload) ?? normalizeDireNoteAttemptUpc(release.metadata) ?? release.upc;
      if (recoveredUpc && current.upc !== recoveredUpc) {
        if (release.upc !== recoveredUpc) await tx.release.update({ where: { id: release.id }, data: { upc: recoveredUpc } });
        return tx.distributionSubmissionAttempt.update({ where: { id: current.id }, data: { upc: recoveredUpc } });
      }
      return current;
    }
    const latest = await tx.distributionSubmissionAttempt.findFirst({ where: { releaseId, provider: "direnote", state: "submitted" }, orderBy: { id: "desc" } });
    if (!latest && !release.direNoteStatus && !["SENT_TO_DISTRIBUTOR", "DISTRIBUTOR_PROCESSING", "PROCESSING", "SCHEDULED", "AWAITING_LIVE_CONFIRMATION", "PARTIALLY_LIVE", "DELIVERED", "LIVE"].includes(release.status)) throw new Error("This release has no submitted DireNote attempt to synchronize.");
    const snapshot = release.tracks.map(track => ({ id: track.id, title: track.title, trackNumber: track.trackNumber, isrc: track.isrc }));
    const data = { isCurrent: true, upc: normalizeDireNoteAttemptUpc(latest?.responseRedacted) ?? normalizeDireNoteAttemptUpc(latest?.rawStatusPayload) ?? normalizeDireNoteAttemptUpc(release.metadata) ?? release.upc, trackIdentifiers: snapshot, providerStatus: release.direNoteStatus };
    if (latest) return tx.distributionSubmissionAttempt.update({ where: { id: latest.id }, data });
    return tx.distributionSubmissionAttempt.create({ data: { releaseId, ...data, state: "submitted", idempotencyKey: `direnote:legacy:${releaseId}`, payloadHash: "legacy-backfill", completedAt: release.createdAt } });
  });
}

/** Repairs duplicate current rows deterministically without creating a new
 * provider attempt. Kept separate so operational repairs are explicit. */
export async function repairDireNoteAttemptLineage(releaseId: number) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422027, ${releaseId}::integer)`;
    const rows = await tx.distributionSubmissionAttempt.findMany({ where: { releaseId, provider: "direnote", isCurrent: true }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] });
    const staleIds = rows.slice(1).map(row => row.id);
    if (staleIds.length) await tx.distributionSubmissionAttempt.updateMany({ where: { id: { in: staleIds } }, data: { isCurrent: false, providerStatus: "superseded" } });
    return { currentAttemptId: rows[0]?.id ?? null, supersededAttemptIds: staleIds };
  });
}

function normalizeDireNoteAttemptUpc(value: unknown) {
  return upcFromDireNoteResponse(value);
}

export async function activateDireNoteAttempt(id: number, input: { upc: string | null; trackIdentifiers: Prisma.InputJsonValue; responseRedacted: Prisma.InputJsonValue }) {
  return prisma.$transaction(async tx => {
    const attempt = await tx.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422027, ${attempt.releaseId}::integer)`;
    const release = await tx.release.findUniqueOrThrow({ where: { id: attempt.releaseId }, include: { tracks: true } });
    if (release.upc && input.upc && release.upc !== input.upc) throw new Error("DireNote returned a conflicting UPC. Reconcile the provider identity before continuing.");
    if (release.upc !== input.upc) await tx.externalIdentifierHistory.create({ data: { releaseId: release.id, provider: "direnote", identifierType: "upc", previousValue: release.upc, canonicalValue: input.upc ?? "awaiting_assignment", source: "submission_attempt" } });
    const metadata = release.metadata && typeof release.metadata === "object" && !Array.isArray(release.metadata) ? release.metadata : {};
    const direNote = metadata.direNote && typeof metadata.direNote === "object" && !Array.isArray(metadata.direNote) ? metadata.direNote : {};
    await tx.release.update({ where: { id: release.id }, data: { upc: input.upc, direNoteStatus: "processing", metadata: { ...metadata, direNote: { ...direNote, currentAttemptId: id } } } });
    for (const item of Array.isArray(input.trackIdentifiers) ? input.trackIdentifiers : []) {
      const identifier = item as { id: number; isrc: string | null };
      const track = release.tracks.find(row => row.id === identifier.id);
      if (!track) throw new Error("Submission track identity changed during ingest.");
      if (track.isrc && identifier.isrc && track.isrc !== identifier.isrc) throw new Error("DireNote returned a conflicting ISRC. Reconcile the recording identity before continuing.");
      if (track.isrc !== identifier.isrc) await tx.externalIdentifierHistory.create({ data: { releaseId: release.id, trackId: track.id, provider: "direnote", identifierType: "isrc", previousValue: track.isrc, canonicalValue: identifier.isrc ?? "awaiting_assignment", source: "submission_attempt" } });
      await tx.track.update({ where: { id: track.id }, data: { isrc: identifier.isrc } });
    }
    const previousCandidates = await tx.distributionSubmissionAttempt.findMany({
      where: { releaseId: attempt.releaseId, provider: "direnote", isCurrent: true, id: { not: id } },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }]
    });
    const previous = previousCandidates[0] ?? null;
    if (previous) {
      const correction = previous.corrections && typeof previous.corrections === "object" && !Array.isArray(previous.corrections) ? previous.corrections : {};
      await tx.distributionSubmissionAttempt.updateMany({
        where: { id: { in: previousCandidates.map(item => item.id) } },
        data: { isCurrent: false, providerStatus: "superseded", corrections: { ...correction, status: "superseded", resubmittedAt: new Date().toISOString(), supersededByAttemptId: id } }
      });
      await tx.adminTask.updateMany({ where: { eventKey: { startsWith: `release:${release.id}:direnote:correction:${previous.id}:` }, status: { not: "resolved" } }, data: { status: "resolved", resolvedAt: new Date(), resolutionNote: "Corrections re-ingested; monitoring the new submission attempt." } });
    }
    return tx.distributionSubmissionAttempt.update({ where: { id }, data: { ...input, isCurrent: true, state: "submitted", providerStatus: "processing", completedAt: new Date() } });
  }, { timeout: 30_000 });
}
// vercel trigger 9

// vercel trigger 12
