import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("users.read");
  if ("error" in admin) return admin.error;
  const id = Number((await context.params).id);
  const contributor = await prisma.contributorParty.findUnique({
    where: { id },
    select: {
      id: true, publicId: true, partyType: true, professionalName: true, displayName: true, country: true, identityState: true, verifiedAt: true, createdAt: true, updatedAt: true,
      claimedBy: { select: { id: true, name: true, role: true, status: true } }, producerProfile: true, externalIdentifiers: true, nameHistory: { orderBy: { createdAt: "desc" }, take: 50 },
      contributions: { include: { track: { select: { id: true, title: true, isrc: true, release: { select: { id: true, title: true, artistName: true, status: true, releaseDate: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 },
      beats: { select: { id: true, title: true, status: true, enabled: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 },
      splitRecipients: { select: { id: true, releaseId: true, trackId: true, role: true, sharePercent: true, inviteStatus: true }, take: 100 },
      mergeSources: true, mergeTargets: true
    }
  });
  if (!contributor) return NextResponse.json({ error: "Contributor identity not found." }, { status: 404 });
  const activity = await prisma.auditLog.findMany({ where: { entity: "contributor_party", entityId: String(id) }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({ contributor, activity });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("users.manage");
  if ("error" in admin) return admin.error;
  const id = Number((await context.params).id);
  const body = await request.json();
  const current = await prisma.contributorParty.findFirst({ where: { id, mergedIntoId: null } });
  if (!current) return NextResponse.json({ error: "Contributor identity not found." }, { status: 404 });
  const professionalName = String(body.professionalName ?? current.professionalName).trim();
  if (professionalName.length < 2) return NextResponse.json({ error: "Professional name is required." }, { status: 400 });
  const verify = body.identityState === "VERIFIED";
  const actorId = "sub" in admin ? Number(admin.sub) : null;
  const updated = await prisma.$transaction(async (tx) => {
    if (professionalName !== current.professionalName) await tx.contributorNameHistory.create({ data: { partyId: id, professionalName, displayName: professionalName, changedByUserId: actorId, reason: String(body.reason ?? "Admin identity update") } });
    const party = await tx.contributorParty.update({ where: { id }, data: { professionalName, displayName: professionalName, ...(verify ? { identityState: "VERIFIED", verifiedAt: new Date() } : {}) } });
    await tx.auditLog.create({ data: { actorId, actorType: "admin", actorRole: "identity_manager", entity: "contributor_party", entityId: String(id), action: verify ? "contributor.verified" : "contributor.profile_updated", previousValue: { professionalName: current.professionalName, identityState: current.identityState }, newValue: { professionalName: party.professionalName, identityState: party.identityState }, reason: String(body.reason ?? "").trim() || null } });
    return party;
  });
  return NextResponse.json({ contributor: updated });
}
