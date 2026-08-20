export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { getSiteSettings, updateSiteSettings } from "@/lib/db";
import { saveUploadedFile } from "@/lib/storage";

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const siteSettings = await getSiteSettings();
  return NextResponse.json({ siteSettings });
}

export async function PATCH(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const formData = await request.formData();
    const image = formData.get("homeHeroImage");
    const heroImageUrl = image instanceof File && image.size ? await saveUploadedFile(image, "site/home-hero", "image") : String(formData.get("homeHeroImageUrl") || "").trim() || null;
    const siteSettings = await updateSiteSettings({ homeHeroImageUrl: heroImageUrl });
    return NextResponse.json({ siteSettings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update site settings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

