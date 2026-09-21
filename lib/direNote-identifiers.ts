import { prisma } from "@/lib/prisma";
import { upcFromDireNoteResponse } from "@/lib/direnote-upc";

type Source = "current_attempt" | "canonical_projection" | "attempt_snapshot" | "legacy_metadata" | "missing";

export async function resolveCurrentDireNoteIdentifiers(releaseId: number) {
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { tracks: { orderBy: { trackNumber: "asc" } }, distributionSubmissions: { where: { provider: "direnote", isCurrent: true }, take: 1 } } });
  if (!release) return null;
  const attempt = release.distributionSubmissions[0];
  const snapshot = attempt?.responseRedacted ?? attempt?.rawStatusPayload;
  const attemptUpc = upcFromDireNoteResponse(attempt?.upc) ?? upcFromDireNoteResponse(snapshot);
  const legacyUpc = upcFromDireNoteResponse(release.metadata);
  const upc = attemptUpc ?? upcFromDireNoteResponse(release.upc) ?? legacyUpc;
  const upcSource: Source = attempt?.upc && attemptUpc ? "current_attempt" : snapshot && attemptUpc ? "attempt_snapshot" : release.upc ? "canonical_projection" : legacyUpc ? "legacy_metadata" : "missing";
  const attemptTracks = Array.isArray(attempt?.trackIdentifiers) ? attempt.trackIdentifiers as Array<Record<string, unknown>> : [];
  return { upc, upcSource, tracks: release.tracks.map(track => {
    const item = attemptTracks.find(candidate => Number(candidate.id) === track.id);
    const isrc = String(item?.isrc ?? track.isrc ?? "").trim() || null;
    return { trackId: track.id, isrc, isrcSource: item?.isrc ? "current_attempt" as Source : track.isrc ? "canonical_projection" as Source : "missing" as Source };
  }) };
}

export function adminReleaseStatusLabel(status: string, providerStatus?: string | null) {
  const labels: Record<string, string> = { submitting_to_distributor: "Sending to DireNote", sent_to_distributor: "Sent to DireNote", distributor_processing: "DireNote Review", changes_requested: "Changes Required", rejected: providerStatus === "rejected" ? "Rejected by DireNote" : "Rejected" };
  return labels[status.toLowerCase()] ?? status.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
