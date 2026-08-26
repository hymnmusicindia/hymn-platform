import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { storageRootPath } from "@/lib/storage-service";

export async function GET() {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  const [assets, temporary] = await Promise.all([
    prisma.storedAsset.groupBy({ by: ["category"], where: { deletedAt: null, storageProvider: "LOCAL" }, _sum: { byteSize: true }, _count: { id: true } }),
    prisma.uploadSession.aggregate({ where: { status: { in: ["CREATED", "UPLOADING", "PAUSED", "ASSEMBLING", "VERIFYING", "FAILED"] } }, _sum: { bytesUploaded: true }, _count: { id: true } }),
  ]);
  const managedBytes = assets.reduce((sum, row) => sum + Number(row._sum.byteSize || 0), 0);
  const capacityBytes = Number(process.env.HOSTINGER_STORAGE_CAPACITY_GB || 0) * 1024 ** 3;
  const disk = await fs.statfs(storageRootPath()).catch(() => null);
  const filesystem = disk ? { totalBytes: Number(disk.blocks) * Number(disk.bsize), freeBytes: Number(disk.bfree) * Number(disk.bsize), availableBytes: Number(disk.bavail) * Number(disk.bsize) } : null;
  const percent = capacityBytes > 0 ? managedBytes / capacityBytes * 100 : null;
  return NextResponse.json({ provider: "Hostinger Local", managedBytes, managedFileCount: assets.reduce((sum, row) => sum + row._count.id, 0), configuredCapacityBytes: capacityBytes || null, percent, warning: percent == null ? null : percent >= 90 ? "critical" : percent >= 80 ? "high" : percent >= 70 ? "elevated" : percent >= 60 ? "notice" : null, breakdown: assets.map(row => ({ category: row.category || "LEGACY", bytes: Number(row._sum.byteSize || 0), files: row._count.id })), temporaryUploads: { bytes: Number(temporary._sum.bytesUploaded || 0), sessions: temporary._count.id }, filesystem }, { headers: { "Cache-Control": "no-store" } });
}
