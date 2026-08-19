export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { deleteProducerProfile, updateProducerProfile } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const formData = await request.formData();
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const specialty = String(formData.get("specialty") || "").trim();
    const active = String(formData.get("active") || "true") !== "false";
    const sortOrder = Number(formData.get("sortOrder") || 0) || undefined;
    const image = formData.get("image");
    const imageUrl = image instanceof File && image.size ? await saveUploadedFile(image, "producers", "image") : undefined;

    const producerProfile = await updateProducerProfile(Number(id), {
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(specialty ? { specialty } : {}),
      ...(typeof imageUrl !== "undefined" ? { imageUrl } : {}),
      active,
      ...(sortOrder ? { sortOrder } : {})
    });

    if (!producerProfile) return NextResponse.json({ error: "Producer profile not found." }, { status: 404 });
    return NextResponse.json({ producerProfile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update producer profile.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;

  const { id } = await params;
  const removed = await deleteProducerProfile(Number(id));
  if (!removed) return NextResponse.json({ error: "Producer profile not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
// vercel trigger 9
