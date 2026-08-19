import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";
import { logAuditEvent } from "@/lib/audit-log";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const purchaseId = Number((await params).id);
  const purchase = await prisma.beatPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase || purchase.userId !== user.user.id || !purchase.hasAccess) return NextResponse.json({ error: "Beat purchase not found." }, { status: 404 });
  if (!purchase.licenseUrl) return NextResponse.json({ error: "The beat license must be generated before starting a release." }, { status: 409 });
  if (purchase.releaseId) return NextResponse.json({ releaseId: purchase.releaseId, href: `/distribution/start?draft=${purchase.releaseId}` });
  const beat = await prisma.beat.findUnique({ where: { id: purchase.beatId } });
  if (!beat) return NextResponse.json({ error: "Beat not found." }, { status: 404 });
  const producer = await prisma.user.findUnique({ where: { id: beat.userId } });
  const release = await prisma.$transaction(async (tx) => {
    const created = await tx.release.create({ data: {
      userId: user.user.id, title: beat.title, artistName: user.user.name, genre: beat.genre, releaseDate: new Date(), status: "DRAFT", releaseType: "single", paymentStatus: "pending",
      metadata: { mood: beat.mood, beatPurchaseId: purchase.id, license_receipt_url: purchase.licenseUrl, contentType: purchase.licenseType === "exclusive" ? "Exclusive Licensed" : "Non-Exclusive Licensed", beatTitle: beat.title, bpm: beat.bpm, musicalKey: beat.keySignature, producerCredit: producer?.name ?? `Producer #${beat.userId}`, licenseType: purchase.licenseType }
    } });
    await tx.track.create({ data: { releaseId: created.id, title: beat.title, trackNumber: 1, primaryArtist: user.user.name, metadata: { producers: producer?.name ?? `Producer #${beat.userId}`, bpm: beat.bpm, musicalKey: beat.keySignature } } });
    await tx.beatPurchase.update({ where: { id: purchase.id }, data: { releaseId: created.id } });
    return created;
  });
  await Promise.all([
    createNotificationOnce({ eventKey: `release:${release.id}:created_from_beat`, userId: user.user.id, title: "Release draft created", body: `Your ${beat.title} draft includes the beat license and producer credit.`, type: "release", href: `/distribution/start?draft=${release.id}`, actionLabel: "Continue release" }),
    logAuditEvent({ actorType: "user", actorId: user.user.id, entityType: "release", entityId: release.id, action: "release.created_from_beat", newValue: { beatPurchaseId: purchase.id } })
  ]);
  return NextResponse.json({ releaseId: release.id, href: `/distribution/start?draft=${release.id}` }, { status: 201 });
}
