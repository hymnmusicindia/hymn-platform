import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createSafeAssetFolderName, uploadConfig, type AssetCategory } from "@/lib/storage-service";

const categories = new Set<AssetCategory>(["RELEASE_COVER_ART", "TRACK_AUDIO_MASTER", "TRACK_AUDIO_PREVIEW", "RELEASE_DOCUMENT", "TRACK_DOCUMENT", "OTHER_RELEASE_ASSET", "OTHER_TRACK_ASSET"]);
const mimeTypes = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "image/jpeg", "image/png", "application/pdf"]);
const releaseCoverMaximumSize = 20 * 1024 * 1024;

export async function GET(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const releaseId = Number(new URL(request.url).searchParams.get("releaseId"));
  if (!Number.isInteger(releaseId)) return NextResponse.json({ error: "releaseId is required." }, { status: 400 });
  const owned = await prisma.release.count({ where: { id: releaseId, userId: auth.user.id } });
  if (!owned) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const sessions = await prisma.uploadSession.findMany({ where: { userId: auth.user.id, releaseId, status: { notIn: ["EXPIRED"] } }, orderBy: { createdAt: "desc" }, include: { finalAsset: { select: { id: true, safeFilename: true } } } });
  return NextResponse.json({ sessions, config: uploadConfig }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  try {
    const body = await request.json();
    const releaseId = Number(body.releaseId), trackId = body.trackId ? Number(body.trackId) : null;
    const category = String(body.assetCategory || "") as AssetCategory;
    const originalFilename = String(body.originalFilename || ""), mimeType = String(body.mimeType || ""), totalSize = Number(body.totalSize);
    if (!Number.isInteger(releaseId) || !categories.has(category) || !mimeTypes.has(mimeType)) throw new Error("Invalid upload session metadata.");
    if (category === "RELEASE_COVER_ART" && (mimeType !== "image/jpeg" || !/\.(jpe?g)$/i.test(originalFilename))) throw new Error("Cover artwork must be a JPG/JPEG file.");
    if (category === "RELEASE_COVER_ART" && totalSize > releaseCoverMaximumSize) throw new Error("Cover artwork must be 20 MB or smaller.");
    if (!Number.isSafeInteger(totalSize) || totalSize < 1 || totalSize > 500 * 1024 * 1024) throw new Error("Upload size is invalid.");
    createSafeAssetFolderName(originalFilename, "file");
    const release = await prisma.release.findFirst({ where: { id: releaseId, userId: auth.user.id }, select: { id: true } });
    if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    if (trackId && !(await prisma.track.count({ where: { id: trackId, releaseId } }))) return NextResponse.json({ error: "Track not found." }, { status: 404 });
    const clientTrackId = body.clientTrackId ? String(body.clientTrackId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : null;
    const resumable = await prisma.uploadSession.findFirst({ where: { userId: auth.user.id, releaseId, trackId, clientTrackId, assetCategory: category, originalFilename, totalSize, status: { in: ["CREATED", "UPLOADING", "PAUSED", "FAILED"] }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
    if (resumable) return NextResponse.json({ session: resumable, config: uploadConfig });
    const session = await prisma.uploadSession.create({ data: { userId: auth.user.id, releaseId, trackId, clientTrackId, assetCategory: category, originalFilename, mimeType, totalSize, chunkSize: uploadConfig.chunkSize, totalChunks: Math.ceil(totalSize / uploadConfig.chunkSize), uploadedChunks: [], tempPath: crypto.randomUUID(), expiresAt: new Date(Date.now() + uploadConfig.sessionHours * 3_600_000) } });
    console.info("Upload session created", { uploadSessionId: session.id, userId: auth.user.id, releaseId, category, totalSize });
    return NextResponse.json({ session, config: uploadConfig }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create upload session." }, { status: 400 }); }
}
