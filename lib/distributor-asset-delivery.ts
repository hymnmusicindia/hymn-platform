import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getUserSessionSecret } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/public-app-url";

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

export async function createDistributorAssetUrl(value: string | null | undefined, siteUrl?: string) {
  const assetId = privateAssetId(value);
  if (!assetId) return value ?? "";
  const asset = await prisma.storedAsset.findFirst({ where: { id: assetId, deletedAt: null, uploadStatus: "ready" }, select: { id: true, safeFilename: true, mimeType: true, providerDeliveryToken: true } });
  if (!asset) throw new Error("A release asset is unavailable for distributor delivery.");
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
  if (asset.mimeType === "application/pdf") {
    // Check the actual public host: a valid local signature does not guarantee
    // that the deployed host uses the same key or can read the stored file.
    let response: Response;
    try {
      response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new Error("Agreement PDF download could not be verified. Check the public site URL and deployed storage configuration before retrying.");
    }
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("application/pdf")) {
      await response.body?.cancel();
      throw new Error(`Agreement PDF link is unavailable (HTTP ${response.status}). Check DISTRIBUTION_ASSET_SIGNING_SECRET/JWT_SECRET consistency across deployed instances and that the uploaded PDF exists in persistent storage.`);
    }
    const reader = response.body?.getReader();
    const prefix: number[] = [];
    try {
      while (reader && prefix.length < 5) {
        const chunk = await reader.read();
        if (chunk.done) break;
        prefix.push(...chunk.value.subarray(0, 5 - prefix.length));
      }
    } finally {
      await reader?.cancel();
    }
    if (Buffer.from(prefix).toString("ascii") !== "%PDF-") throw new Error("Agreement link did not return a PDF file. Upload the original agreement PDF again.");
  }
  return url;
}
