import path from "node:path";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { finalRelativePath, localStorageProvider, validateSessionHeader } from "@/lib/storage-service";
import { validatePrivateUpload, type PrivateAssetType } from "@/lib/private-storage";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const id = (await params).id;
  const session = await prisma.uploadSession.findFirst({ where: { id, userId: auth.user.id }, include: { finalAsset: true } });
  if (!session) return NextResponse.json({ error: "Upload session not found." }, { status: 404 });
  if (session.status === "COMPLETED" && session.finalAsset) return NextResponse.json({ asset: { id: session.finalAsset.id, downloadPath: `/api/assets/${session.finalAsset.id}/download?filename=${encodeURIComponent(session.finalAsset.safeFilename)}` }, session });
  if (session.status === "ASSEMBLING" || session.status === "VERIFYING") return NextResponse.json({ session }, { status: 202 });
  const uploaded = new Set<number>((session.uploadedChunks as number[]) || []);
  if (uploaded.size !== session.totalChunks || Array.from({ length: session.totalChunks }, (_, i) => i).some(i => !uploaded.has(i))) return NextResponse.json({ error: "Upload has missing chunks.", uploadedChunks: [...uploaded] }, { status: 409 });
  const claimed = await prisma.uploadSession.updateMany({ where: { id, status: { in: ["CREATED", "UPLOADING", "PAUSED", "FAILED"] } }, data: { status: "ASSEMBLING", errorMessage: null } });
  if (!claimed.count) return NextResponse.json({ session: await prisma.uploadSession.findUnique({ where: { id } }) }, { status: 202 });
  try {
    const assembled = await localStorageProvider.assemble(session.tempPath, session.totalChunks, session.totalSize);
    await prisma.uploadSession.update({ where: { id }, data: { status: "VERIFYING" } });
    validateSessionHeader(session.mimeType, assembled.header);
    if (session.assetCategory === "RELEASE_COVER_ART") {
      const bytes = await fs.readFile(assembled.path);
      validatePrivateUpload({
        ownerUserId: session.userId,
        releaseId: session.releaseId,
        assetType: "private_unreleased_artwork" as PrivateAssetType,
        fileName: session.originalFilename,
        mimeType: session.mimeType,
        bytes
      });
    }
    const relativePath = await finalRelativePath(session);
    await localStorageProvider.moveAssembled(assembled.path, relativePath);
    const safeFilename = path.basename(relativePath);
    const asset = await prisma.storedAsset.create({ data: { ownerUserId: session.userId, releaseId: session.releaseId, trackId: session.trackId, assetType: session.assetCategory === "TRACK_AUDIO_MASTER" ? "private_audio_master" : session.assetCategory === "RELEASE_COVER_ART" ? "private_unreleased_artwork" : "private_ownership_proof", storageProvider: "LOCAL", storageRoot: "HYMN_STORAGE_ROOT", relativePath, objectKey: relativePath, originalFilename: session.originalFilename, safeFilename, storedFilename: safeFilename, mimeType: session.mimeType, byteSize: assembled.size, checksum: assembled.checksum, category: session.assetCategory, entityType: session.trackId || session.clientTrackId ? "TRACK" : "RELEASE", entityId: String(session.trackId || session.clientTrackId || session.releaseId), accessClassification: "private", uploadStatus: "ready" } });
    const completed = await prisma.uploadSession.update({ where: { id }, data: { status: "COMPLETED", finalAssetId: asset.id, completedAt: new Date(), bytesUploaded: session.totalSize } });
    await localStorageProvider.removeTemp(session.tempPath).catch(error => console.error("Upload temp cleanup failed", { uploadSessionId: id, error }));
    console.info("Upload completed", { uploadSessionId: id, assetId: asset.id, releaseId: session.releaseId, bytes: assembled.size });
    return NextResponse.json({ asset: { id: asset.id, downloadPath: `/api/assets/${asset.id}/download?filename=${encodeURIComponent(safeFilename)}` }, session: completed }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload finalization failed.";
    await prisma.uploadSession.update({ where: { id }, data: { status: "FAILED", errorMessage: message } }).catch(() => undefined);
    console.error("Upload finalization failed", { uploadSessionId: id, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
