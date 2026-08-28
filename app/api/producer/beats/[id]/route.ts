import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { updateBeat, deleteBeat } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { beatMutationSchema } from "@/lib/validation";
import { createAdminTaskOnce } from "@/lib/task-queue";
import { Prisma } from "@prisma/client";
import { localPrivateStorage } from "@/lib/private-storage";
import { deleteUploadedFileByUrl } from "@/lib/storage";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole(["producer", "admin"]);
  if ("error" in result) return result.error;

  const { id } = await params;
  const beatId = Number(id);
  
  if (!Number.isInteger(beatId) || beatId <= 0) return NextResponse.json({ error: "Invalid beat identifier." }, { status: 400 });
  const prismaBeat = await prisma.beat.findUnique({ where: { id: beatId } });
  if (!prismaBeat) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
  
  if (result.user.role === "producer" && prismaBeat.userId !== result.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = beatMutationSchema.parse(await request.json());
    if (result.user.role === "producer" && payload.enabled === true && prismaBeat.status !== "PUBLISHED") return NextResponse.json({ error: "This beat must be approved before it can be enabled." }, { status: 409 });
    const updated = await updateBeat(beatId, payload);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update beat in database." }, { status: 500 });
    }
    const metadataChanged = result.user.role === "producer" && [payload.title, payload.bpm, payload.genre, payload.mood, payload.price, payload.generalPrice, payload.exclusivePrice, payload.description, payload.subgenre, payload.tags, payload.sampleDeclaration, payload.sampleDisclosure].some((value) => value !== undefined);
    if (metadataChanged) {
      await prisma.beat.update({ where: { id: beatId }, data: { status: "PENDING_REVIEW", enabled: false, reviewIssues: Prisma.JsonNull } });
      await createAdminTaskOnce({ eventKey: `producer:${result.user.id}:beat:${beatId}:review`, type: "Beat Awaiting Approval", priority: "normal", title: `Updated beat ready for review: ${updated.title}`, body: "Producer updated beat metadata. Review the current files and fields.", href: `/admin?tab=beats&beatId=${beatId}`, entityType: "beat", entityId: beatId });
      return NextResponse.json({ beat: { ...updated, status: "PENDING_REVIEW", enabled: false, reviewIssues: null } });
    }
    return NextResponse.json({ beat: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole(["producer", "admin"]);
  if ("error" in result) return result.error;

  const { id } = await params;
  const beatId = Number(id);
  
  if (!Number.isInteger(beatId) || beatId <= 0) return NextResponse.json({ error: "Invalid beat identifier." }, { status: 400 });
  const prismaBeat = await prisma.beat.findUnique({ where: { id: beatId }, include: { audio: true, preview: true, artwork: true, deliverableAsset: true } });
  if (!prismaBeat) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
  
  if (result.user.role === "producer" && prismaBeat.userId !== result.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const [purchaseCount, saleCount] = await Promise.all([
      prisma.beatPurchase.count({ where: { beatId } }),
      prisma.beatSale.count({ where: { beatId } })
    ]);
    if (purchaseCount > 0 || saleCount > 0) {
      const archived = await prisma.beat.update({ where: { id: beatId }, data: { enabled: false, status: "ARCHIVED" } });
      await prisma.auditLog.create({ data: { actorId: result.user.id, action: "BEAT_ARCHIVED", entity: "beat", entityId: String(beatId), metadata: { purchaseCount, saleCount } } });
      return NextResponse.json({ success: true, archived: true, beat: archived });
    }
    if (prismaBeat.deliverableAsset) await localPrivateStorage.delete({ assetId: prismaBeat.deliverableAsset.id, requesterUserId: result.user.id, isAdmin: result.user.role === "admin" });
    await Promise.all([deleteUploadedFileByUrl(prismaBeat.preview?.publicUrl), deleteUploadedFileByUrl(prismaBeat.artwork?.publicUrl)]);
    const uploadIds = [prismaBeat.audioUploadId, prismaBeat.previewUploadId, prismaBeat.artworkUploadId].filter((value): value is number => Number.isInteger(value));
    await deleteBeat(beatId);
    if (uploadIds.length) await prisma.upload.deleteMany({ where: { id: { in: uploadIds } } });
    await prisma.auditLog.create({ data: { actorId: result.user.id, action: "BEAT_DRAFT_DELETED", entity: "beat", entityId: String(beatId) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger 7
