import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser } from "@/lib/access";
import { saveUploadedFile } from "@/lib/storage";
import { getPublicAppUrl } from "@/lib/public-app-url";

export const runtime = "nodejs";
const maxBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (Number(request.headers.get("content-length")) > maxBytes + 64 * 1024) return NextResponse.json({ error: "Choose an image under 5 MB." }, { status: 413 });
  try {
    const form = await request.formData(), file = form.get("image"), kind = form.get("kind");
    if (kind !== "photo" && kind !== "banner") return NextResponse.json({ error: "Choose a profile photo or banner." }, { status: 400 });
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    if (file.size > maxBytes) return NextResponse.json({ error: "Choose an image under 5 MB." }, { status: 413 });
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 400 });
    let output: Buffer;
    try {
      const input = Buffer.from(await file.arrayBuffer());
      const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
      const metadata = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format || "")) throw new Error("Invalid image");
      output = await image.rotate().resize({ width: kind === "photo" ? 1024 : 2400, height: kind === "photo" ? 1024 : 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
    } catch { return NextResponse.json({ error: "This image could not be read. Export it as JPG, PNG or WebP and try again." }, { status: 400 }); }
    const saved = await saveUploadedFile(new File([new Uint8Array(output)], `${kind}.webp`, { type: "image/webp" }), `site/engineers/${auth.user.id}/${kind}`, "image");
    return NextResponse.json({ url: `${getPublicAppUrl(request.url)}${saved}` });
  } catch (error) {
    console.error("Engineer image upload failed", { userId: auth.user.id, code: (error as NodeJS.ErrnoException).code || "UPLOAD_FAILED" });
    return NextResponse.json({ error: "Could not store your image. Please try again shortly." }, { status: 500 });
  }
}
