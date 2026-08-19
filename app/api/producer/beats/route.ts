export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { createBeat, listBeatsByProducer } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";
import { validateBeatReadiness } from "@/lib/beat-readiness";
import { createAdminTaskOnce } from "@/lib/task-queue";

export async function GET() {
  const result = await requireRole(["producer", "admin"]);
  if ("error" in result) return result.error;

  const producerId = result.user.role === "producer" ? result.user.id : result.user.id;
  const beats = await listBeatsByProducer(producerId);
  return NextResponse.json({ beats });
}

export async function POST(request: Request) {
  const result = await requireRole(["producer", "admin"]);
  if ("error" in result) return result.error;

  try {
    const formData = await request.formData();
    const title = String(formData.get("title") || "").trim();
    const bpm = Number(formData.get("bpm"));
    const genre = String(formData.get("genre") || "").trim();
    const mood = String(formData.get("mood") || "").trim();
    const keySignature = String(formData.get("keySignature") || "").trim();
    const price = Number(formData.get("price"));
    const file = formData.get("file");
    const artwork = formData.get("artwork");
    const audioFormat = String(formData.get("audioFormat") || "").trim();

    if (!title || !genre || !mood || !Number.isFinite(bpm) || !Number.isFinite(price) || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing required beat fields." }, { status: 400 });
    }

    if (audioFormat === "MP3" && !file.name.toLowerCase().endsWith(".mp3")) {
      return NextResponse.json({ error: "Invalid file format. MP3 expected." }, { status: 400 });
    }
    if (audioFormat === "WAV" && !file.name.toLowerCase().endsWith(".wav")) {
      return NextResponse.json({ error: "Invalid file format. WAV expected." }, { status: 400 });
    }

    const fileUrl = await saveUploadedFile(file, "beats/files", "audio");
    const artworkUrl = artwork instanceof File && artwork.size ? await saveUploadedFile(artwork, "beats/artwork", "image") : undefined;

    const beat = await createBeat({
      producerId: result.user.id,
      title,
      bpm,
      genre,
      mood,
      keySignature,
      price,
      fileUrl,
      artworkUrl,
      enabled: false
    });

    const readiness = validateBeatReadiness({ title, bpm, genre, mood, keySignature, price, audioUrl: fileUrl, artworkUrl });
    await createAdminTaskOnce({ eventKey: `producer:${result.user.id}:beat:${beat.id}:review`, type: "Beat Awaiting Approval", priority: readiness.ready ? "normal" : "high", title: readiness.ready ? `Beat ready for review: ${title}` : `Beat needs corrections: ${title}`, body: readiness.ready ? "All required beat fields are present." : readiness.issues.map((issue) => issue.message).join(" "), href: `/admin?tab=beats&beatId=${beat.id}`, entityType: "beat", entityId: beat.id });

    return NextResponse.json({ beat, readiness, status: readiness.ready ? "pending_review" : "changes_requested" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


