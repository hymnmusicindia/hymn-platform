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
    const form = await request.formData();
    const chunk = form.get("chunk");
    const uploadId = String(form.get("uploadId") || "");
    const fileName = String(form.get("fileName") || "");
    const mimeType = String(form.get("mimeType") || "");
    const byteSize = Number(form.get("byteSize"));
    const index = Number(form.get("index"));
    const total = Number(form.get("total"));
    const releaseId = form.get("releaseId") ? Number(form.get("releaseId")) : undefined;

    if (!(chunk instanceof File) || !/^[a-f0-9-]{36}$/i.test(uploadId)) throw new Error("Invalid upload chunk.");
    if (!audioTypes.has(mimeType) || !/\.(wav|mp3)$/i.test(fileName)) throw new Error("Only WAV or MP3 masters are supported.");
    if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > maximumAudioSize) throw new Error("Audio master size is invalid.");
    if (!Number.isSafeInteger(total) || total < 1 || total !== Math.ceil(byteSize / chunkSize)) throw new Error("Invalid upload chunk count.");
    if (!Number.isSafeInteger(index) || index < 0 || index >= total || chunk.size < 1 || chunk.size > chunkSize) throw new Error("Invalid upload chunk position.");
    if (releaseId) {
      const owned = await prisma.release.count({ where: { id: releaseId, userId: result.user.id } });
      if (!owned) return NextResponse.json({ error: "Release not found." }, { status: 404 });
    }

    const stagingRoot = path.resolve(privateStorageRootPath(), ".upload-chunks", String(result.user.id), uploadId);
    const allowedRoot = path.resolve(privateStorageRootPath(), ".upload-chunks", String(result.user.id));
    if (!stagingRoot.startsWith(`${allowedRoot}${path.sep}`)) throw new Error("Unsafe upload path.");
    await fs.mkdir(stagingRoot, { recursive: true });
    await fs.writeFile(path.join(stagingRoot, `${index}.part`), Buffer.from(await chunk.arrayBuffer()));

    if (index !== total - 1) return NextResponse.json({ received: index }, { status: 202 });

    const parts: Buffer[] = [];
    for (let part = 0; part < total; part += 1) parts.push(await fs.readFile(path.join(stagingRoot, `${part}.part`)));
    const bytes = Buffer.concat(parts);
    if (bytes.length !== byteSize) throw new Error("The assembled audio size does not match the selected file.");
    const asset = await localPrivateStorage.upload({
      ownerUserId: result.user.id,
      releaseId,
      assetType: "private_audio_master",
      fileName,
      mimeType,
      bytes,
    });
    await fs.rm(stagingRoot, { recursive: true, force: true });
    return NextResponse.json({ asset }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "Chunked private upload failed.";
    console.error("Chunked private upload failed", error);
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
