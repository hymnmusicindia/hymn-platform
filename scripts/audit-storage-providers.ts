import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const legacyReferences: Record<string, number> = {};
  for (const table of ["users", "producer_profiles", "engineer_profiles", "engineer_applications", "uploads", "releases", "tracks", "payout_reports", "stored_assets"]) {
    const exists = await db.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=${table})`;
    if (exists[0]?.exists) {
      const rows = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS count FROM "${table}" t WHERE to_jsonb(t)::text LIKE '%vercel-storage.com%'`);
      legacyReferences[table] = Number(rows[0].count);
    }
  }
  console.log(JSON.stringify({
    legacyReferences,
    providers: await db.storedAsset.groupBy({ by: ["storageProvider"], _count: true, where: { deletedAt: null } }),
    remoteWithLocalCopy: await db.storedAsset.count({ where: { storageProvider: "vercel_blob", relativePath: { not: null }, deletedAt: null } }),
    remoteWithoutLocalCopy: await db.storedAsset.count({ where: { storageProvider: "vercel_blob", relativePath: null, deletedAt: null } }),
    remoteReports: await db.payoutReport.count({ where: { storagePath: { startsWith: "https://" } } }),
  }, null, 2));
}
main().finally(() => db.$disconnect());
