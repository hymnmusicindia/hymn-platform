import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Hashes the authoritative persisted release revision the customer reviewed. */
export async function releaseReviewSnapshotHash(releaseId: number, userId: number) {
  const release = await prisma.release.findFirst({
    where: { id: releaseId, userId },
    select: {
      id: true, title: true, artistName: true, genre: true, releaseType: true,
      artworkUrl: true, audioUrl: true, releaseDate: true, metadata: true, upc: true,
      paymentStatus: true,
      tracks: {
        orderBy: [{ trackNumber: "asc" }, { id: "asc" }],
        select: { id: true, title: true, trackNumber: true, primaryArtist: true, audioUrl: true, isrc: true, metadata: true,
          contributions: { orderBy: { id: "asc" }, select: { partyId: true, role: true, creditedName: true, legalNameSnapshot: true, sequence: true } }
        }
      }
    }
  });
  if (!release) return null;
  return crypto.createHash("sha256").update(canonical(release)).digest("hex");
}
