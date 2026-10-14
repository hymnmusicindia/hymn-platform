import "server-only";
import { prisma } from "@/lib/prisma";
import { playlistProfileSchema } from "@/lib/playlist-review-domain";

/** Append-only application metadata keeps existing listings compatible without a DB migration. */
export async function playlistListingProfiles(ids: number[]) {
  const profiles = new Map<number, ReturnType<typeof playlistProfileSchema.parse>>();
  if (!ids.length) return profiles;
  const rows = await prisma.auditLog.findMany({ where: { entity: "playlist_review", action: "PLAYLIST_CURATOR_APPLIED", entityId: { in: [...new Set(ids)].map(String) } }, select: { entityId: true, metadata: true }, orderBy: { id: "desc" } });
  for (const row of rows) {
    const profile = playlistProfileSchema.safeParse((row.metadata as Record<string, unknown> | null)?.profile);
    if (profile.success && !profiles.has(Number(row.entityId))) profiles.set(Number(row.entityId), profile.data);
  }
  return profiles;
}
