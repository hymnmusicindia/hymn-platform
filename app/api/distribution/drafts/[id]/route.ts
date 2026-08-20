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
  const current = await prisma.release.findUnique({ where: { id } });
  const existing = typeof current?.metadata === "object" && current.metadata ? current.metadata as Record<string, unknown> : {};
  const updated = await prisma.release.update({ where: { id }, data: {
    metadata: { ...existing, ...metadata, lastEditedAt: new Date().toISOString() } as any,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined,
    artistName: typeof body.artistName === "string" && body.artistName.trim() ? body.artistName.trim() : undefined,
    genre: typeof body.genre === "string" ? body.genre : undefined,
    releaseDate: body.releaseDate ? new Date(body.releaseDate) : undefined,
    draftCompletionPercent: Number.isFinite(Number((metadata as any).draftCompletionPercent)) ? Math.max(0, Math.min(100, Number((metadata as any).draftCompletionPercent))) : undefined,
    missingFields: Array.isArray((metadata as any).missingFields) ? (metadata as any).missingFields : undefined,
    lastEditedAt: new Date(),
    artworkUrl: typeof body.artworkUrl === "string" ? body.artworkUrl : undefined,
    audioUrl: typeof body.audioUrl === "string" ? body.audioUrl : undefined
  } });
  if (Array.isArray((metadata as any).tracks)) {
    await prisma.$transaction([
      prisma.track.deleteMany({ where: { releaseId: id } }),
      prisma.track.createMany({ data: (metadata as any).tracks.map((track: any, index: number) => ({ releaseId: id, title: String(track.trackTitle || `Track ${index + 1}`), trackNumber: index + 1, primaryArtist: String(track.primaryArtist || body.artistName || ""), audioUrl: typeof track.audioUrl === "string" ? track.audioUrl : null, metadata: track })) })
    ]);
  }
  return NextResponse.json({ draft: updated, savedAt: updated.updatedAt.toISOString() });
}
