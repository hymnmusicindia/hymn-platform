export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { createBeat, listAllBeats } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";
import { localPrivateStorage } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const result = await requireAdminPermission("users.read");
  if ("error" in result) return result.error;

  const beats = await listAllBeats();
  return NextResponse.json({ beats });
}

export async function POST(request: Request) {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;

  try {
    const formData = await request.formData();
    const title = String(formData.get("title") || "").trim();
    const bpm = Number(formData.get("bpm"));
    const genre = String(formData.get("genre") || "").trim();
    const mood = String(formData.get("mood" ) || "").trim();
    const price = Number(formData.get("price"));
    const file = formData.get("file");
    const artwork = formData.get("artwork");
    const producerIdValue = Number(formData.get("producerId"));

    if (!title || !genre || !mood || !Number.isFinite(bpm) || !Number.isFinite(price) || !Number.isInteger(producerIdValue) || producerIdValue <= 0 || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing required beat fields or producer selection." }, { status: 400 });
    }

    const privateAudio = await localPrivateStorage.upload({ ownerUserId: producerIdValue, assetType: "private_beat_deliverable", fileName: file.name, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    const fileUrl = privateAudio.downloadPath;
    const artworkUrl = artwork instanceof File && artwork.size ? await saveUploadedFile(artwork, "beats/artwork", "image") : undefined;

    const beat = await createBeat({
      producerId: producerIdValue,
      title,
      bpm,
      genre,
      mood,
      price,
      fileUrl,
      artworkUrl,
      enabled: true
    });
    await prisma.storedAsset.update({ where: { id: privateAudio.id }, data: { beatId: beat.id } });

    return NextResponse.json({ beat }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


// vercel trigger 3
// vercel trigger 9
