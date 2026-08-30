import { spawnSync } from "node:child_process";
import path from "node:path";
import { assertProductionDatabaseReady } from "../lib/production-database-safety";

async function main() {
  if (process.env.CONFIRM_EMPTY_DATABASE_BASELINE === "yes") throw new Error("Fresh-baseline confirmation must never be enabled during production migration deployment.");
  if (process.env.MIGRATION_DATABASE_URL?.trim()) process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL.trim();
  const identity = await assertProductionDatabaseReady(undefined, { enforceRestrictedRole: false });
  console.log(`Database preflight passed for ${identity.database} on the configured host; required schema is present.`);
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Prisma migration deployment failed.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Migration deployment failed safely."); process.exitCode = 1; });
