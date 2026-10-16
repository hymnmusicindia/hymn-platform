import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { localStorageProvider, storageRootPath } from "@/lib/storage-service";
import { validatePrivateUpload } from "@/lib/private-storage";
import { verifyAudioIntegrity } from "@/lib/media-integrity";
import { assertStudioActiveUser } from "@/lib/studio-access";

export const studioChunkSize = 8 * 1024 * 1024;
const schema = z.object({ orderId: z.string().uuid(), role: z.enum(["SOURCE", "DELIVERY"]), filename: z.string().min(1).max(240), mime: z.enum(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/flac", "application/zip"]), size: z.number().int().positive().max(2 * 1024 ** 3) });
type Upload = z.infer<typeof schema> & { userId: number; id: string; exp: number };
function secret() { if (!process.env.JWT_SECRET) throw new Error("Upload signing is unavailable."); return process.env.JWT_SECRET; }
function temp(upload: Upload) { return `studio-${upload.id}`; }
function key(upload: Upload) { return `Studio/${upload.orderId}/${upload.id}/${upload.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`; }
async function allowed(upload: Upload) {
  await assertStudioActiveUser(upload.userId);
  const order = await prisma.studioServiceOrder.findUnique({ where: { publicId: upload.orderId }, include: { engineerParty: { select: { claimedByUserId: true } } } });
  const states = upload.role === "SOURCE" ? ["ACCEPTED", "AWAITING_SOURCE_FILES", "IN_PROGRESS", "REVISION_REQUESTED", "DELIVERED"] : ["ACCEPTED", "AWAITING_SOURCE_FILES", "IN_PROGRESS", "REVISION_REQUESTED"];
  if (!order || !order.paidAt || (upload.role === "SOURCE" ? order.customerId : order.engineerParty.claimedByUserId) !== upload.userId || !states.includes(order.status)) throw new Error("Uploads are unavailable for your role or the current project state.");
  return order;
}
export function verifyStudioUpload(token: string, userId: number) {
  const value = jwt.verify(token, secret(), { audience: "studio-upload", algorithms: ["HS256"] }) as Upload;
  schema.parse(value);
  if (value.userId !== userId || !z.string().uuid().safeParse(value.id).success) throw new Error("Upload permission is invalid.");
  return value;
}
export async function createStudioUpload(userId: number, raw: unknown) {
  const fields = schema.parse(raw);
  if (fields.role === "DELIVERY" && fields.size > 500 * 1024 ** 2) throw new Error("Delivery files must be 500 MB or smaller.");
  if (/[\\/]|\.\./.test(fields.filename) || !/\.(wav|mp3|flac|zip)$/i.test(fields.filename)) throw new Error("Choose a WAV, MP3, FLAC or ZIP filename without path characters.");
  const upload: Upload = { ...fields, userId, id: randomUUID(), exp: Math.floor(Date.now() / 1000) + 48 * 3600 };
  await allowed(upload);
  return { token: jwt.sign(upload, secret(), { audience: "studio-upload", algorithm: "HS256" }), chunkSize: studioChunkSize };
}
export async function studioUploadStatus(upload: Upload) {
  await allowed(upload);
  const folder = path.join(storageRootPath(), "Temp Uploads", temp(upload));
  const entries = await fs.readdir(folder).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
  return entries.filter(name => /^\d{5}\.part$/.test(name)).map(name => Number(name.slice(0, 5)));
}
export async function writeStudioChunk(upload: Upload, index: number, bytes: Buffer, checksum: string) {
  await allowed(upload);
  const total = Math.ceil(upload.size / studioChunkSize), expected = Math.min(studioChunkSize, upload.size - index * studioChunkSize);
  if (!Number.isInteger(index) || index < 0 || index >= total || bytes.length !== expected || createHash("sha256").update(bytes).digest("hex") !== checksum) throw new Error("Upload chunk is incomplete or its checksum does not match.");
  await localStorageProvider.writeChunk(temp(upload), index, bytes);
}
async function checksumFile(file: string) { const hash = createHash("sha256"); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest("hex"); }
export async function completeStudioUpload(upload: Upload) {
  await assertStudioActiveUser(upload.userId);
  const objectKey = key(upload);
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${upload.orderId}))`;
    if (!await tx.user.count({ where: { id: upload.userId, status: "ACTIVE" } })) throw new Error("An active account is required to finish an upload.");
    const prior = await tx.storedAsset.findUnique({ where: { objectKey }, include: { studioFile: true } });
    if (prior && prior.ownerUserId === upload.userId && prior.studioFile && !prior.deletedAt) return prior;
    // Read project state after acquiring the same lock used by delivery/approval.
    const order = await tx.studioServiceOrder.findUniqueOrThrow({ where: { publicId: upload.orderId }, include: { engineerParty: { select: { claimedByUserId: true } } } });
    const states = upload.role === "SOURCE" ? ["ACCEPTED", "AWAITING_SOURCE_FILES", "IN_PROGRESS", "REVISION_REQUESTED", "DELIVERED"] : ["ACCEPTED", "AWAITING_SOURCE_FILES", "IN_PROGRESS", "REVISION_REQUESTED"];
    if (!order.paidAt || !states.includes(order.status) || (upload.role === "SOURCE" ? order.customerId : order.engineerParty.claimedByUserId) !== upload.userId) throw new Error("Project closed or upload permission changed.");
    const assembled = await localStorageProvider.assemble(temp(upload), Math.ceil(upload.size / studioChunkSize), upload.size);
    const handle = await fs.open(assembled.path, "r");
    const sample = Buffer.alloc(Math.min(upload.size, 64));
    try { await handle.read(sample, 0, sample.length, 0); } finally { await handle.close(); }
    const assetType = upload.role === "SOURCE" ? "private_studio_source" : "private_studio_delivery";
    const safeFilename = validatePrivateUpload({ ownerUserId: upload.userId, assetType, fileName: upload.filename, mimeType: upload.mime, bytes: sample });
    if (["audio/wav", "audio/x-wav", "audio/mpeg"].includes(upload.mime)) await verifyAudioIntegrity(assembled.path, upload.mime);
    try { await localStorageProvider.moveAssembled(assembled.path, objectKey); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || await checksumFile(path.join(storageRootPath(), objectKey)) !== assembled.checksum) throw error; }
    const asset = await tx.storedAsset.create({ data: { ownerUserId: upload.userId, assetType, storageProvider: "LOCAL", storageRoot: "HYMN_STORAGE_ROOT", relativePath: objectKey, objectKey, originalFilename: upload.filename, safeFilename, mimeType: upload.mime, byteSize: assembled.size, checksum: assembled.checksum, entityType: "STUDIO_ORDER", entityId: upload.orderId, accessClassification: "private", uploadStatus: "ready" } });
    const latest = await tx.studioFile.findFirst({ where: { orderId: order.id, category: upload.role }, orderBy: { version: "desc" }, select: { version: true } });
    await tx.studioFile.create({ data: { orderId: order.id, assetId: asset.id, uploaderId: upload.userId, category: upload.role, version: (latest?.version || 0) + 1, status: "READY" } });
    if (upload.role === "SOURCE" && ["ACCEPTED", "AWAITING_SOURCE_FILES"].includes(order.status)) {
      await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS", startedAt: new Date(), deliveryDueAt: new Date(Date.now() + order.turnaroundDays * 86400000) } });
      await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: "IN_PROGRESS", actorUserId: upload.userId, actorType: "CUSTOMER", reason: "Source files uploaded", correlationId: `source-upload:${asset.id}` } });
      await tx.studioMessage.create({ data: { orderId: order.id, kind: "SYSTEM", body: "Source files uploaded. Project started.", idempotencyKey: `source-upload:${asset.id}` } });
    }
    return asset;
  }, { timeout: 120000, maxWait: 120000 });
  await localStorageProvider.removeTemp(temp(upload)).catch(() => undefined);
  return { id: result.id, downloadPath: `/api/assets/${result.id}/download?filename=${encodeURIComponent(result.safeFilename)}` };
}

export async function cleanExpiredStudioUploads() {
  const root = path.join(storageRootPath(), "Temp Uploads");
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  let cleaned = 0;
  for (const entry of entries.filter(value => value.isDirectory() && /^studio-[a-f0-9-]{36}$/.test(value.name))) {
    const info = await fs.stat(path.join(root, entry.name)).catch(() => null);
    if (info && Date.now() - info.mtimeMs > 49 * 3600000) { await localStorageProvider.removeTemp(entry.name); cleaned++; }
    if (cleaned >= 250) break;
  }
  return cleaned;
}
