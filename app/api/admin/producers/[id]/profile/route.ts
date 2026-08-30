export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/storage";

function slugify(value: string, userId: number) {
  const base = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "producer";
  return `${base}-${userId}`;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("users.manage");
  if ("error" in admin) return admin.error;

  const producerId = Number((await params).id);
  if (!Number.isInteger(producerId) || producerId <= 0) return NextResponse.json({ error: "Invalid producer account." }, { status: 400 });

  try {
    const form = await request.formData();
    const displayName = String(form.get("displayName") || "").trim();
    if (displayName.length < 2 || displayName.length > 80) return NextResponse.json({ error: "Display name must be between 2 and 80 characters." }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: producerId }, select: { id: true, role: true, producerProfile: true } });
    if (!user || user.role !== "PRODUCER") return NextResponse.json({ error: "Producer account not found." }, { status: 404 });

    const avatar = form.get("avatar");
    const coverPhoto = form.get("coverPhoto");
    const avatarUrl = avatar instanceof File && avatar.size ? await saveUploadedFile(avatar, "producers/avatars", "image") : undefined;
    const coverPhotoUrl = coverPhoto instanceof File && coverPhoto.size ? await saveUploadedFile(coverPhoto, "producers/covers", "image") : undefined;
    const storefrontComplete = Boolean((avatarUrl || user.producerProfile?.avatarUrl) && (coverPhotoUrl || user.producerProfile?.coverPhotoUrl));
    const nextStatus = ["suspended", "disabled"].includes(user.producerProfile?.status || "") ? user.producerProfile!.status : storefrontComplete ? "active" : "pending_setup";
    const profile = await prisma.producerProfile.upsert({
      where: { userId: producerId },
      create: {
        userId: producerId,
        slug: slugify(displayName, producerId),
        displayName,
        bio: "",
        specialty: "Music producer",
        avatarUrl: avatarUrl ?? null,
        coverPhotoUrl: coverPhotoUrl ?? null,
        status: avatarUrl && coverPhotoUrl ? "active" : "pending_setup",
        active: true,
      },
      update: {
        displayName,
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(coverPhotoUrl ? { coverPhotoUrl } : {}),
        status: nextStatus,
        active: nextStatus !== "disabled",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: "sub" in admin ? Number(admin.sub) || null : null,
        action: "PRODUCER_PUBLIC_PROFILE_UPDATED_BY_ADMIN",
        entity: "producer_profile",
        entityId: String(profile.id),
        metadata: { producerUserId: producerId, displayName, avatarUpdated: Boolean(avatarUrl), coverPhotoUpdated: Boolean(coverPhotoUrl) },
      },
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update producer profile." }, { status: 400 });
  }
}
