import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { storageRootPath } from "../lib/storage-service";

async function walk(folder: string, root: string, files: Set<string>) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) await walk(absolute, root, files);
    else if (entry.isFile()) files.add(path.relative(root, absolute).split(path.sep).join("/"));
  }
}

async function main() {
  const root = path.resolve(storageRootPath());
  const assets = await prisma.storedAsset.findMany({ where: { storageProvider: "LOCAL", deletedAt: null }, select: { id: true, objectKey: true, relativePath: true, releaseId: true, trackId: true } });
  const files = new Set<string>();
  await walk(root, root, files);
  const keys = new Map(assets.map(asset => [(asset.relativePath || asset.objectKey).replaceAll("\\", "/"), asset]));
  const missingAssetIds: number[] = [];
  for (const [key, asset] of keys) if (!files.has(key)) missingAssetIds.push(asset.id);
  const orphanFiles = [...files].filter(file => !file.startsWith("Temp Uploads/") && !keys.has(file));
  const [releasesWithoutTracks, providerStateWithoutAttempt, orphanedPaidOrders, staleUploads] = await Promise.all([
    prisma.release.findMany({ where: { archivedAt: null, status: { not: "DRAFT" }, tracks: { none: {} } }, select: { id: true } }),
    prisma.release.findMany({ where: { direNoteStatus: { not: null }, distributionSubmissions: { none: { provider: "direnote" } } }, select: { id: true } }),
    prisma.distributionOrder.findMany({ where: { paymentStatus: "paid", fulfilledAt: null, releaseId: null, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true } }),
    prisma.uploadSession.findMany({ where: { status: { in: ["CREATED", "UPLOADING", "PAUSED", "FAILED", "ASSEMBLING", "VERIFYING"] }, updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, select: { id: true } })
  ]);
  console.log(JSON.stringify({ mode: "read-only", missingAssetIds, orphanFiles, releasesWithoutTracks: releasesWithoutTracks.map(row => row.id), providerStateWithoutAttempt: providerStateWithoutAttempt.map(row => row.id), orphanedPaidOrderIds: orphanedPaidOrders.map(row => row.id), staleUploadSessionIds: staleUploads.map(row => row.id), note: "No files or rows were changed. Review and quarantine uncertain assets manually." }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Reconciliation audit failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
