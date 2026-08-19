import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function distributionPayloadIdentity(releaseId: number, payload: unknown) {
  const payloadHash = crypto.createHash("sha256").update(canonical(payload)).digest("hex");
  return { payloadHash, idempotencyKey: `direnote:release:${releaseId}:${payloadHash}` };
}

export async function claimDistributionSubmission(releaseId: number, payload: unknown) {
  const identity = distributionPayloadIdentity(releaseId, payload);
  const cooldownMs = 5 * 60 * 1000;
  const latestAttempt = await prisma.distributionSubmissionAttempt.findFirst({
    where: { releaseId, provider: "direnote" },
    orderBy: { startedAt: "desc" },
  });
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
  const claimed = await prisma.distributionSubmissionAttempt.updateMany({ where: { id: existing.id }, data: { state: "processing", attemptCount: { increment: 1 }, safeError: null, startedAt: new Date(), completedAt: null } });
  return { attempt: await prisma.distributionSubmissionAttempt.findUniqueOrThrow({ where: { id: existing.id } }), claimed: claimed.count >= 1, alreadySubmitted: false, retryAfterSeconds: undefined };
}

export async function finishDistributionSubmission(id: number, input: { state: "submitted" | "failed" | "retryable"; httpStatus?: number | null; providerReference?: string | null; safeError?: string | null; responseRedacted?: Prisma.InputJsonValue }) {
  return prisma.distributionSubmissionAttempt.update({ where: { id }, data: { ...input, completedAt: new Date() } });
}
// vercel trigger 9

// vercel trigger 12
