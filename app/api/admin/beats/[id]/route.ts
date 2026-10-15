import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { updateBeat } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { isSameAppOrigin } from "@/lib/request-origin";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("users.manage");
  if ("error" in admin) return admin.error;
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid beat identifier." }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== "DELETE") return NextResponse.json({ error: "Confirm beat removal." }, { status: 400 });
  // Recoverable removal preserves purchased licences, order references and files.
  const removed = await prisma.$transaction(async tx => {
    const beat = await tx.beat.findUnique({ where: { id } });
    if (!beat) return null;
    await tx.beat.update({ where: { id }, data: { enabled: false, status: "ARCHIVED" } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId: "sub" in admin ? Number(admin.sub) : null, action: "BEAT_ADMIN_REMOVED", entity: "beat", entityId: String(id), metadata: { title: beat.title, previousStatus: beat.status, previousEnabled: beat.enabled, recoverable: true } } });
    return { id };
  });
  return removed ? NextResponse.json({ success: true, archived: true }) : NextResponse.json({ error: "Beat not found." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const payload = (await request.json()) as { enabled?: boolean };
    if (typeof payload.enabled !== "boolean") {
      return NextResponse.json({ error: "Missing enabled flag." }, { status: 400 });
    }

    const beat = await updateBeat(Number(id), { enabled: payload.enabled });
    if (!beat) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
    return NextResponse.json({ beat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update beat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
// vercel trigger 9
