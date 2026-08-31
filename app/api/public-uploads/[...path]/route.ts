import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolvePublicUploadPaths } from "@/lib/storage";
import { missingImageResponseHeaders, missingImageSvg } from "@/lib/media-placeholder";

export const runtime = "nodejs";

const imageTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

const mediaTypes: Record<string, string> = {
  ...imageTypes,
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac"
};

export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: segments } = await context.params;
    const relativePath = segments.map(decodeURIComponent).join("/");
    const mimeType = mediaTypes[path.extname(relativePath).toLowerCase()];
    if (!mimeType) return NextResponse.json({ error: "Unsupported public media type." }, { status: 415 });

    let bytes: Buffer | null = null;
    for (const candidate of resolvePublicUploadPaths(relativePath)) {
      bytes = await fs.readFile(candidate).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      });
      if (bytes) break;
    }
    if (!bytes) throw Object.assign(new Error("Public media not found."), { code: "ENOENT" });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const requestedPath = (await context.params).path.join("/");
      if (imageTypes[path.extname(requestedPath).toLowerCase()]) {
        return new NextResponse(missingImageSvg(), { status: 200, headers: missingImageResponseHeaders("public, max-age=300") });
      }
      return NextResponse.json({ error: "Public media not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Invalid public media path." }, { status: 400 });
  }
}
