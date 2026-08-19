import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { listAllBeats, updateBeat, deleteBeat } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { beatMutationSchema } from "@/lib/validation";
import { createAdminTaskOnce } from "@/lib/task-queue";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRole(["producer", "admin"]);
  if ("error" in result) return result.error;

  const { id } = await params;
  const beatId = Number(id);
  
  const prismaBeat = await prisma.beat.findUnique({ where: { id: beatId } });
  if (!prismaBeat) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
  
  if (result.user.role === "producer" && prismaBeat.userId !== result.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = beatMutationSchema.parse(await request.json());
    if (result.user.role === "producer" && payload.enabled === true && prismaBeat.status !== "APPROVED") return NextResponse.json({ error: "This beat must be approved before it can be enabled." }, { status: 409 });
    const updated = await updateBeat(beatId, payload);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update beat in database." }, { status: 500 });
    }
    const metadataChanged = result.user.role === "producer" && [payload.title, payload.bpm, payload.genre, payload.mood, payload.price].some((value) => value !== undefined);
    if (metadataChanged) {
      await prisma.beat.update({ where: { id: beatId }, data: { status: "PENDING_REVIEW", enabled: false, reviewIssues: undefined } });
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
  
  const prismaBeat = await prisma.beat.findUnique({ where: { id: beatId } });
  if (!prismaBeat) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
  
  if (result.user.role === "producer" && prismaBeat.userId !== result.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    await deleteBeat(beatId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

