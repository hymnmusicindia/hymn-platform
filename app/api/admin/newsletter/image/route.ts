import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireRecentAdminPermission } from "@/lib/access";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { saveUploadedFile } from "@/lib/storage";

const allowedTypes = new Set(["image/jpeg", "image/png"]);
const maxInputBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const admin = await requireRecentAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Use a JPG or PNG image." }, { status: 400 });
    if (file.size > maxInputBytes) return NextResponse.json({ error: "The source image must be 5 MB or smaller." }, { status: 400 });
    const input = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(input).metadata();
    const width = metadata.width || 0; const height = metadata.height || 0;
    if (width < 600 || height < 200) return NextResponse.json({ error: "Use an image at least 600 × 200 pixels." }, { status: 400 });
    const ratio = width / height;
    if (ratio < 1 || ratio > 3.5) return NextResponse.json({ error: "Use an image between square and 3.5:1 landscape." }, { status: 400 });
    const output = await sharp(input).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).flatten({ background: "#101114" }).jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer();
    const saved = await saveUploadedFile(new File([output], "newsletter-image.jpg", { type: "image/jpeg" }), "site/newsletter", "image");
    return NextResponse.json({ image: { url: `${getPublicAppUrl()}${saved}`, width: Math.min(width, 1200), originalBytes: file.size, optimizedBytes: output.length } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload this image." }, { status: 400 }); }
}
