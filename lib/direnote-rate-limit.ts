import "server-only";

import { prisma } from "@/lib/prisma";

export function isDireNoteRateLimit(error: unknown): error is Error & { code: "DIRENOTE_RATE_LIMIT"; retryAfterSeconds: number } {
  return error instanceof Error && (error as { code?: string }).code === "DIRENOTE_RATE_LIMIT";
}

export async function enforceDireNoteResponseLimit(result: { httpStatus: number | null; retryAfterSeconds?: number }, releaseId?: number | null) {
  if (result.httpStatus !== 429) return;
  const retryAfterSeconds = Math.max(60, result.retryAfterSeconds ?? 3600);
  await prisma.direNoteLog.create({ data: { releaseId: releaseId ?? null, action: "provider_rate_limit", success: false, httpStatus: 429, responseJson: { retryAt: new Date(Date.now() + retryAfterSeconds * 1000).toISOString() } } });
  throw Object.assign(new Error("DireNote requests deferred during the provider Retry-After period."), { code: "DIRENOTE_RATE_LIMIT", retryAfterSeconds });
}

/**
 * Reserves capacity before an outbound DNM call. Reservations are durable so
 * concurrent cron invocations share the documented provider-wide limit.
 */
export async function reserveDireNoteRequest(action: string, releaseId?: number | null, actorId?: number | null) {
  await prisma.$transaction(async (tx) => {
    // PostgreSQL advisory locking serializes this narrow reservation path
    // across app instances without locking the release or royalty tables.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422026)`;
    const cooldown = await tx.direNoteLog.findFirst({ where: { action: "provider_rate_limit" }, orderBy: { createdAt: "desc" }, select: { responseJson: true } });
    const retryAt = (cooldown?.responseJson as { retryAt?: string } | null)?.retryAt;
    if (retryAt && Date.parse(retryAt) > Date.now()) {
      const error = new Error("DireNote hourly request capacity is exhausted during the provider Retry-After period.");
      Object.assign(error, { code: "DIRENOTE_RATE_LIMIT", retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000)) });
      throw error;
    }
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const used = await tx.direNoteLog.count({
      where: { action: "rate_limit_reservation", createdAt: { gte: since } }
    });

    // Keep five requests available for an administrator to diagnose or submit
    // a release while scheduled work is active.
    if (used >= 95) {
      const oldest = await tx.direNoteLog.findFirst({ where: { action: "rate_limit_reservation", createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
      const retryAfterSeconds = Math.max(1, Math.ceil(((oldest?.createdAt.getTime() ?? Date.now()) + 60 * 60 * 1000 - Date.now()) / 1000));
      const error = new Error(`DireNote hourly request capacity is exhausted. Retry in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`);
      Object.assign(error, { code: "DIRENOTE_RATE_LIMIT", retryAfterSeconds });
      throw error;
    }

    await tx.direNoteLog.create({
      data: {
        releaseId: releaseId ?? null,
        action: "rate_limit_reservation",
        success: true,
        requestPayloadRedacted: { action },
        createdByAdminId: actorId ?? null
      }
    });
  }, { timeout: 15_000, maxWait: 10_000 });
}
