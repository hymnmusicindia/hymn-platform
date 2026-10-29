export const runtime = "nodejs";
import {autoPublishProducerBeat} from "@/lib/beat-publication";

import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { createBeat, listAllBeats } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";
import { localPrivateStorage } from "@/lib/private-storage";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let result = await requireAdminPermission("users.read");
  if ("error" in result) result = await requireAdminPermission("services.manage");
  if ("error" in result) return result.error;

  const beats = await listAllBeats();
  return NextResponse.json({ beats });
}

export async function POST(request: Request) {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;

  try {
    const formData = await request.formData();
    if(formData.get("sampleRightsConfirmed")!=="on"||formData.get("sampleDeclaration")!=="NO_UNCONTROLLED_SAMPLES")return NextResponse.json({error:"Confirm this is fully original material. Sampled beats must use the producer submission with a sample certificate."},{status:400});
    const title = String(formData.get("title") || "").trim();
    const bpm = Number(formData.get("bpm"));
    const genre = String(formData.get("genre") || "").trim();
    const mood = String(formData.get("mood" ) || "").trim();
    const price = Number(formData.get("price"));
    const generalPrice = Number(formData.get("generalPrice") || price);
    const stemPrice = Number(formData.get("stemPrice") || generalPrice);
    const exclusivePrice = Number(formData.get("exclusivePrice") || Math.max(stemPrice, generalPrice) * 4);
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
      generalPrice,
      stemPrice,
      exclusivePrice,
      fileUrl,
      artworkUrl,
      sampleDeclaration:"NO_UNCONTROLLED_SAMPLES",
      enabled: false
    });
    await prisma.storedAsset.update({ where: { id: privateAudio.id }, data: { beatId: beat.id } });

    await prisma.auditLog.create({data:{actorType:"admin",actorId:"sub" in result?Number(result.sub):null,entity:"beat",entityId:String(beat.id),action:"beat.sample_rights_declared",metadata:{sampleDeclaration:"NO_UNCONTROLLED_SAMPLES",source:"admin_original_upload"}}});
    const published=await autoPublishProducerBeat(beat.id).catch(()=>false);
    return NextResponse.json({ beat:{...beat,status:published?"PUBLISHED":beat.status,enabled:published},status:published?"published":"pending_review" }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


// vercel trigger 3
// vercel trigger 9
