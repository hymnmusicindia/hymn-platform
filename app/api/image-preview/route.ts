import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requestedArtworkWidth } from "@/lib/artwork-preview";
import { artworkThumbnail } from "@/lib/artwork-thumbnail";
import { resolvePublicUploadPaths } from '@/lib/storage';

export const runtime = "nodejs";
/** Public raster files only. Never proxies URLs or reads private storage. */
export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src") || "";
  const width = requestedArtworkWidth(request);
  if (width && /^\/api\/public-uploads\/.+\.(?:png|jpe?g|webp)$/i.test(src)) {
    try {
      const relative = src.slice('/api/public-uploads/'.length).split('/').map(decodeURIComponent).join('/');
      const candidates = resolvePublicUploadPaths(relative);
      for (const target of candidates) {
        const stat = await fs.stat(target).catch(() => null);
        if (!stat?.isFile()) continue;
        if (stat.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Image is too large.' }, { status: 413 });
        const image = await artworkThumbnail(await fs.readFile(target), width);
        return new NextResponse(new Uint8Array(image), { headers: { 'Content-Type': 'image/webp', 'Content-Length': String(image.length), 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', 'X-Content-Type-Options': 'nosniff' } });
      }
      return NextResponse.json({ error: 'Image unavailable.' }, { status: 404 });
    } catch { return NextResponse.json({ error: 'Invalid public image.' }, { status: 400 }); }
  }
  if (!width || !/^\/(assets|images)\/[^?#]+\.(png|jpe?g|webp)$/i.test(src) || src.includes("..") || src.includes("\\") || src.includes("\0")) return NextResponse.json({ error: "Invalid preview." }, { status: 400 });
  try {
    const root = await fs.realpath(path.join(process.cwd(), "public"));
    const target = await fs.realpath(path.join(root, src));
    if (!target.startsWith(root + path.sep)) return NextResponse.json({ error: "Invalid preview." }, { status: 400 });
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Image is too large." }, { status: 413 });
    const image = await artworkThumbnail(await fs.readFile(target), width);
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/webp", "Content-Length": String(image.length), "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Image unavailable." }, { status: 404 }); }
}
