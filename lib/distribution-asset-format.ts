import "server-only";

import { prisma } from "@/lib/prisma";

type DistributionAssetKind = "artwork" | "audio";

const allowedMime: Record<DistributionAssetKind, Set<string>> = {
  artwork: new Set(["image/jpeg"]),
  audio: new Set(["audio/wav", "audio/x-wav", "audio/mpeg"]),
};

const allowedExtension: Record<DistributionAssetKind, RegExp> = {
  artwork: /\.jpe?g$/i,
  audio: /\.(wav|mp3)$/i,
};

function privateAssetId(value: string) {
  try {
    const pathname = new URL(value, "https://hymn.local").pathname;
    const match = pathname.match(/^\/api\/assets\/(\d+)\/download$/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function fileNameFromUrl(value: string) {
  try {
    const url = new URL(value, "https://hymn.local");
    return url.searchParams.get("filename") || url.pathname.split("/").pop() || "";
  } catch {
    return "";
  }
}

export async function assertDireNoteAssetFormat(input: { userId: number; url: string; kind: DistributionAssetKind; label: string }) {
  const assetId = privateAssetId(input.url);
  if (assetId) {
    const asset = await prisma.storedAsset.findFirst({
      where: { id: assetId, ownerUserId: input.userId, deletedAt: null },
      select: { mimeType: true, safeFilename: true, uploadStatus: true },
    });
    if (!asset || asset.uploadStatus !== "ready") throw new Error(`${input.label} upload is unavailable.`);
    if (!allowedMime[input.kind].has(asset.mimeType) || !allowedExtension[input.kind].test(asset.safeFilename)) {
      throw new Error(input.kind === "artwork" ? `${input.label} must be a JPG/JPEG file.` : `${input.label} must be a WAV or MP3 file.`);
    }
    return;
  }

  if (!allowedExtension[input.kind].test(fileNameFromUrl(input.url))) {
    throw new Error(input.kind === "artwork" ? `${input.label} must be a JPG/JPEG file.` : `${input.label} must be a WAV or MP3 file.`);
  }
}
