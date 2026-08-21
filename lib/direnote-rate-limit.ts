import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Reserves capacity before an outbound DNM call. Reservations are durable so
 * concurrent cron invocations share the documented provider-wide limit.
 */
export async function reserveDireNoteRequest(action: string, releaseId?: number | null, actorId?: number | null) {
  await prisma.$transaction(async (tx) => {
    // PostgreSQL advisory locking serializes this narrow reservation path
    // across app instances without locking the release or royalty tables.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422026)`;
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const used = await tx.direNoteLog.count({
      where: { action: "rate_limit_reservation", createdAt: { gte: since } }
    });

    // Keep five requests available for an administrator to diagnose or submit
    // a release while scheduled work is active.
    if (used >= 95) {
      const retryAfterSeconds = Math.max(1, Math.ceil((since.getTime() + 60 * 60 * 1000 - Date.now()) / 1000));
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
  });
}
