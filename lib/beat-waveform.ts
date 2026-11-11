import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { normalizePublicUploadUrl, resolvePublicUploadPaths } from "@/lib/storage";
import { openPrivateAssetAudio } from "@/lib/private-storage";
import { managedStorageRoot } from "@/lib/hostinger-storage";
import { cachedWaveform } from "./waveform-cache";

export type BeatWaveformSource = "preview" | "master";

/** Only DB-linked, owned assets can be analysed. Never fetch a URL supplied by a visitor. */
export async function beatWaveform(beatId: number, source: BeatWaveformSource, publicOnly = true) {
  const beat = await prisma.beat.findUnique({
    where: { id: beatId }, include: { preview: true, deliverableAsset: true, user: { select: { status: true } } }
  });
  if (!beat || (publicOnly && (!beat.enabled || !["PUBLISHED", "EXCLUSIVE_RESERVED"].includes(beat.status) || beat.user.status !== "ACTIVE"))) return null;
  let file: Awaited<ReturnType<typeof fs.open>> | null = null;
  let identity: string;
  if (source === "preview") {
    const preview = beat.preview;
    const url = normalizePublicUploadUrl(preview?.publicUrl);
    if (!preview || preview.userId !== beat.userId || !url?.startsWith("/api/public-uploads/")) return null;
    const relative = url.slice("/api/public-uploads/".length).split("/").map(decodeURIComponent).join("/");
    for (const candidate of resolvePublicUploadPaths(relative)) {
      file = await fs.open(candidate, "r").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (file) break;
    }
    identity = `preview:${beat.id}:${preview.id}:${preview.checksum || ""}`;
  } else {
    const asset = beat.deliverableAsset;
    if (!asset || asset.deletedAt || (asset.retentionUntil && asset.retentionUntil <= new Date())
      || asset.ownerUserId !== beat.userId || asset.beatId !== beat.id || asset.assetType !== "private_beat_deliverable"
      || !["audio/wav", "audio/x-wav", "audio/mpeg"].includes(asset.mimeType)) return null;
    file = await openPrivateAssetAudio(asset);
    identity = `master:${beat.id}:${asset.id}:${asset.checksum}`;
  }
  if (!file) return null;
  try { return await cachedWaveform(path.join(managedStorageRoot(), "Waveforms"), identity, file); }
  finally { await file.close(); }
}

/** Uploads prepare both playable sources before publication; legacy beats use the same cache. */
export async function prepareBeatWaveforms(beatId: number) {
  const outcomes: Array<{ source: BeatWaveformSource; state: string }> = [];
  for (const source of ["preview", "master"] as const) {
    const result = await beatWaveform(beatId, source, false);
    outcomes.push({ source, state: result?.state || "not_playable" });
    if (result && result.state !== "ready") console.warn("Beat waveform analysis deferred", { beatId, source, state: result.state });
  }
  return outcomes;
}
