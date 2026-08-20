export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { createProducerProfile, listProducerProfiles } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const producerProfiles = await listProducerProfiles();
  return NextResponse.json({ producerProfiles });
}

export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const formData = await request.formData();
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const specialty = String(formData.get("specialty") || "").trim();
    const active = String(formData.get("active") || "true") !== "false";
    const sortOrder = Number(formData.get("sortOrder") || 0) || undefined;
    const image = formData.get("image");
    const imageUrl = image instanceof File && image.size ? await saveUploadedFile(image, "producers", "image") : null;

    if (!name || !description || !specialty) {
      return NextResponse.json({ error: "Name, description, and specialty are required." }, { status: 400 });
    }

    const producerProfile = await createProducerProfile({ name, description, specialty, imageUrl, active, sortOrder });
    return NextResponse.json({ producerProfile }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create producer profile.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

