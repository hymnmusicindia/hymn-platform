import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { localPrivateStorage, privateStorageRootPath } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";

const chunkSize = 8 * 1024 * 1024;
const maximumAudioSize = 500 * 1024 * 1024;
const audioTypes = new Set(["audio/wav", "audio/x-wav", "audio/mpeg"]);

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  try {
    const body = await request.json() as { uploadId?: string; fileName?: string; mimeType?: string; byteSize?: number; total?: number; releaseId?: number };
    const uploadId = String(body.uploadId || "");
    const fileName = String(body.fileName || "");
    const mimeType = String(body.mimeType || "");
    const byteSize = Number(body.byteSize);
    const total = Number(body.total);
    const releaseId = body.releaseId ? Number(body.releaseId) : undefined;
    if (!/^[a-f0-9-]{36}$/i.test(uploadId)) throw new Error("Invalid upload identifier.");
    if (!audioTypes.has(mimeType) || !/\.(wav|mp3)$/i.test(fileName)) throw new Error("Only WAV or MP3 masters are supported.");
    if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > maximumAudioSize) throw new Error("Audio master size is invalid.");
    if (!Number.isSafeInteger(total) || total < 1 || total !== Math.ceil(byteSize / chunkSize)) throw new Error("Invalid upload chunk count.");
    if (releaseId) {
      const owned = await prisma.release.count({ where: { id: releaseId, userId: result.user.id } });
      if (!owned) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    }

    const stagingRoot = path.resolve(privateStorageRootPath(), ".upload-chunks", String(result.user.id), uploadId);
    const allowedRoot = path.resolve(privateStorageRootPath(), ".upload-chunks", String(result.user.id));
    if (!stagingRoot.startsWith(`${allowedRoot}${path.sep}`)) throw new Error("Unsafe upload path.");
    const parts: Buffer[] = [];
    for (let part = 0; part < total; part += 1) parts.push(await fs.readFile(path.join(stagingRoot, `${part}.part`)));
    const bytes = Buffer.concat(parts);
    if (bytes.length !== byteSize) throw new Error("The assembled audio size does not match the selected file.");
    const asset = await localPrivateStorage.upload({ ownerUserId: result.user.id, releaseId, assetType: "private_audio_master", fileName, mimeType, bytes });
    await fs.rm(stagingRoot, { recursive: true, force: true });
    return NextResponse.json({ asset }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Could not finalize the chunked audio upload.";
    console.error("Chunked audio finalization failed", error);
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
