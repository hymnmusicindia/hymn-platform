export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { createBeat, listBeatsByProducer } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";
import { localPrivateStorage } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";
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
    const generalPrice = Number(formData.get("generalPrice") || price);
    const exclusivePrice = Number(formData.get("exclusivePrice"));
    const file = formData.get("file");
    const preview = formData.get("preview");
    const artwork = formData.get("artwork");
    const audioFormat = String(formData.get("audioFormat") || "").trim();

    const sampleDeclaration = String(formData.get("sampleDeclaration") || "");
    const sampleDisclosure = String(formData.get("sampleDisclosure") || "").trim();
    if (!title || !genre || !mood || !Number.isFinite(bpm) || bpm < 40 || bpm > 300 || !Number.isFinite(generalPrice) || !Number.isFinite(exclusivePrice) || exclusivePrice <= generalPrice || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing required beat fields." }, { status: 400 });
    }
    if (!['NO_UNCONTROLLED_SAMPLES', 'CONTAINS_UNCONTROLLED_SAMPLES'].includes(sampleDeclaration) || (sampleDeclaration === 'CONTAINS_UNCONTROLLED_SAMPLES' && !sampleDisclosure)) return NextResponse.json({ error: "Complete the sample declaration and disclosure." }, { status: 400 });

    if (audioFormat === "MP3" && !file.name.toLowerCase().endsWith(".mp3")) {
      return NextResponse.json({ error: "Invalid file format. MP3 expected." }, { status: 400 });
    }
    if (audioFormat === "WAV" && !file.name.toLowerCase().endsWith(".wav")) {
      return NextResponse.json({ error: "Invalid file format. WAV expected." }, { status: 400 });
    }

    const privateAudio = await localPrivateStorage.upload({ ownerUserId: result.user.id, assetType: "private_beat_deliverable", fileName: file.name, mimeType: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    const fileUrl = privateAudio.downloadPath;
    const previewUrl = preview instanceof File && preview.size ? await saveUploadedFile(preview, "beats/previews", "audio") : undefined;
    const artworkUrl = artwork instanceof File && artwork.size ? await saveUploadedFile(artwork, "beats/artwork", "image") : undefined;

    const beat = await createBeat({
      producerId: result.user.id,
      title,
      bpm,
      genre,
      mood,
      keySignature,
      price,
      generalPrice,
      exclusivePrice,
      description: String(formData.get("description") || "").trim(),
      subgenre: String(formData.get("subgenre") || "").trim(),
      tags: String(formData.get("tags") || "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 20),
      sampleDeclaration: sampleDeclaration as "NO_UNCONTROLLED_SAMPLES" | "CONTAINS_UNCONTROLLED_SAMPLES",
      sampleDisclosure: sampleDisclosure || null,
      fileUrl,
      previewUrl,
      artworkUrl,
      enabled: false
    });
    await prisma.storedAsset.update({ where: { id: privateAudio.id }, data: { beatId: beat.id } });

    const readiness = validateBeatReadiness({ title, bpm, genre, mood, keySignature, price, generalPrice, exclusivePrice, sampleDeclaration, sampleDisclosure, audioUrl: fileUrl, artworkUrl });
    await createAdminTaskOnce({ eventKey: `producer:${result.user.id}:beat:${beat.id}:review`, type: "Beat Awaiting Approval", priority: readiness.ready ? "normal" : "high", title: readiness.ready ? `Beat ready for review: ${title}` : `Beat needs corrections: ${title}`, body: readiness.ready ? "All required beat fields are present." : readiness.issues.map((issue) => issue.message).join(" "), href: `/admin?tab=beats&beatId=${beat.id}`, entityType: "beat", entityId: beat.id });

    return NextResponse.json({ beat, readiness, status: readiness.ready ? "pending_review" : "changes_requested" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


// vercel trigger 9
