import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { deliverReleaseOutbox, queueReleaseStatusUpdate } from "@/lib/email/release-outbox";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("releases.review");
  if ("error" in admin) return admin.error;

  const allowedOrigins = new Set([new URL(request.url).origin, getPublicAppUrl(request.url)]);
  if (!allowedOrigins.has(request.headers.get("origin") ?? "")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const releaseId = Number((await params).id);
  if (!Number.isSafeInteger(releaseId) || releaseId < 1) return NextResponse.json({ error: "Invalid release." }, { status: 400 });
  const body = await request.json().catch(() => null) as { trackId?: unknown } | null;
  const trackId = Number(body?.trackId);
  if (!Number.isSafeInteger(trackId) || trackId < 1) return NextResponse.json({ error: "Select a valid track." }, { status: 400 });

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true, status: true, archivedAt: true, correctionReason: true, direNoteStatus: true,
      metadata: true, tracks: { where: { id: trackId }, select: { id: true, title: true, trackNumber: true } },
      user: { select: { status: true } }
    }
  });
  if (!release || release.archivedAt || !release.tracks.length) return NextResponse.json({ error: "Release track not found." }, { status: 404 });
  if (release.status !== "CHANGES_REQUESTED" || release.user.status !== "ACTIVE") {
    return NextResponse.json({ error: "A correction email is available only while this release is awaiting the artist’s correction." }, { status: 409 });
  }
  const metadata = release.metadata && typeof release.metadata === "object" && !Array.isArray(release.metadata) ? release.metadata as Record<string, unknown> : {};
  const direNote = metadata.direNote && typeof metadata.direNote === "object" && !Array.isArray(metadata.direNote) ? metadata.direNote as Record<string, unknown> : {};
  const providerMessages = Array.isArray(direNote.correctionMessages) ? direNote.correctionMessages.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  if (!release.correctionReason?.trim() && !providerMessages.length) return NextResponse.json({ error: "No correction details are saved for this release." }, { status: 409 });

  const actorId = "sub" in admin ? Number(admin.sub) : null;
  const track = release.tracks[0];
  const requestAudit = await prisma.auditLog.create({ data: {
    actorId, actorType: "admin", action: "MANUAL_RELEASE_CORRECTION_EMAIL_REQUESTED", entity: "release", entityId: String(releaseId),
    metadata: { trackId: track.id, trackNumber: track.trackNumber, trackTitle: track.title, source: "admin_release_track" }
  } });
  try {
    const reminderKey = `manual-${track.id}-${randomUUID()}`;
    const emailLogId = await queueReleaseStatusUpdate(prisma, releaseId, "changes_requested", reminderKey);
    if (!emailLogId) return NextResponse.json({ error: "The correction email could not be queued." }, { status: 409 });
    const delivery = await deliverReleaseOutbox(undefined, 1, undefined, [emailLogId]);
    const emailLog = await prisma.emailLog.findUnique({ where: { id: emailLogId }, select: { status: true } });
    const status = emailLog?.status === "sent" ? "sent" : emailLog?.status === "review" ? "review" : "queued";
    const resultAudit = await prisma.auditLog.create({ data: {
      actorId, actorType: "admin", action: "MANUAL_RELEASE_CORRECTION_EMAIL_FINISHED", entity: "release", entityId: String(releaseId),
      metadata: { requestAuditId: requestAudit.id, trackId: track.id, emailLogId, status, delivery }
    } }).then(() => true).catch(() => false);
    return NextResponse.json({ success: status === "sent" || status === "queued", status, message: status === "sent" ? "Correction email sent." : status === "review" ? "Email delivery needs review; it was not automatically resent." : "Correction email queued and will send when SMTP is available.", auditRecorded: resultAudit });
  } catch {
    await prisma.auditLog.create({ data: {
      actorId, actorType: "admin", action: "MANUAL_RELEASE_CORRECTION_EMAIL_FAILED", entity: "release", entityId: String(releaseId),
      metadata: { requestAuditId: requestAudit.id, trackId: track.id, state: "failed" }
    } }).catch(() => undefined);
    return NextResponse.json({ error: "The correction email could not be queued. Check the release email log before retrying." }, { status: 502 });
  }
}
