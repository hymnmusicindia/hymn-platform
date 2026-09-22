import { spawnSync } from "node:child_process";
import path from "node:path";
import { assertProductionDatabaseReady } from "../lib/production-database-safety";
import { PrismaClient } from "@prisma/client";
import { assertDireNoteSchemaReady } from "../lib/direnote-schema-readiness";

async function main() {
  if (process.env.CONFIRM_EMPTY_DATABASE_BASELINE === "yes") throw new Error("Fresh-baseline confirmation must never be enabled during production migration deployment.");
  const migrationCredential = [
    ["MIGRATION_DATABASE_URL", process.env.MIGRATION_DATABASE_URL],
    ["DIRECT_URL", process.env.DIRECT_URL],
    ["DATABASE_URL_UNPOOLED", process.env.DATABASE_URL_UNPOOLED],
    ["POSTGRES_URL_NON_POOLING", process.env.POSTGRES_URL_NON_POOLING]
  ].find(([, value]) => value?.trim());
  if (!migrationCredential) throw new Error("Production migration credential is missing. Set MIGRATION_DATABASE_URL to the canonical Neon owner connection URL; DATABASE_URL must remain the restricted runtime credential.");
  process.env.DATABASE_URL = migrationCredential[1]!.trim();
  console.log(`Using the protected ${migrationCredential[0]} credential for migration deployment.`);
  const identity = await assertProductionDatabaseReady(undefined, { enforceRestrictedRole: false });
  console.log(`Database preflight passed for ${identity.database} on the configured host; required schema is present.`);
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Prisma migration deployment failed.");
  const db = new PrismaClient();
  try { await assertDireNoteSchemaReady(db); } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Migration deployment failed safely."); process.exitCode = 1; });
