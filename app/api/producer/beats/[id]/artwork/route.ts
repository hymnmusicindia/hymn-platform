export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { mapPrismaBeat } from "@/lib/db";
import { beatAssetRelativePath } from "@/lib/storage-service";
import { deleteUploadedFileByUrl, deleteUploadedFileByUrlPermanently, saveUploadedFile } from "@/lib/storage";
import { createAdminTaskOnce } from "@/lib/task-queue";
import { Prisma } from "@prisma/client";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["producer", "admin"]);
  if ("error" in auth) return auth.error;
  const beatId = Number((await params).id);
  if (!Number.isInteger(beatId) || beatId <= 0) return NextResponse.json({ error: "Invalid beat identifier." }, { status: 400 });

  const current = await prisma.beat.findUnique({ where: { id: beatId }, include: { user: true, artwork: true } });
  if (!current) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
  if (auth.user.role === "producer" && current.userId !== auth.user.id) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const artwork = form?.get("artwork");
  if (!(artwork instanceof File) || artwork.size === 0) return NextResponse.json({ error: "Choose a JPEG, PNG, or WebP cover image." }, { status: 400 });

  const relativeFile = beatAssetRelativePath({ producerName: current.user.name, producerId: current.userId, beatTitle: current.title, beatId, assetName: "Cover Art", originalFilename: artwork.name, mimeType: artwork.type });
  const directory = relativeFile.slice(0, relativeFile.lastIndexOf("/"));
  let replacementUrl: string | null = null;
  let replacementUploadId: number | null = null;
  let databaseCommitted = false;
  try {
    replacementUrl = await saveUploadedFile(artwork, directory, "image");
    const updated = await prisma.$transaction(async (tx) => {
      const upload = await tx.upload.create({ data: { userId: current.userId, kind: "ARTWORK", storageKey: replacementUrl!, fileName: artwork.name, mimeType: artwork.type, sizeBytes: artwork.size, publicUrl: replacementUrl } });
      replacementUploadId = upload.id;
      return tx.beat.update({ where: { id: beatId }, data: { artworkUploadId: upload.id, status: "PENDING_REVIEW", enabled: false, reviewIssues: Prisma.JsonNull }, include: { user: true, audio: true, preview: true, artwork: true } });
    });
    databaseCommitted = true;

    try {
      if (current.artwork?.publicUrl && current.artwork.publicUrl !== replacementUrl) await deleteUploadedFileByUrlPermanently(current.artwork.publicUrl);
    } catch (cleanupError) {
      await prisma.$transaction(async (tx) => {
        await tx.beat.update({ where: { id: beatId }, data: { artworkUploadId: current.artworkUploadId, status: current.status, enabled: current.enabled, reviewIssues: current.reviewIssues == null ? Prisma.JsonNull : current.reviewIssues as Prisma.InputJsonValue } });
        if (replacementUploadId) await tx.upload.deleteMany({ where: { id: replacementUploadId } });
      });
      await deleteUploadedFileByUrl(replacementUrl);
      return NextResponse.json({ error: cleanupError instanceof Error ? `The old cover could not be deleted: ${cleanupError.message}` : "The old cover could not be deleted. No changes were kept." }, { status: 500 });
    }
    if (current.artworkUploadId) await prisma.upload.deleteMany({ where: { id: current.artworkUploadId, artworkBeats: { none: {} } } }).catch((error) => console.error("Obsolete beat artwork upload record cleanup failed", { beatId, uploadId: current.artworkUploadId, error }));
    await createAdminTaskOnce({ eventKey: `producer:${current.userId}:beat:${beatId}:artwork:${replacementUploadId}`, type: "Beat Awaiting Approval", priority: "normal", title: `Replacement artwork ready for review: ${current.title}`, body: "The producer replaced the cover artwork. Review the new visual and current beat metadata.", href: `/admin?tab=operations&beatId=${beatId}`, entityType: "beat", entityId: beatId }).catch((error) => console.error("Replacement artwork review task failed", { beatId, error }));
    return NextResponse.json({ beat: mapPrismaBeat(updated), oldArtworkDeleted: true });
  } catch (error) {
    if (replacementUrl && !databaseCommitted) await deleteUploadedFileByUrl(replacementUrl);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not replace beat artwork." }, { status: 400 });
  }
}
