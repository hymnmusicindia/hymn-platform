import type { FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { audioRange } from "@/lib/audio-range";

/** Takes ownership of the handle. Only the requested bytes enter a bounded stream. */
export async function audioFileResponse(request: Request, file: FileHandle, options: {
  mimeType: string; cacheControl: string; etag?: string;
}) {
  let transferred = false;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1) throw new Error("Audio file is unavailable.");
    const etag = options.etag || `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
    const headers = new Headers({
      "Content-Type": options.mimeType, "Accept-Ranges": "bytes",
      "Cache-Control": `${options.cacheControl}, no-transform`, ETag: etag,
      "Last-Modified": stat.mtime.toUTCString(), "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no"
    });
    const matches = request.headers.get("if-none-match")?.split(",").some(value => value.trim().replace(/^W\//, "") === etag.replace(/^W\//, "") || value.trim() === "*");
    if (matches) return new Response(null, { status: 304, headers });
    const ifRange = request.headers.get("if-range");
    const rangeHeader = !ifRange || (ifRange === etag && !etag.startsWith("W/")) || ifRange === stat.mtime.toUTCString()
      ? request.headers.get("range") : null;
    const range = rangeHeader ? audioRange(rangeHeader.trim(), stat.size) : undefined;
    if (range === null) {
      headers.set("Content-Range", `bytes */${stat.size}`);
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start ?? 0, end = range?.end ?? stat.size - 1;
    headers.set("Content-Length", String(end - start + 1));
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    const status = range ? 206 : 200;
    if (request.method === "HEAD") return new Response(null, { status, headers });
    const stream = file.createReadStream({ start, end, highWaterMark: 64 * 1024, autoClose: true, signal: request.signal });
    const body = Readable.toWeb(stream, { strategy: { highWaterMark: 64 * 1024, size: chunk => chunk.length } });
    transferred = true;
    return new Response(body as ReadableStream<Uint8Array>, { status, headers });
  } finally {
    if (!transferred) await file.close();
  }
}
