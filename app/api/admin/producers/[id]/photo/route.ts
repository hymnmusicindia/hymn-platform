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
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;

  const { id } = await params;
  const producerId = Number(id);

  try {
    const formData = await request.formData();
    const avatar = formData.get("avatar") || formData.get("photo");
    if (!(avatar instanceof File) || !avatar.size) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    const avatarUrl = await saveUploadedFile(avatar, "producers/avatars", "image");

    const user = await prisma.user.findUnique({ where: { id: producerId } });
    if (!user) {
      return NextResponse.json({ error: "Producer account not found." }, { status: 404 });
    }

    const profile = await prisma.producerProfile.upsert({
      where: { userId: producerId },
      create: {
        userId: producerId,
        slug: slugify(user.name || "producer", producerId),
        displayName: user.name || "Music Producer",
        bio: "",
        specialty: "Music producer",
        avatarUrl,
        status: "active",
        active: true
      },
      update: {
        avatarUrl
      }
    });

    await prisma.auditLog.create({
      data: {
        actorId: ("sub" in result ? Number(result.sub) || 0 : ("id" in result ? Number((result as Record<string, unknown>).id) || 0 : 0)),
        action: "PRODUCER_PHOTO_UPDATED_BY_ADMIN",
        entity: "producer_profile",
        entityId: String(profile.id),
        metadata: { producerUserId: producerId, avatarUrl }
      }
    });

    return NextResponse.json({ success: true, profile, avatarUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update producer photo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
