import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { prisma } from "@/lib/prisma";

export const uploadConfig = {
  chunkSize: Math.max(5, Math.min(10, Number(process.env.UPLOAD_CHUNK_SIZE_MB || 8))) * 1024 * 1024,
  maxConcurrency: Math.max(1, Math.min(4, Number(process.env.UPLOAD_MAX_CONCURRENCY || 3))),
  retryLimit: Math.max(1, Math.min(5, Number(process.env.UPLOAD_CHUNK_RETRIES || 3))),
  sessionHours: Math.max(1, Math.min(168, Number(process.env.UPLOAD_SESSION_TTL_HOURS || 48))),
};

export type AssetCategory = "RELEASE_COVER_ART" | "TRACK_AUDIO_MASTER" | "TRACK_AUDIO_PREVIEW" | "RELEASE_DOCUMENT" | "TRACK_DOCUMENT" | "OTHER_RELEASE_ASSET" | "OTHER_TRACK_ASSET";

export function storageRootPath() {
  const configured = process.env.HYMN_STORAGE_ROOT?.trim() || process.env.PRIVATE_STORAGE_ROOT?.trim();
  if (configured) return path.resolve(/* turbopackIgnore: true */ configured);
  if (process.env.NODE_ENV === "production") throw new Error("HYMN_STORAGE_ROOT is required in production.");
  return path.resolve(".hymn-storage");
}

export function createSafeAssetFolderName(title: string, stableId: string) {
  const readable = title.normalize("NFKC").replace(/[\0\\/:*?"<>|]/g, " - ").replace(/\.\./g, " ").replace(/\s+/g, " ").replace(/(?:\s*-\s*)+/g, " - ").trim().replace(/^[. -]+|[. -]+$/g, "").slice(0, 80) || "Untitled";
  const id = stableId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!id) throw new Error("A stable asset identifier is required.");
  return `${readable} - ${id}`;
}

function safeAbsolute(relativePath: string) {
  const root = storageRootPath();
  const full = path.resolve(root, ...relativePath.split("/"));
  if (full === root || !full.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe managed storage path.");
  return full;
}

function extensionFor(name: string, mime: string) {
  const ext = path.extname(name).toLowerCase();
  if (mime === "audio/wav" || mime === "audio/x-wav") return ".wav";
  if (mime === "audio/mpeg") return ".mp3";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "application/pdf") return ".pdf";
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ".bin";
}

export function beatAssetRelativePath(input: { producerName: string; producerId: number; beatTitle: string; beatId: number; assetName: "Master Audio" | "Preview Audio" | "Cover Art"; originalFilename: string; mimeType: string }) {
  const producerFolder = createSafeAssetFolderName(input.producerName, `producer_${input.producerId}`);
  const beatFolder = createSafeAssetFolderName(input.beatTitle, `beat_${input.beatId}`);
  const fileBase = input.assetName === "Master Audio" ? "master" : input.assetName === "Preview Audio" ? "preview" : "cover-art";
  return `Beatstore/${producerFolder}/${beatFolder}/${input.assetName}/${fileBase}${extensionFor(input.originalFilename, input.mimeType)}`;
}

function hasValidHeader(mime: string, bytes: Buffer) {
  if (mime === "audio/wav" || mime === "audio/x-wav") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE";
  if (mime === "audio/mpeg") return bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (mime === "image/jpeg") return bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (mime === "application/pdf") return bytes.subarray(0, 4).toString() === "%PDF";
  return true;
}

export class LocalStorageProvider {
  async writeChunk(tempPath: string, index: number, bytes: Buffer) {
    const folder = safeAbsolute(`Temp Uploads/${tempPath}`);
    await fsp.mkdir(folder, { recursive: true });
    const target = path.join(folder, `${String(index).padStart(5, "0")}.part`);
    const existing = await fsp.stat(target).catch(() => null);
    if (existing) {
      if (existing.size !== bytes.length) throw new Error("Duplicate chunk size does not match.");
      return existing.size;
    }
    await fsp.writeFile(target, bytes, { flag: "wx" });
    return bytes.length;
  }

  async assemble(tempPath: string, totalChunks: number, expectedSize: number) {
    const folder = safeAbsolute(`Temp Uploads/${tempPath}`);
    const assembled = path.join(folder, "assembled.pending");
    await fsp.rm(assembled, { force: true });
    const output = fs.createWriteStream(assembled, { flags: "wx" });
    const hash = crypto.createHash("sha256");
    let size = 0;
    const meter = new Transform({ transform(chunk, _encoding, callback) { size += chunk.length; hash.update(chunk); callback(null, chunk); } });
    meter.pipe(output);
    for (let index = 0; index < totalChunks; index += 1) {
      const part = path.join(folder, `${String(index).padStart(5, "0")}.part`);
      await pipeline(fs.createReadStream(part), meter, { end: false });
    }
    meter.end();
    await new Promise<void>((resolve, reject) => { output.once("finish", resolve); output.once("error", reject); });
    if (size !== expectedSize) throw new Error("Assembled file size does not match the upload session.");
    const handle = await fsp.open(assembled, "r");
    const header = Buffer.alloc(12); await handle.read(header, 0, 12, 0); await handle.close();
    return { path: assembled, size, checksum: hash.digest("hex"), header };
  }

  async moveAssembled(source: string, relativePath: string) {
    const destination = safeAbsolute(relativePath);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.rename(source, destination);
    return destination;
  }

  async write(relativePath: string, bytes: Buffer) {
    const destination = safeAbsolute(relativePath);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, bytes, { flag: "wx" });
    return destination;
  }

  async removeTemp(tempPath: string) { await fsp.rm(safeAbsolute(`Temp Uploads/${tempPath}`), { recursive: true, force: true }); }
  async read(relativePath: string) { return fsp.readFile(safeAbsolute(relativePath)); }
  async stat(relativePath: string) { return fsp.stat(safeAbsolute(relativePath)); }
}

export const localStorageProvider = new LocalStorageProvider();

export async function finalRelativePath(session: { releaseId: number; trackId: number | null; clientTrackId: string | null; assetCategory: string; originalFilename: string; mimeType: string }) {
  const release = await prisma.release.findUnique({ where: { id: session.releaseId }, select: { id: true, title: true, releaseType: true } });
  if (!release) throw new Error("Release not found.");
  const releaseFolder = createSafeAssetFolderName(release.title, `rel_${release.id}`);
  const multi = !["single", "ringtone"].includes(String(release.releaseType || "single").toLowerCase());
  if (session.assetCategory === "RELEASE_COVER_ART") return `Customer Assets/${releaseFolder}/${multi ? "Release Assets/" : ""}Cover Art/cover-original${extensionFor(session.originalFilename, session.mimeType)}`;
  if (session.assetCategory === "TRACK_AUDIO_MASTER") {
    const track = session.trackId ? await prisma.track.findFirst({ where: { id: session.trackId, releaseId: release.id }, select: { id: true, title: true, trackNumber: true } }) : null;
    const stable = track ? `trk_${track.id}` : `trk_${session.clientTrackId || "pending"}`;
    const title = track?.title || path.basename(session.originalFilename, path.extname(session.originalFilename));
    if (!multi) return `Customer Assets/${releaseFolder}/Audio Files/${createSafeAssetFolderName(title, stable)}${extensionFor(session.originalFilename, session.mimeType)}`;
    const trackFolder = createSafeAssetFolderName(`${String(track?.trackNumber || 1).padStart(2, "0")} - ${title}`, stable);
    return `Customer Assets/${releaseFolder}/${trackFolder}/Audio/master${extensionFor(session.originalFilename, session.mimeType)}`;
  }
  const scoped = session.trackId || session.clientTrackId ? "Other Assets" : `${multi ? "Release Assets/" : ""}Other Assets`;
  return `Customer Assets/${releaseFolder}/${scoped}/${crypto.randomUUID()}${extensionFor(session.originalFilename, session.mimeType)}`;
}

export function validateSessionHeader(mime: string, header: Buffer) { if (!hasValidHeader(mime, header)) throw new Error("File content does not match its MIME type."); }
