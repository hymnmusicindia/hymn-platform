export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { attachBeatAssets, createBeat, deleteBeat, listBeatsByProducer, updateBeat } from "@/lib/db";
import { deleteUploadedFileByUrl, saveUploadedFile } from "@/lib/storage";
import { localPrivateStorage } from "@/lib/private-storage";
import { beatAssetRelativePath } from "@/lib/storage-service";
import { validateBeatReadiness } from "@/lib/beat-readiness";
import { createAdminTaskOnce } from "@/lib/task-queue";
import { prisma } from "@/lib/prisma";
import { producerSetup } from "@/lib/producer-setup";
import { beatMutationSchema } from "@/lib/validation";
import { autoPublishProducerBeat } from '@/lib/beat-publication';
import { normalizeBeatKey, normalizeBeatMoods } from '@/lib/beat-metadata';

function normalizedAudioMime(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "mp3" && ["", "audio/mp3", "audio/mpeg"].includes(file.type)) return "audio/mpeg";
  if (extension === "wav" && ["", "audio/wav", "audio/wave", "audio/x-wav"].includes(file.type)) return "audio/wav";
  return file.type;
}

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

  let createdBeatId: number | null = null;
  let privateAudioAssetId: number | null = null;
  let privateEvidenceAssetId: number | null = null;
  let previewUrl: string | undefined;
  let artworkUrl: string | undefined;
  let finalized = false;
  try {
    const profile = await prisma.producerProfile.findUnique({ where: { userId: result.user.id } });
    const setup = producerSetup(profile, []);
    if (!setup.storefrontReady) return NextResponse.json({ error: setup.restricted ? "Your producer account needs review. Contact HYMN support." : "Complete your storefront name, profile image and cover before uploading your first beat.", href: "/producer/dashboard?tab=profile" }, { status: setup.restricted ? 403 : 409 });
    const formData = await request.formData();
    const title = String(formData.get("title") || "").trim();
    const bpm = Number(formData.get("bpm"));
    const genre = String(formData.get("genre") || "").trim();
    const mood = normalizeBeatMoods(String(formData.get("mood") || ''));
    const keySignature = normalizeBeatKey(String(formData.get("keySignature") || ''));
    const price = Number(formData.get("price"));
    const generalPrice = Number(formData.get("generalPrice") || price);
    const stemPrice = Number(formData.get("stemPrice") || generalPrice);
    const exclusivePrice = Number(formData.get("exclusivePrice"));
    beatMutationSchema.parse({ price, generalPrice, stemPrice, exclusivePrice, mood, keySignature });
    const file = formData.get("file");
    const preview = formData.get("preview");
    const artwork = formData.get("artwork");
    const audioFormat = String(formData.get("audioFormat") || "").trim();
    const masterMime = file instanceof File ? normalizedAudioMime(file) : "";

    const sampleDeclaration = String(formData.get("sampleDeclaration") || "");
    let sampleDisclosure = String(formData.get("sampleDisclosure") || "").trim();
    const evidence = formData.get('sampleLicenseEvidence');
    if (sampleDeclaration === 'LICENSED_SAMPLES' && (!(evidence instanceof File) || !evidence.size || evidence.type !== 'application/pdf' || evidence.size > 10 * 1024 * 1024)) return NextResponse.json({error:'Upload a sample licence or certificate as a PDF (up to 10 MB).'},{status:400});
    if (formData.get('sampleRightsConfirmed') !== 'on') return NextResponse.json({error:'Confirm the sample rights declaration before submitting.'},{status:400});
    if (!title || !genre || !mood || !Number.isFinite(bpm) || bpm < 40 || bpm > 300 || !Number.isFinite(generalPrice) || !Number.isFinite(stemPrice) || !Number.isFinite(exclusivePrice) || exclusivePrice <= Math.max(generalPrice, stemPrice) || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing required beat fields." }, { status: 400 });
    }
    beatMutationSchema.parse({ sampleDeclaration, sampleDisclosure });
    if (!sampleDeclaration) return NextResponse.json({ error: 'Complete the sample declaration.' }, { status: 400 });

    if (audioFormat === "MP3" && !file.name.toLowerCase().endsWith(".mp3")) {
      return NextResponse.json({ error: "Invalid file format. MP3 expected." }, { status: 400 });
    }
    if (audioFormat === "WAV" && !file.name.toLowerCase().endsWith(".wav")) {
      return NextResponse.json({ error: "Invalid file format. WAV expected." }, { status: 400 });
    }
    if (!['audio/mpeg', 'audio/wav'].includes(masterMime)) return NextResponse.json({ error: "The master must be a genuine WAV or MP3 audio file." }, { status: 400 });
    if (preview instanceof File && preview.size && (!preview.name.toLowerCase().endsWith(".mp3") || normalizedAudioMime(preview) !== "audio/mpeg")) return NextResponse.json({ error: "The public preview must be an MP3 file." }, { status: 400 });

    const beatDraft = await createBeat({
      producerId: result.user.id,
      title,
      bpm,
      genre,
      mood,
      keySignature,
      price,
      generalPrice,
      stemPrice,
      exclusivePrice,
      description: String(formData.get("description") || "").trim(),
      subgenre: String(formData.get("subgenre") || "").trim(),
      tags: String(formData.get("tags") || "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 20),
      sampleDeclaration: sampleDeclaration as "NO_UNCONTROLLED_SAMPLES" | "LICENSED_SAMPLES" | "CONTAINS_UNCONTROLLED_SAMPLES",
      sampleDisclosure: sampleDisclosure || null,
      fileUrl: "",
      enabled: false
    });
    createdBeatId = beatDraft.id;
    if (sampleDeclaration === 'LICENSED_SAMPLES' && evidence instanceof File) {
      const stored = await localPrivateStorage.upload({ownerUserId:result.user.id,assetType:'private_ownership_proof',fileName:evidence.name,mimeType:'application/pdf',bytes:Buffer.from(await evidence.arrayBuffer())});
      privateEvidenceAssetId = stored.id;
      await prisma.storedAsset.update({where:{id:stored.id},data:{entityType:'BEAT',entityId:String(beatDraft.id),category:'BEAT_SAMPLE_LICENSE'}});
      sampleDisclosure += `\nLicence evidence: ${stored.downloadPath}`;
      await updateBeat(beatDraft.id,{sampleDisclosure});
    }

    const masterBytes = Buffer.from(await file.arrayBuffer());
    const privateAudio = await localPrivateStorage.upload({ ownerUserId: result.user.id, ownerName: result.user.name, beatId: beatDraft.id, beatTitle: title, assetType: "private_beat_deliverable", fileName: file.name, mimeType: masterMime, bytes: masterBytes });
    privateAudioAssetId = privateAudio.id;
    const previewPath = preview instanceof File && preview.size ? beatAssetRelativePath({ producerName: result.user.name, producerId: result.user.id, beatTitle: title, beatId: beatDraft.id, assetName: "Preview Audio", originalFilename: preview.name, mimeType: preview.type }) : null;
    const artworkPath = artwork instanceof File && artwork.size ? beatAssetRelativePath({ producerName: result.user.name, producerId: result.user.id, beatTitle: title, beatId: beatDraft.id, assetName: "Cover Art", originalFilename: artwork.name, mimeType: artwork.type }) : null;
    previewUrl = preview instanceof File && preview.size && previewPath ? await saveUploadedFile(preview, previewPath.slice(0, previewPath.lastIndexOf("/")), "audio") : undefined;
    artworkUrl = artwork instanceof File && artwork.size && artworkPath ? await saveUploadedFile(artwork, artworkPath.slice(0, artworkPath.lastIndexOf("/")), "image") : undefined;

    const beat = await attachBeatAssets({
      beatId: beatDraft.id,
      producerId: result.user.id,
      audio: { url: privateAudio.downloadPath, storageKey: beatAssetRelativePath({ producerName: result.user.name, producerId: result.user.id, beatTitle: title, beatId: beatDraft.id, assetName: "Master Audio", originalFilename: file.name, mimeType: masterMime }), fileName: file.name, mimeType: masterMime, sizeBytes: privateAudio.byteSize, checksum: privateAudio.checksum },
      preview: preview instanceof File && preview.size && previewUrl ? { url: previewUrl, storageKey: previewUrl, fileName: preview.name, mimeType: preview.type, sizeBytes: preview.size } : undefined,
      artwork: artwork instanceof File && artwork.size && artworkUrl ? { url: artworkUrl, storageKey: artworkUrl, fileName: artwork.name, mimeType: artwork.type, sizeBytes: artwork.size } : undefined
    });
    if (!beat) throw new Error("The beat draft could not be finalized. No incomplete beat was kept.");
    finalized = true;
    await prisma.auditLog.create({data:{actorId:result.user.id,actorType:'user',entity:'beat',entityId:String(beat.id),action:'beat.sample_rights_declared',metadata:{sampleDeclaration,sampleDisclosure,statement:'I confirm my declaration is accurate and that any stated licence covers my use and the rights offered to buyers. I will provide licence evidence on request.'}}});

    const readiness = validateBeatReadiness({ title, bpm, genre, mood, keySignature, price, generalPrice, stemPrice, exclusivePrice, sampleDeclaration, sampleDisclosure, audioUrl: privateAudio.downloadPath, artworkUrl });
    const published = readiness.ready && await autoPublishProducerBeat(beat.id);
    if (published) return NextResponse.json({ beat: { ...beat, status:'PUBLISHED', enabled:true }, readiness, status:'published' }, { status:201 });
    await createAdminTaskOnce({ eventKey: `producer:${result.user.id}:beat:${beat.id}:review`, type: "Beat Awaiting Approval", priority: readiness.ready ? "normal" : "high", title: readiness.ready ? `Beat ready for review: ${title}` : `Beat needs corrections: ${title}`, body: readiness.ready ? "All required beat fields are present." : readiness.issues.map((issue) => issue.message).join(" "), href: `/admin?tab=beats&beatId=${beat.id}`, entityType: "beat", entityId: beat.id }).catch((taskError) => console.error("Beat review task creation failed", { beatId: beat.id, taskError }));

    return NextResponse.json({ beat, readiness, status: readiness.ready ? "pending_review" : "changes_requested" }, { status: 201 });
  } catch (error) {
    if (!finalized) {
      if (privateEvidenceAssetId) await localPrivateStorage.delete({assetId:privateEvidenceAssetId,requesterUserId:result.user.id,isAdmin:result.user.role==='admin'}).catch(()=>undefined);
      if (privateAudioAssetId) await localPrivateStorage.delete({ assetId: privateAudioAssetId, requesterUserId: result.user.id, isAdmin: result.user.role === "admin" }).catch(() => undefined);
      await Promise.all([deleteUploadedFileByUrl(previewUrl), deleteUploadedFileByUrl(artworkUrl)]);
      if (createdBeatId) await deleteBeat(createdBeatId).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Could not create beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


// vercel trigger 9
