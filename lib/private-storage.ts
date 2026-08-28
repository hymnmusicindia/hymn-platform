import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { beatAssetRelativePath, finalRelativePath, localStorageProvider } from "@/lib/storage-service";

export type PrivateAssetType = "private_audio_master" | "private_beat_deliverable" | "private_beat_license" | "private_cover_licence" | "private_ownership_proof" | "private_ai_receipt" | "private_royalty_statement" | "private_payout_report" | "private_payout_proof" | "private_kyc_document" | "private_unreleased_artwork";
export type PrivateUploadInput = { ownerUserId: number; ownerName?: string; releaseId?: number; beatPurchaseId?: number; beatId?: number; beatTitle?: string; assetType: PrivateAssetType; fileName: string; mimeType: string; bytes: Buffer; retentionUntil?: Date };
export type AuthorizedReadInput = { assetId: number; requesterUserId: number; isAdmin: boolean; range?: string | null };
export type StoredPrivateAsset = { id: number; downloadPath: string; checksum: string; byteSize: number };

export interface PrivateStorageAdapter {
  upload(input: PrivateUploadInput): Promise<StoredPrivateAsset>;
  createAuthorizedRead(input: AuthorizedReadInput): Promise<{ bytes: Buffer; mimeType: string; fileName: string; contentRange?: string | null; contentLength?: string | null }>;
  delete(input: { assetId: number; requesterUserId: number; isAdmin: boolean }): Promise<void>;
}

const policies: Record<PrivateAssetType, { max: number; mime: string[] }> = {
  private_audio_master: { max: 500 * 1024 * 1024, mime: ["audio/wav", "audio/x-wav", "audio/mpeg"] },
  private_beat_deliverable: { max: 500 * 1024 * 1024, mime: ["audio/wav", "audio/x-wav", "audio/flac", "audio/mpeg", "application/zip"] },
  private_beat_license: { max: 20 * 1024 * 1024, mime: ["application/pdf"] },
  private_unreleased_artwork: { max: 20 * 1024 * 1024, mime: ["image/jpeg"] },
  private_cover_licence: { max: 20 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png"] },
  private_ownership_proof: { max: 20 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png"] },
  private_ai_receipt: { max: 20 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png"] },
  private_royalty_statement: { max: 50 * 1024 * 1024, mime: ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/pdf"] },
  private_payout_report: { max: 50 * 1024 * 1024, mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/pdf"] },
  private_payout_proof: { max: 20 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png"] },
  private_kyc_document: { max: 20 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png"] }
};

export function privateStorageRootPath() {
  if (process.env.VERCEL === "1" || process.env.NEXT_PUBLIC_VERCEL_ENV) {
    return path.resolve("/tmp/.private-storage");
  }
  const configured = process.env.HYMN_STORAGE_ROOT?.trim() || process.env.PRIVATE_STORAGE_ROOT?.trim();
  if (!configured && process.env.NODE_ENV === "production") throw new Error("PRIVATE_STORAGE_ROOT is required for private assets in production.");
  const root = configured ? path.resolve(/* turbopackIgnore: true */ configured) : path.resolve(".private-storage");
  const publicRoot = path.resolve("public");
  if (root === publicRoot || root.startsWith(`${publicRoot}${path.sep}`)) throw new Error("Private storage must not be inside the public directory.");
  return root;
}

function hasValidAudioMagic(mime: string, bytes: Buffer) {
  if (mime === "audio/wav" || mime === "audio/x-wav") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE";
  if (mime === "audio/flac") return bytes.subarray(0, 4).toString() === "fLaC";
  if (mime === "audio/mpeg") return bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  return true;
}

export function readImageDimensions(mime: string, bytes: Buffer) {
  if (mime === "image/png" && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  if (mime === "image/webp" && bytes.length >= 30 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") {
    const kind = bytes.subarray(12, 16).toString();
    if (kind === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  return null;
}

export function validatePrivateUpload(input: PrivateUploadInput) {
  const policy = policies[input.assetType];
  if (!policy.mime.includes(input.mimeType)) throw new Error("Unsupported private asset MIME type.");
  if (input.bytes.length < 1 || input.bytes.length > policy.max) throw new Error("Private asset size is invalid.");
  const requestedName = input.fileName?.trim() || "";
  // A storage key is generated independently, but rejecting path syntax and
  // executable double extensions keeps the filename shown to users/auditors
  // unambiguous and prevents content-disposition confusion downstream.
  if (!requestedName || /[\\/]|\.\./.test(requestedName) || /\.(?:ade|adp|app|bat|cmd|com|cpl|exe|hta|inf|ins|jar|js|jse|lnk|msc|msi|msp|pif|ps1|reg|scr|sct|sh|vb|vbe|vbs|wsf|wsh)\./i.test(requestedName)) {
    throw new Error("Private asset filename is invalid.");
  }
  let base = path.basename(input.fileName || "unnamed_file").replace(/\\/g, "/").split("/").pop() || "asset";
  if (base.includes("..")) base = base.replace(/\.\./g, "");
  const extIndex = base.lastIndexOf(".");
  if (extIndex !== -1 && extIndex > 0) {
    const namePart = base.slice(0, extIndex).replace(/\./g, "_");
    base = `${namePart}${base.slice(extIndex)}`;
  }
  const magic = input.bytes.subarray(0, 12);
  const validMagic = input.mimeType === "application/pdf" ? magic.subarray(0, 4).toString() === "%PDF" : input.mimeType === "image/png" ? magic.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) : input.mimeType === "image/jpeg" ? magic.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) : input.mimeType === "image/webp" ? magic.subarray(0, 4).toString() === "RIFF" && input.bytes.subarray(8, 12).toString() === "WEBP" : input.mimeType === "application/zip" || input.mimeType.includes("spreadsheetml") ? magic.subarray(0, 2).toString() === "PK" : hasValidAudioMagic(input.mimeType, input.bytes);
  if (!validMagic) throw new Error("File content does not match its MIME type.");
  if (input.assetType === "private_unreleased_artwork") {
    const dimensions = readImageDimensions(input.mimeType, input.bytes);
    if (!dimensions) throw new Error("Artwork dimensions could not be verified.");
    if (dimensions.width !== dimensions.height) throw new Error("Artwork must be a perfect square.");
    if (dimensions.width < 3000 || dimensions.height < 3000) throw new Error("Artwork must be at least 3000 x 3000 pixels.");
  }
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export const localPrivateStorage: PrivateStorageAdapter = {
  async upload(input) {
    const isVercel = process.env.VERCEL === '1' || Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV);
    const safeFilename = validatePrivateUpload(input);
    const checksum = crypto.createHash("sha256").update(input.bytes).digest("hex");
    
    if (isVercel) {
      const organizedKey = input.assetType === "private_beat_deliverable" && input.beatId && input.beatTitle
        ? beatAssetRelativePath({ producerName: input.ownerName || `Producer ${input.ownerUserId}`, producerId: input.ownerUserId, beatTitle: input.beatTitle, beatId: input.beatId, assetName: "Master Audio", originalFilename: input.fileName, mimeType: input.mimeType })
        : `${input.ownerUserId}/${crypto.randomUUID()}-${safeFilename}`;
      const objectKey = `private/${organizedKey}`;
      const blob = await put(objectKey, input.bytes, { access: 'private' });
      const asset = await prisma.storedAsset.create({
        data: {
          ownerUserId: input.ownerUserId,
          releaseId: input.releaseId,
          beatPurchaseId: input.beatPurchaseId,
          beatId: input.beatId,
          assetType: input.assetType,
          storageProvider: "vercel_blob",
          objectKey: blob.url,
          originalFilename: input.fileName,
          safeFilename,
          mimeType: input.mimeType,
          byteSize: input.bytes.length,
          checksum,
          accessClassification: "private",
          retentionUntil: input.retentionUntil
        }
      });
      return { id: asset.id, downloadPath: `/api/assets/${asset.id}/download?filename=${encodeURIComponent(safeFilename)}`, checksum, byteSize: input.bytes.length };
    }

    const category = input.assetType === "private_unreleased_artwork" ? "RELEASE_COVER_ART" : input.assetType === "private_audio_master" ? "TRACK_AUDIO_MASTER" : input.releaseId ? "RELEASE_DOCUMENT" : null;
    const canonicalRelativePath = input.assetType === "private_beat_deliverable" && input.beatId && input.beatTitle
      ? beatAssetRelativePath({ producerName: input.ownerName || `Producer ${input.ownerUserId}`, producerId: input.ownerUserId, beatTitle: input.beatTitle, beatId: input.beatId, assetName: "Master Audio", originalFilename: input.fileName, mimeType: input.mimeType })
      : input.releaseId && category
        ? await finalRelativePath({ releaseId: input.releaseId, trackId: null, clientTrackId: null, assetCategory: category, originalFilename: input.fileName, mimeType: input.mimeType })
        : null;
    let objectKey = canonicalRelativePath || `${input.ownerUserId}/${crypto.randomUUID()}`;
    if (canonicalRelativePath) {
      const extension = path.extname(canonicalRelativePath);
      const base = canonicalRelativePath.slice(0, -extension.length);
      try { await localStorageProvider.write(objectKey, input.bytes); }
      catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
        objectKey = `${base}-${crypto.randomUUID()}${extension}`;
        await localStorageProvider.write(objectKey, input.bytes);
      }
    }
    const fullPath = path.resolve(/* turbopackIgnore: true */ privateStorageRootPath(), objectKey);
    if (!fullPath.startsWith(`${privateStorageRootPath()}${path.sep}`)) throw new Error("Unsafe storage path.");
    if (!canonicalRelativePath) { await fs.mkdir(path.dirname(fullPath), { recursive: true }); await fs.writeFile(fullPath, input.bytes, { flag: "wx" }); }
    const asset = await prisma.storedAsset.create({ data: { ownerUserId: input.ownerUserId, releaseId: input.releaseId, beatPurchaseId: input.beatPurchaseId, beatId: input.beatId, assetType: input.assetType, storageProvider: canonicalRelativePath ? "LOCAL" : "private_local", storageRoot: canonicalRelativePath ? "HYMN_STORAGE_ROOT" : null, relativePath: canonicalRelativePath ? objectKey : null, storedFilename: canonicalRelativePath ? path.basename(objectKey) : null, category: input.beatId ? "BEAT_MASTER_AUDIO" : category, entityType: input.releaseId ? "RELEASE" : input.beatId ? "BEAT" : null, entityId: String(input.releaseId || input.beatId || input.beatPurchaseId || input.ownerUserId), objectKey, originalFilename: input.fileName, safeFilename, mimeType: input.mimeType, byteSize: input.bytes.length, checksum, accessClassification: "private", retentionUntil: input.retentionUntil } }).catch(async error => {
      await fs.unlink(fullPath).catch(() => undefined);
      throw error;
    });
    return { id: asset.id, downloadPath: `/api/assets/${asset.id}/download?filename=${encodeURIComponent(safeFilename)}`, checksum, byteSize: input.bytes.length };
  },
  async createAuthorizedRead(input) {
    const asset = await prisma.storedAsset.findUnique({ where: { id: input.assetId } });
    if (!asset || asset.deletedAt || (asset.retentionUntil && asset.retentionUntil <= new Date())) throw new Error("Asset is unavailable.");
    if (!input.isAdmin && asset.ownerUserId !== input.requesterUserId) {
      const purchased = asset.assetType === "private_beat_deliverable" && asset.beatId ? await prisma.beatPurchase.count({ where: { beatId: asset.beatId, userId: input.requesterUserId, hasAccess: true } }) : 0;
      if (!purchased) throw new Error("Forbidden.");
    }
    if (asset.storageProvider === "vercel_blob" || asset.objectKey.startsWith("http://") || asset.objectKey.startsWith("https://")) {
      const blob = await get(asset.objectKey, { access: "private", headers: input.range ? { Range: input.range } : undefined });
      const statusCode = Number(blob?.statusCode);
      if (!blob || ![200, 206].includes(statusCode) || !blob.stream) throw new Error("Could not fetch remote private asset.");
      const buf = Buffer.from(await new Response(blob.stream).arrayBuffer());
      return { bytes: buf, mimeType: asset.mimeType, fileName: asset.safeFilename, contentRange: blob.headers.get("content-range"), contentLength: blob.headers.get("content-length") };
    }
    return { bytes: await fs.readFile(path.resolve(/* turbopackIgnore: true */ privateStorageRootPath(), asset.objectKey)), mimeType: asset.mimeType, fileName: asset.safeFilename };
  },
  async delete(input) {
    const asset = await prisma.storedAsset.findUnique({ where: { id: input.assetId } });
    if (!asset || (!input.isAdmin && asset.ownerUserId !== input.requesterUserId)) throw new Error("Forbidden.");
    await prisma.storedAsset.update({ where: { id: asset.id }, data: { deletedAt: new Date(), uploadStatus: "deleted" } });
    if (asset.storageProvider === "vercel_blob" || asset.objectKey.startsWith("http://") || asset.objectKey.startsWith("https://")) {
      await del(asset.objectKey).catch(() => undefined);
      return;
    }
    const root = privateStorageRootPath();
    const target = path.resolve(/* turbopackIgnore: true */ root, asset.objectKey);
    if (target.startsWith(`${root}${path.sep}`)) await fs.unlink(target).catch(() => undefined);
  }
};
// vercel trigger 10
