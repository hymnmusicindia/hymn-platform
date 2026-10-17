import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { validIsrc, validReleaseBarcode } from "@/lib/release-input-rules";

const releasedStatuses = ["LIVE", "DISTRIBUTED", "DELIVERED", "PARTIALLY_LIVE"] as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("releases.read");
  if ("error" in admin) return admin.error;
  const releaseId = Number((await params).id);
  if (!Number.isSafeInteger(releaseId) || releaseId < 1) return NextResponse.json({ error: "Invalid release." }, { status: 400 });
  const history = await prisma.externalIdentifierHistory.findMany({ where: { releaseId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, identifierType: true, previousValue: true, canonicalValue: true, source: true, reason: true, createdAt: true, track: { select: { title: true, trackNumber: true } } } });
  return NextResponse.json({ history });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("releases.override");
  if ("error" in admin) return admin.error;
  const releaseId = Number((await params).id);
  if (!Number.isSafeInteger(releaseId) || releaseId < 1) return NextResponse.json({ error: "Invalid release." }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid identifier update." }, { status: 400 });
  const upc = typeof body.upc === "string" ? body.upc.trim() || null : undefined;
  const tracks = Array.isArray(body.tracks) ? body.tracks as Array<{ id: number; isrc: string | null }> : undefined;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) return NextResponse.json({ error: "Add a reason for this identifier change." }, { status: 400 });
  if (upc !== undefined && upc !== null && !validReleaseBarcode(upc)) return NextResponse.json({ error: "Enter a valid 12 or 13 digit UPC/EAN." }, { status: 400 });
  if (tracks && tracks.some(track => !Number.isSafeInteger(track.id) || (track.isrc && !validIsrc(track.isrc)))) return NextResponse.json({ error: "Enter valid 12-character ISRCs for the selected tracks." }, { status: 400 });

  try {
    const release = await prisma.$transaction(async tx => {
      const current = await tx.release.findUnique({ where: { id: releaseId }, include: { tracks: { orderBy: { trackNumber: "asc" } } } });
      if (!current) throw new Error("Release not found.");
      if (releasedStatuses.includes(current.status as typeof releasedStatuses[number])) throw new Error("UPC and ISRC are locked after a release goes live.");
      if (tracks && (tracks.length !== current.tracks.length || tracks.some(item => !current.tracks.some(track => track.id === item.id)))) throw new Error("Track list changed. Reload the release and try again.");
      const normalizedTracks = tracks?.map(track => ({ ...track, isrc: track.isrc?.trim().toUpperCase() || null }));
      if (normalizedTracks && new Set(normalizedTracks.map(track => track.isrc).filter(Boolean)).size !== normalizedTracks.filter(track => track.isrc).length) throw new Error("Each track must have a unique ISRC.");
      if (upc && upc !== current.upc && await tx.release.count({ where: { id: { not: releaseId }, upc } })) throw new Error("This UPC is already assigned to another release.");
      for (const item of normalizedTracks ?? []) {
        const previous = current.tracks.find(track => track.id === item.id)!;
        if (item.isrc && item.isrc !== previous.isrc && await tx.track.count({ where: { id: { not: item.id }, isrc: item.isrc } })) throw new Error("An ISRC is already assigned to another track.");
      }
      if (upc !== undefined && upc !== current.upc) {
        await tx.release.update({ where: { id: releaseId }, data: { upc } });
        await tx.externalIdentifierHistory.create({ data: { releaseId, provider: "hymn", identifierType: "upc", previousValue: current.upc, canonicalValue: upc ?? "removed", source: "admin_manual_correction", reason } });
      }
      for (const item of normalizedTracks ?? []) {
        const previous = current.tracks.find(track => track.id === item.id)!;
        if (item.isrc === previous.isrc) continue;
        await tx.track.update({ where: { id: item.id }, data: { isrc: item.isrc } });
        await tx.externalIdentifierHistory.create({ data: { releaseId, trackId: item.id, provider: "hymn", identifierType: "isrc", previousValue: previous.isrc, canonicalValue: item.isrc ?? "removed", source: "admin_manual_correction", reason } });
      }
      const actorId = "sub" in admin ? Number(admin.sub) || null : null;
      await tx.auditLog.create({ data: { actorType: "admin", actorId, actorRole: (admin as { adminRole?: string }).adminRole ?? "admin", action: "RELEASE_IDENTIFIERS_MANUALLY_UPDATED", entity: "release", entityId: String(releaseId), previousValue: { upc: current.upc, tracks: current.tracks.map(track => ({ id: track.id, isrc: track.isrc })) }, newValue: { upc: upc !== undefined ? upc : current.upc, tracks: normalizedTracks ?? current.tracks.map(track => ({ id: track.id, isrc: track.isrc })) }, reason, riskLevel: "high" } });
      return tx.release.findUniqueOrThrow({ where: { id: releaseId }, include: { tracks: { orderBy: { trackNumber: "asc" } } } });
    });
    return NextResponse.json({ release });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Identifier update failed." }, { status: 400 });
  }
}
