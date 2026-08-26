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
  const uploaded = new Set<number>((session.uploadedChunks as number[]) || []); uploaded.add(index);
  const indices = [...uploaded].sort((a, b) => a - b);
  const bytesUploaded = indices.reduce((sum, item) => sum + (item === session.totalChunks - 1 ? session.totalSize - item * session.chunkSize : session.chunkSize), 0);
  const updated = await prisma.uploadSession.update({ where: { id }, data: { uploadedChunks: indices, bytesUploaded, status: "UPLOADING", errorMessage: null } });
  return NextResponse.json({ received: index, bytesUploaded: updated.bytesUploaded, uploadedChunks: indices }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
