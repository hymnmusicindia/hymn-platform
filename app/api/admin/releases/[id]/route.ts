import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const PROVIDER_DELIVERED_STATUSES = new Set([
  "SENT", "SENT_TO_DISTRIBUTOR", "DISTRIBUTOR_PROCESSING", "PROCESSING",
  "SCHEDULED", "AWAITING_LIVE_CONFIRMATION", "PARTIALLY_LIVE", "DELIVERED", "LIVE"
]);

/** Archives a release in HYMN only. DireNote has no cancellation endpoint in this integration. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("releases.override");
  if ("error" in admin) return admin.error;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid release id." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { confirmation?: string; reason?: string };
  if (body.confirmation !== "DELETE") return NextResponse.json({ error: "Type DELETE to archive this release." }, { status: 400 });

  const release = await prisma.release.findUnique({ where: { id }, select: { id: true, title: true, status: true, archivedAt: true, distributionSubmissions: { select: { id: true }, take: 1 } } });
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  if (release.archivedAt) return NextResponse.json({ release, alreadyArchived: true });

  const providerDelivered = PROVIDER_DELIVERED_STATUSES.has(release.status);
  const archived = await prisma.$transaction(async tx => {
    const updated = await tx.release.update({ where: { id }, data: { archivedAt: new Date() } });
    await tx.auditLog.create({ data: {
      actorType: "admin", actorId: "sub" in admin ? admin.sub : null, action: "RELEASE_ARCHIVED_BY_ADMIN",
      entity: "release", entityId: String(id), metadata: {
        reason: body.reason?.trim() || null, providerDelivered,
        warning: providerDelivered ? "Archived in HYMN only; this does not cancel DireNote processing." : null
      }
    } });
    return updated;
  });
  return NextResponse.json({ release: archived, providerDelivered, warning: providerDelivered ? "This release was archived in HYMN only. DireNote processing may continue." : null });
}
