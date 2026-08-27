import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { localStorageProvider } from "@/lib/storage-service";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const { id, index: rawIndex } = await params; const index = Number(rawIndex);
  const session = await prisma.uploadSession.findFirst({ where: { id, userId: auth.user.id } });
  if (!session) return NextResponse.json({ error: "Upload session not found." }, { status: 404 });
  if (session.expiresAt <= new Date()) { await prisma.uploadSession.update({ where: { id }, data: { status: "EXPIRED" } }); return NextResponse.json({ error: "Upload session expired." }, { status: 410 }); }
  if (!["CREATED", "UPLOADING", "PAUSED", "FAILED"].includes(session.status)) return NextResponse.json({ error: `Upload is ${session.status.toLowerCase()}.` }, { status: 409 });
  if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) return NextResponse.json({ error: "Invalid chunk index." }, { status: 400 });
  const bytes = Buffer.from(await request.arrayBuffer());
  const expected = index === session.totalChunks - 1 ? session.totalSize - index * session.chunkSize : session.chunkSize;
  if (bytes.length !== expected) return NextResponse.json({ error: "Chunk size does not match the upload session." }, { status: 400 });
  await localStorageProvider.writeChunk(session.tempPath, index, bytes);
  const updated = await prisma.$transaction(async transaction => {
    // Concurrent chunk requests must serialize their read/modify/write cycle.
    // Without this lock, each request can overwrite chunks recorded by another.
    await transaction.$queryRaw`SELECT "id" FROM "upload_sessions" WHERE "id" = ${id} FOR UPDATE`;
    const current = await transaction.uploadSession.findUnique({ where: { id } });
    if (!current) throw new Error("Upload session not found.");
    if (!["CREATED", "UPLOADING", "PAUSED", "FAILED"].includes(current.status)) throw new Error(`Upload is ${current.status.toLowerCase()}.`);
    const uploaded = new Set<number>((current.uploadedChunks as number[]) || []);
    uploaded.add(index);
    const indices = [...uploaded].sort((a, b) => a - b);
    const bytesUploaded = indices.reduce((sum, item) => sum + (item === current.totalChunks - 1 ? current.totalSize - item * current.chunkSize : current.chunkSize), 0);
    return transaction.uploadSession.update({ where: { id }, data: { uploadedChunks: indices, bytesUploaded, status: "UPLOADING", errorMessage: null } });
  });
  const indices = (updated.uploadedChunks as number[]) || [];
  console.info("Upload chunk stored", { uploadSessionId: id, index, uploadedChunks: indices.length, totalChunks: updated.totalChunks, bytesUploaded: updated.bytesUploaded });
  return NextResponse.json({ received: index, bytesUploaded: updated.bytesUploaded, uploadedChunks: indices }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
