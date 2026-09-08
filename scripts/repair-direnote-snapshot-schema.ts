import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { assertProductionDatabaseReady } from "../lib/production-database-safety";
import { assertDireNoteSchemaReady, missingDireNoteColumns } from "../lib/direnote-schema-readiness";

async function main() {
  const envFile = process.argv[2];
  if (!envFile) throw new Error("Provide the production environment file; --apply explicitly enables the additive repair.");
  const config = parse(await readFile(envFile));
  for (const key of ["DATABASE_URL", "EXPECTED_DATABASE_HOST", "EXPECTED_DATABASE_NAME", "EXPECTED_NEON_BRANCH_ID"]) {
    if (config[key]) process.env[key] = config[key];
  }
  if (process.argv.includes("--apply")) await assertProductionDatabaseReady(undefined, { enforceRestrictedRole: false });
  const db = new PrismaClient();
  try {
    const identity = await db.$queryRaw<Array<{ database: string; branchId: string | null }>>`
      SELECT current_database() AS database, current_setting('neon.branch_id', true) AS "branchId"
    `;
    const missing = await missingDireNoteColumns(db);
    const migrations = await db.$queryRaw<Array<{ migration_name: string; finished: boolean }>>`
      SELECT migration_name, finished_at IS NOT NULL AS finished FROM _prisma_migrations
      WHERE migration_name IN ('20260906000000_direnote_attempt_history', '20260908000000_direnote_payload_snapshots') AND rolled_back_at IS NULL
    `;
    console.log(JSON.stringify({ identity, missingColumns: missing, migrations }));
    if (!process.argv.includes("--apply")) return;
    const history = await readFile("prisma/migrations/20260906000000_direnote_attempt_history/migration.sql", "utf8");
    const snapshots = await readFile("prisma/migrations/20260908000000_direnote_payload_snapshots/migration.sql", "utf8");
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      for (const statement of history.split(";").filter(value => value.trim())) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe(snapshots);
    });
    await assertDireNoteSchemaReady(db);
    // Exercise the exact Prisma read that failed without exposing release data.
    await db.distributionSubmissionAttempt.findFirst();
    console.log("Additive history/snapshot repair verified. No release, payment, or submission records changed. The idempotent migrations remain safe for the next migrate deploy.");
  } finally { await db.$disconnect(); }
}
main().catch(error => {
  console.error(error instanceof Error && /^(Database safety check failed:|Other schema changes are missing\.|DATABASE_URL must)/.test(error.message)
    ? error.message
    : "DireNote schema inspection/repair stopped safely. Check canonical database access and migration readiness; credentials were not printed.");
  process.exitCode = 1;
});
