export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/storage";

function slugify(value: string, userId: number) {
  const base = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "producer";
  return `${base}-${userId}`;
}

export async function GET() {
  const result = await requireRole(["producer", "admin"]);
  if ("error" in result) return result.error;
  return NextResponse.json({ profile: await prisma.producerProfile.findUnique({ where: { userId: result.user.id } }) });
}

export async function PATCH(request: Request) {
  const result = await requireRole(["producer", "admin"]);
  if ("error" in result) return result.error;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const input: Record<string, unknown> = {};
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      for (const key of ["displayName", "bio", "location", "instagramUrl", "youtubeUrl", "spotifyUrl", "websiteUrl", "producerTags"]) input[key] = String(form.get(key) ?? "").trim();
      const cover = form.get("coverPhoto");
      const avatar = form.get("avatar");
      if (cover instanceof File && cover.size) input.coverPhotoUrl = await saveUploadedFile(cover, "producers/covers", "image");
      if (avatar instanceof File && avatar.size) input.avatarUrl = await saveUploadedFile(avatar, "producers/avatars", "image");
    } else Object.assign(input, await request.json());

    const displayName = String(input.displayName ?? "").trim();
    if (displayName.length < 2) return NextResponse.json({ error: "Producer display name is required." }, { status: 400 });
    const existing = await prisma.producerProfile.findUnique({ where: { userId: result.user.id }, select: { avatarUrl: true, coverPhotoUrl: true } });
    if (!(input.avatarUrl || existing?.avatarUrl) || !(input.coverPhotoUrl || existing?.coverPhotoUrl)) return NextResponse.json({ error: "Profile photo and cover photo are required to complete producer setup." }, { status: 400 });
    const tags = String(input.producerTags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
    const profile = await prisma.producerProfile.upsert({
      where: { userId: result.user.id },
      create: { userId: result.user.id, slug: slugify(displayName, result.user.id), displayName, bio: String(input.bio ?? ""), specialty: tags.join(", ") || "Music producer", coverPhotoUrl: input.coverPhotoUrl ? String(input.coverPhotoUrl) : null, avatarUrl: input.avatarUrl ? String(input.avatarUrl) : null, instagramUrl: input.instagramUrl ? String(input.instagramUrl) : null, youtubeUrl: input.youtubeUrl ? String(input.youtubeUrl) : null, spotifyUrl: input.spotifyUrl ? String(input.spotifyUrl) : null, websiteUrl: input.websiteUrl ? String(input.websiteUrl) : null, location: input.location ? String(input.location) : null, tags, status: "active", active: true },
      update: { displayName, bio: String(input.bio ?? ""), specialty: tags.join(", ") || "Music producer", ...(input.coverPhotoUrl ? { coverPhotoUrl: String(input.coverPhotoUrl) } : {}), ...(input.avatarUrl ? { avatarUrl: String(input.avatarUrl) } : {}), instagramUrl: input.instagramUrl ? String(input.instagramUrl) : null, youtubeUrl: input.youtubeUrl ? String(input.youtubeUrl) : null, spotifyUrl: input.spotifyUrl ? String(input.spotifyUrl) : null, websiteUrl: input.websiteUrl ? String(input.websiteUrl) : null, location: input.location ? String(input.location) : null, tags, status: "active", active: true }
    });
    await prisma.auditLog.create({ data: { actorId: result.user.id, action: "PRODUCER_PROFILE_UPDATED", entity: "producer_profile", entityId: String(profile.id), metadata: { userId: result.user.id } } });
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update producer profile." }, { status: 400 });
  }
}
// vercel trigger 7
