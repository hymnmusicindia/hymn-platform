import { prisma } from "@/lib/prisma";
import { storedAssetIdFromUrl } from "@/lib/release-media";

export type IdentifierConflict = { code: "UPC_ALREADY_ASSIGNED" | "ISRC_RECORDING_CONFLICT"; field: string; message: string };

async function checksumFor(url: string | null | undefined) {
  const id = storedAssetIdFromUrl(url);
  if (!id) return null;
  return (await prisma.storedAsset.findUnique({ where: { id }, select: { checksum: true } }))?.checksum ?? null;
}

/** Detects identity reuse without exposing another customer's release details. */
export async function findReleaseIdentifierConflicts(input: { releaseId: number; upc?: string | null; tracks: Array<{ id?: number; trackNumber: number; isrc?: string | null; audioUrl?: string | null }> }) {
  const conflicts: IdentifierConflict[] = [];
  const upc = input.upc?.trim();
  if (upc && await prisma.release.count({ where: { id: { not: input.releaseId }, upc } })) {
    conflicts.push({ code: "UPC_ALREADY_ASSIGNED", field: "upcCode", message: "This UPC/EAN is already assigned to another HYMN release. Contact support for a verified catalogue transfer or re-release." });
  }
  for (const track of input.tracks) {
    const isrc = track.isrc?.trim().toUpperCase();
    if (!isrc) continue;
    const matches = await prisma.track.findMany({ where: { releaseId: { not: input.releaseId }, isrc }, select: { audioUrl: true }, take: 5 });
    if (!matches.length) continue;
    const incomingChecksum = await checksumFor(track.audioUrl);
    const knownChecksums = (await Promise.all(matches.map(match => checksumFor(match.audioUrl)))).filter((value): value is string => Boolean(value));
    if (!incomingChecksum || knownChecksums.some(checksum => checksum !== incomingChecksum) || knownChecksums.length !== matches.length) {
      conflicts.push({ code: "ISRC_RECORDING_CONFLICT", field: `tracks.${track.trackNumber - 1}.isrc`, message: `Track ${track.trackNumber}'s ISRC is already attached to a different or unverifiable recording. Contact support if this is a legitimate catalogue transfer.` });
    }
  }
  return conflicts;
}
