import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getDetailedReleaseByUserId } from "@/lib/distribution-db";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const release = await getDetailedReleaseByUserId(user.session.sub, Number((await params).id));
  if (!release || release.status !== "draft") return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  return NextResponse.json({ draft: release });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const id = Number((await params).id);
  const release = await getDetailedReleaseByUserId(user.session.sub, id);
  if (!release || release.status !== "draft") return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const metadata = typeof body.metadata === "object" && body.metadata ? body.metadata : {};
  const { prisma } = await import("@/lib/prisma");
  try {
  const updated = await prisma.$transaction(async tx => {
  const locked = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422028, ${id}::integer) AS locked`;
  if (!locked[0]?.locked) throw new Error("This release is being saved or submitted. Retry shortly.");
  const current = await tx.release.findFirst({ where: { id, userId: user.session.sub, archivedAt: null }, select: { metadata: true, status: true, tracks: { select: { id: true, trackNumber: true } } } });
  if (!current || current.status !== "DRAFT") throw new Error("This release is no longer an editable draft. Refresh before editing.");
  const existing = typeof current?.metadata === "object" && current.metadata ? current.metadata as Record<string, unknown> : {};
  const updated = await tx.release.update({ where: { id }, data: {
    metadata: { ...existing, ...metadata, promotionCode: existing.promotionCode ?? null, campaignAttribution: existing.campaignAttribution ?? {}, lastEditedAt: new Date().toISOString() } as any,
    releaseType: ["single", "ep", "album"].includes(metadata.releaseType) ? metadata.releaseType : undefined,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined,
    artistName: typeof body.artistName === "string" && body.artistName.trim() ? body.artistName.trim() : undefined,
    genre: typeof body.genre === "string" ? body.genre : undefined,
    releaseDate: body.releaseDate ? new Date(body.releaseDate) : undefined,
    draftCompletionPercent: Number.isFinite(Number((metadata as any).draftCompletionPercent)) ? Math.max(0, Math.min(100, Number((metadata as any).draftCompletionPercent))) : undefined,
    missingFields: Array.isArray((metadata as any).missingFields) ? (metadata as any).missingFields : undefined,
    lastEditedAt: new Date(),
    artworkUrl: typeof body.artworkUrl === "string" ? body.artworkUrl : undefined,
    audioUrl: typeof body.audioUrl === "string" ? body.audioUrl : undefined,
    reviewConfirmedAt: null,
    reviewConfirmedBy: null,
    reviewMetadataHash: null
  }, select: { id: true, updatedAt: true } });
  if (Array.isArray((metadata as any).tracks)) {
    const tracks = (metadata as any).tracks as any[];
    for (const [index, track] of tracks.entries()) {
      const data = { title: String(track.trackTitle || `Track ${index + 1}`), trackNumber: index + 1, primaryArtist: String(track.primaryArtist || body.artistName || ""), audioUrl: typeof track.audioUrl === "string" ? track.audioUrl : null, metadata: track };
      const existingTrack = current.tracks.find(item => item.trackNumber === index + 1);
      if (existingTrack) await tx.track.update({ where: { id: existingTrack.id }, data });
      else await tx.track.create({ data: { ...data, releaseId: id } });
    }
    await tx.track.deleteMany({ where: { releaseId: id, trackNumber: { gt: tracks.length } } });
  }
  return updated;
  }, { timeout: 30_000 });
  return NextResponse.json({ draft: updated, savedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save draft." }, { status: 409 });
  }
}
