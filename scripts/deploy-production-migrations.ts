import { spawnSync } from "node:child_process";
import path from "node:path";
import { assertProductionDatabaseReady } from "../lib/production-database-safety";
import { PrismaClient } from "@prisma/client";
import { assertDireNoteSchemaReady } from "../lib/direnote-schema-readiness";

type MigrationIdentity = { currentUser: string; ownsMigrationLedger: boolean; foreignOwnedTables: bigint; canCreateInSchema: boolean };

async function resolveMigrationCredential() {
  const candidates = [
    ["MIGRATION_DATABASE_URL", process.env.MIGRATION_DATABASE_URL],
    ["DIRECT_URL", process.env.DIRECT_URL],
    ["DATABASE_URL_UNPOOLED", process.env.DATABASE_URL_UNPOOLED],
    ["POSTGRES_URL_NON_POOLING", process.env.POSTGRES_URL_NON_POOLING],
    ["DATABASE_URL", process.env.DATABASE_URL]
  ] as const;
  const configured = candidates.filter((entry): entry is readonly [string, string] => Boolean(entry[1]?.trim()));
  if (!configured.length) throw new Error("Production migration credential is missing. Configure MIGRATION_DATABASE_URL with the canonical database-owner connection URL.");

  for (const [name, rawUrl] of configured) {
    const url = rawUrl.trim();
    const probe = new PrismaClient({ datasourceUrl: url });
    try {
      const [identity] = await probe.$queryRaw<MigrationIdentity[]>`
        SELECT current_user AS "currentUser",
          COALESCE((SELECT tableowner = current_user FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations'), false) AS "ownsMigrationLedger",
          (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner <> current_user) AS "foreignOwnedTables",
          has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateInSchema"
      `;
      if (identity?.ownsMigrationLedger && identity.canCreateInSchema && identity.foreignOwnedTables === 0n) return { name, url };
      console.warn(`${name} is not a canonical database-owner credential; trying the next configured credential.`);
    } catch {
      console.warn(`${name} could not complete the migration ownership check; trying the next configured credential.`);
    } finally {
      await probe.$disconnect();
    }
  }
  throw new Error("No configured database URL has canonical owner access. Set MIGRATION_DATABASE_URL to the Neon owner connection URL; restricted runtime credentials cannot deploy migrations.");
}

async function main() {
  if (process.env.CONFIRM_EMPTY_DATABASE_BASELINE === "yes") throw new Error("Fresh-baseline confirmation must never be enabled during production migration deployment.");
  const migrationCredential = await resolveMigrationCredential();
  process.env.DATABASE_URL = migrationCredential.url;
  console.log(`Using the verified owner credential from ${migrationCredential.name} for migration deployment.`);
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
