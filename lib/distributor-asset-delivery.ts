import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
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

export async function createDistributorAssetUrl(value: string | null | undefined, siteUrl?: string) {
  const assetId = privateAssetId(value);
  if (!assetId) return value ?? "";
  const asset = await prisma.storedAsset.findFirst({ where: { id: assetId, deletedAt: null, uploadStatus: "ready" }, select: { safeFilename: true } });
  if (!asset) throw new Error("A release asset is unavailable for distributor delivery.");
  const base = getPublicAppUrl(siteUrl);
  const filename = encodeURIComponent(asset.safeFilename);
  return new URL(`/api/distribution-assets/${assetId}/${distributorAssetToken(assetId)}/${filename}`, base).toString();
}
