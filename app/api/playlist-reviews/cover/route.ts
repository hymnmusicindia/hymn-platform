import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireUser } from "@/lib/access";
import { saveUploadedFile } from "@/lib/storage";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
const maxBytes = 5 * 1024 * 1024;
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== new URL(getPublicAppUrl()).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const rate = await consumeRateLimit({ scope: "playlist-cover-upload", identity: String(auth.user.id), limit: 20, windowSeconds: 3600 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 });
  if (Number(request.headers.get("content-length")) > maxBytes + 65536) return NextResponse.json({ error: "Choose a cover under 5 MB." }, { status: 413 });
  try {
    const file = (await request.formData()).get("image");
    if (!(file instanceof File) || !file.size || file.size > maxBytes || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Choose a JPG, PNG or WebP cover under 5 MB." }, { status: 400 });
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, animated: false });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format || "") || !meta.width || !meta.height || meta.width < 300 || meta.height < 300) return NextResponse.json({ error: "Use a readable cover at least 300 × 300 pixels." }, { status: 400 });
    const bytes = await image.rotate().resize(960, 960, { fit: "cover", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const url = await saveUploadedFile(new File([new Uint8Array(bytes)], "cover.webp", { type: "image/webp" }), `site/playlists/${auth.user.id}`, "image");
    return NextResponse.json({ url });
  } catch { return NextResponse.json({ error: "Could not save this cover. Try another JPG, PNG or WebP." }, { status: 400 }); }
}
