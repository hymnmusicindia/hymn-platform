export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { createBeat, listAllBeats } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const beats = await listAllBeats();
  return NextResponse.json({ beats });
}

export async function POST(request: Request) {
  const result = await requireAdmin();
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

    const fileUrl = await saveUploadedFile(file, "beats/files", "audio");
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

    return NextResponse.json({ beat }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


// vercel trigger 3
