import { NextResponse } from "next/server";
import { saveReleaseTracks, releaseSaveFailure } from "@/lib/release-track-save";
import { releaseSaveTransactionOptions } from "@/lib/release-contributor-sync";
export const maxDuration = 180;
import { requireUser } from "@/lib/access";
import { draftTitleForSave } from "@/lib/draft-policy";
import { getDetailedReleaseByUserId } from "@/lib/distribution-db";
import { resolvePrivateReleaseArtworkUrl } from '@/lib/release-asset-resolution';
import { recordId } from '@/lib/record-id';
import { readJsonBody, RequestBodyError } from '@/lib/request-body';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const id = recordId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid draft." }, { status: 400 });
  const release = await getDetailedReleaseByUserId(user.session.sub, id);
  if (!release || release.status !== "draft") return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  return NextResponse.json({ draft: release });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const id = recordId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid draft." }, { status: 400 });
  const release = await getDetailedReleaseByUserId(user.session.sub, id);
  if (!release || release.status !== "draft") return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  let body: Record<string, any>;
  try {
    const parsed = await readJsonBody(request, 2 * 1024 * 1024);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return NextResponse.json({ error: "A draft object is required." }, { status: 400 });
    body = parsed as Record<string, any>;
    if (body.metadata !== undefined && (!body.metadata || typeof body.metadata !== 'object' || Array.isArray(body.metadata))) return NextResponse.json({ error: "Draft metadata must be an object." }, { status: 400 });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const metadata = typeof body.metadata === "object" && body.metadata ? body.metadata : {};
  const { prisma } = await import("@/lib/prisma");
  try {
  const updated = await prisma.$transaction(async tx => {
  const locked = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422028, ${id}::integer) AS locked`;
  if (!locked[0]?.locked) throw new Error("This release is being saved or submitted. Retry shortly.");
  const current = await tx.release.findFirst({ where: { id, userId: user.session.sub, archivedAt: null }, select: { metadata: true, status: true, updatedAt: true, tracks: { select: { id: true, trackNumber: true } } } });
  if (!current || current.status !== "DRAFT") throw new Error("This release is no longer an editable draft. Refresh before editing.");
  if (typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt !== current.updatedAt.toISOString()) {
    return { conflict: true as const, latestUpdatedAt: current.updatedAt.toISOString() };
  }
  const existing = typeof current?.metadata === "object" && current.metadata ? current.metadata as Record<string, unknown> : {};
  const artworkUrl=typeof body.artworkUrl==='string' ? await resolvePrivateReleaseArtworkUrl({userId:user.session.sub,releaseId:id,value:body.artworkUrl},tx):undefined;
  const updated = await tx.release.update({ where: { id }, data: {
    metadata: { ...existing, ...metadata, ...(artworkUrl!==undefined?{artworkUrl}:{}), promotionCode: existing.promotionCode ?? null, campaignAttribution: existing.campaignAttribution ?? {}, lastEditedAt: new Date().toISOString() } as any,
    releaseType: ["single", "ep", "album"].includes(metadata.releaseType) ? metadata.releaseType : undefined,
    title: typeof body.title === "string" ? draftTitleForSave(body.title) : undefined,
    artistName: typeof body.artistName === "string" && body.artistName.trim() ? body.artistName.trim() : undefined,
    genre: typeof body.genre === "string" ? body.genre : undefined,
    releaseDate: body.releaseDate ? new Date(body.releaseDate) : undefined,
    draftCompletionPercent: Number.isFinite(Number((metadata as any).draftCompletionPercent)) ? Math.max(0, Math.min(100, Number((metadata as any).draftCompletionPercent))) : undefined,
    missingFields: Array.isArray((metadata as any).missingFields) ? (metadata as any).missingFields : undefined,
    lastEditedAt: new Date(),
    artworkUrl,
    audioUrl: typeof body.audioUrl === "string" ? body.audioUrl : undefined,
    reviewConfirmedAt: null,
    reviewConfirmedBy: null,
    reviewMetadataHash: null
  }, select: { id: true, updatedAt: true } });
  if (Array.isArray((metadata as any).tracks)) {
    const tracks = (metadata as any).tracks as any[];
    await saveReleaseTracks(tx, id, tracks.map((track, index) => ({ title: String(track.trackTitle || ""), trackNumber: index + 1, primaryArtist: String(track.primaryArtist || body.artistName || ""), audioUrl: typeof track.audioUrl === "string" ? track.audioUrl : null, metadata: track })), current.tracks);
    await tx.track.deleteMany({ where: { releaseId: id, trackNumber: { gt: tracks.length } } });
  }
  return { conflict: false as const, updated };
  }, releaseSaveTransactionOptions);
  if (updated.conflict) return NextResponse.json({ error: "This draft was updated elsewhere. Reload the latest version before editing.", code: "DRAFT_VERSION_CONFLICT", latestUpdatedAt: updated.latestUpdatedAt }, { status: 409 });
  return NextResponse.json({ draft: updated.updated, savedAt: updated.updated.updatedAt.toISOString() });
  } catch (error) {
    const transient = releaseSaveFailure(error);
    if (transient) { console.error("Release autosave failed", { releaseId: id, error }); return NextResponse.json(transient, { status: 503 }); }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save draft." }, { status: 409 });
  }
}
