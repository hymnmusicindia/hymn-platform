import { readFileSync } from "node:fs";
import { parse } from "dotenv";
Object.assign(process.env, parse(readFileSync(".env.hostinger")));
async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { assertProductionDatabaseReady } = await import("../lib/production-database-safety");
  await assertProductionDatabaseReady(new PrismaClient());
  const { mergeApprovedAccounts } = await import("../lib/account-merge");
  const { mergedIdentityHash } = await import("../lib/merged-account-identity");
  const db = new PrismaClient();
  try {
    const option = (name: string) => process.argv[process.argv.indexOf(name) + 1];
    const sourceId = Number(option("--source-id")); const targetId = Number(option("--target-id"));
    if (!Number.isSafeInteger(sourceId) || !Number.isSafeInteger(targetId) || sourceId <= 0 || targetId <= 0) throw new Error("Explicit source/target IDs and expected email hashes are required.");
    const source = await db.user.findUniqueOrThrow({ where: { id: sourceId } }); const target = await db.user.findUniqueOrThrow({ where: { id: targetId } });
    if (mergedIdentityHash(source.email) !== option("--source-email-hash") || mergedIdentityHash(target.email) !== option("--target-email-hash")) throw new Error("Account identity changed; refusing the merge.");
    if (process.argv.includes("--apply")) {
      const ready = await fetch(`https://hymnmusic.fun/api/auth/login?mergeReady=${Date.now()}`, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(20000) });
      if (!ready.ok || (await ready.json()).accountMergeGuard !== "v2") throw new Error("The production merge/login guard is not live yet. Refusing to move account data.");
    }
    console.log(JSON.stringify(await mergeApprovedAccounts(db, { sourceId, targetId, sourceEmail: source.email, targetEmail: target.email }, process.argv.includes("--apply")), null, 2));
  }
  finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Account merge failed safely."); process.exitCode = 1; });
