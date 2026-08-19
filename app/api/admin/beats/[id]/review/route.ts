import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { validateBeatReadiness } from "@/lib/beat-readiness";
import { createNotificationOnce } from "@/lib/notifications";
import { resolveAdminTask } from "@/lib/task-queue";
import { logAuditEvent } from "@/lib/audit-log";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); if ("error" in admin) return admin.error;
  const id = Number((await params).id); const body = await request.json().catch(() => ({}));
  if (body.decision !== "approved" && body.decision !== "changes_requested") return NextResponse.json({ error: "Choose approved or changes_requested." }, { status: 400 });
  const beat = await prisma.beat.findUnique({ where: { id }, include: { audio: true, artwork: true } });
  if (!beat) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
  const readiness = validateBeatReadiness({ ...beat, price: beat.priceCents / 100, audioUrl: beat.audio?.publicUrl ?? undefined, artworkUrl: beat.artwork?.publicUrl ?? undefined });
  if (body.decision === "approved" && !readiness.ready) return NextResponse.json({ error: "Incomplete beat cannot be approved.", readiness }, { status: 400 });
  if (body.decision === "changes_requested" && !String(body.reason ?? "").trim()) return NextResponse.json({ error: "A correction reason is required." }, { status: 400 });
  const updated = await prisma.beat.update({ where: { id }, data: { status: body.decision === "approved" ? "APPROVED" : "CHANGES_REQUESTED", enabled: body.decision === "approved", reviewIssues: body.decision === "approved" ? undefined : { reason: String(body.reason), issues: readiness.issues } } });
  await Promise.all([
    createNotificationOnce({ eventKey: `producer:${beat.userId}:beat:${beat.id}:${body.decision}`, userId: beat.userId, title: body.decision === "approved" ? "Beat approved" : "Beat changes requested", body: body.decision === "approved" ? `${beat.title} is approved for the Beat Store.` : String(body.reason), type: "beat", href: "/producer/dashboard?tab=manage", actionLabel: "Manage beat" }),
    resolveAdminTask(`producer:${beat.userId}:beat:${beat.id}:review`, `Beat ${body.decision}.`),
    logAuditEvent({ actorType: "admin", actorId: "sub" in admin ? admin.sub : null, entityType: "beat", entityId: id, action: `beat.${body.decision}`, oldValue: { status: beat.status, enabled: beat.enabled }, newValue: { status: updated.status, enabled: updated.enabled }, metadata: { reason: body.reason ?? null } })
  ]);
  return NextResponse.json({ beat: updated, readiness });
}
