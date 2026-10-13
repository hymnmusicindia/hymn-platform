import { createHash } from "node:crypto";
import sharp from "sharp";

const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
let cacheBytes = 0;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;

/** Call only AFTER source authorization. Content hash invalidates replaced artwork. */
export async function artworkThumbnail(bytes: Buffer, width: number) {
  const key = `${createHash("sha256").update(bytes).digest("hex")}:${width}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const job = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width, height: width, fit: "inside", withoutEnlargement: true }).webp({ quality: 80, effort: 3 }).toBuffer().then(result => {
    while (cacheBytes + result.length > MAX_CACHE_BYTES && cache.size) {
      const oldest = cache.keys().next().value!;
      cacheBytes -= cache.get(oldest)!.length;
      cache.delete(oldest);
    }
    if (result.length <= MAX_CACHE_BYTES) { cache.set(key, result); cacheBytes += result.length; }
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
