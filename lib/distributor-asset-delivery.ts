import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getUserSessionSecret } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { localPrivateStorage } from "@/lib/private-storage";

function signingSecret() {
  return process.env.DISTRIBUTION_ASSET_SIGNING_SECRET?.trim() || getUserSessionSecret();
}

export function distributorAssetToken(assetId: number) {
  return createHmac("sha256", signingSecret()).update(`direnote-asset:${assetId}`).digest("hex");
}

export function verifyDistributorAssetToken(assetId: number, token: string) {
  const expected = Buffer.from(distributorAssetToken(assetId), "hex");
  const received = Buffer.from(token, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function privateAssetId(value?: string | null) {
  if (!value) return null;
  try {
    const path = new URL(value, "https://hymn.local").pathname;
    const match = path.match(/^\/api\/assets\/(\d+)\/download$/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function expectedExtensionForMime(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg") return { extension: ".jpg", pattern: /\.jpe?g$/i };
  if (normalized === "application/pdf") return { extension: ".pdf", pattern: /\.pdf$/i };
  if (normalized === "audio/mpeg") return { extension: ".mp3", pattern: /\.mp3$/i };
  if (normalized === "audio/wav" || normalized === "audio/x-wav" || normalized === "audio/wave") return { extension: ".wav", pattern: /\.wav$/i };
  return null;
}

function distributorSafeFilename(filename: string, mimeType: string) {
  const trimmed = filename.trim() || "asset";
  const expected = expectedExtensionForMime(mimeType);
  if (!expected || expected.pattern.test(trimmed)) return trimmed;
  return `${trimmed.replace(/\.[a-z0-9]{1,8}$/i, "")}${expected.extension}`;
}

function hostingerProofDirectory() {
  // Hostinger's account-level public_html is the persistent document root.
  // Do not use hbuilds (replaced on every Node deployment) or an inferred
  // nested domain path, which may not be the site's served web root.
  return process.env.DIRENOTE_PUBLIC_PROOFS_ROOT?.trim() || "/home/u390865851/public_html/direnote-proofs";
}

function hostingerProofFileName(input: { assetId: number; checksum: string; filename: string }) {
  return `${input.assetId}-${input.checksum.slice(0, 24)}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function hostingerProofTarget(input: { assetId: number; checksum: string; filename: string }) {
  const root = path.resolve(hostingerProofDirectory());
  const target = path.resolve(root, hostingerProofFileName(input));
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe Hostinger agreement proof path.");
  return { root, target, filename: hostingerProofFileName(input) };
}

async function publishAgreementPdf(input: { assetId: number; checksum: string; filename: string; bytes: Buffer; siteUrl?: string }) {
  const { root, target, filename } = hostingerProofTarget(input);
  await fs.mkdir(root, { recursive: true });
  const pending = `${target}.${randomUUID()}.pending`;
  await fs.writeFile(pending, input.bytes, { flag: "wx" });
  await fs.rename(pending, target).catch(async (error: NodeJS.ErrnoException) => {
    await fs.unlink(pending).catch(() => undefined);
    if (error.code !== "EEXIST") throw error;
  });
  return new URL(`/direnote-proofs/${encodeURIComponent(filename)}`, getPublicAppUrl(input.siteUrl)).toString();
}

async function cachedHostingerProofExists(asset: { id: number; checksum: string; safeFilename: string; providerDeliveryUrl: string | null }, siteUrl?: string) {
  if (!asset.providerDeliveryUrl) return false;
  const filename = distributorSafeFilename(asset.safeFilename, "application/pdf");
  const expected = hostingerProofTarget({ assetId: asset.id, checksum: asset.checksum, filename });
  const expectedUrl = new URL(`/direnote-proofs/${encodeURIComponent(expected.filename)}`, getPublicAppUrl(siteUrl));
  let cached: URL;
  try { cached = new URL(asset.providerDeliveryUrl); } catch { return false; }
  if (cached.origin !== expectedUrl.origin || cached.pathname !== expectedUrl.pathname) return false;
  try { await fs.access(expected.target); return true; } catch { return false; }
}

export async function createDistributorAssetUrl(value: string | null | undefined, siteUrl?: string) {
  const assetId = privateAssetId(value);
  if (!assetId) return value ?? "";
  const asset = await prisma.storedAsset.findFirst({ where: { id: assetId, deletedAt: null, uploadStatus: "ready" }, select: { id: true, safeFilename: true, mimeType: true, checksum: true, providerDeliveryToken: true, providerDeliveryUrl: true } });
  if (!asset) throw new Error("A release asset is unavailable for distributor delivery.");
  if (asset.mimeType === "application/pdf") {
    if (await cachedHostingerProofExists(asset, siteUrl)) return asset.providerDeliveryUrl!;
    const read = await localPrivateStorage.createAuthorizedRead({ assetId: asset.id, requesterUserId: 0, isAdmin: true });
    const url = await publishAgreementPdf({ assetId: asset.id, checksum: asset.checksum, filename: distributorSafeFilename(asset.safeFilename, asset.mimeType), bytes: read.bytes, siteUrl });
    await prisma.storedAsset.update({ where: { id: asset.id }, data: { providerDeliveryUrl: url, providerDeliveryAt: new Date() } });
    return url;
  }
  const base = getPublicAppUrl(siteUrl);
  const filename = encodeURIComponent(distributorSafeFilename(asset.safeFilename, asset.mimeType));
  let token = asset.providerDeliveryToken;
  if (!token) {
    const generated = randomUUID();
    const claimed = await prisma.storedAsset.updateMany({ where: { id: asset.id, providerDeliveryToken: null }, data: { providerDeliveryToken: generated } });
    token = claimed.count === 1
      ? generated
      : (await prisma.storedAsset.findUnique({ where: { id: asset.id }, select: { providerDeliveryToken: true } }))?.providerDeliveryToken ?? null;
  }
  if (!token) throw new Error("Could not create a provider delivery link for this asset.");
  const url = new URL(`/api/distribution-assets/${assetId}/${token}/${filename}`, base).toString();
  return url;
}
