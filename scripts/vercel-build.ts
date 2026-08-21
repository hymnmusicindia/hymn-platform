import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const production = process.env.VERCEL_ENV === "production";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const FIRST_DIRENOTE_V22_MIGRATION = "20260821120000_direnote_v22_sync_reconciliation";

function command(file: string, args: string[]) {
  execFileSync(file, args, { stdio: "inherit" });
}

async function baselineLegacyProductionDatabase() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_count: bigint }>>`
      SELECT COUNT(*)::bigint AS migration_count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    `;
    const migrationTableExists = rows[0]?.migration_count === 1n;
    if (migrationTableExists) {
      const history = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations"`;
      if ((history[0]?.count ?? 0n) > 0n) return;
    }

    const requiredTables = ["users", "releases", "tracks", "artist_cards", "royalty_line_items"];
    const found = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('users', 'releases', 'tracks', 'artist_cards', 'royalty_line_items')
    `;
    const missing = requiredTables.filter((table) => !found.some((row) => row.table_name === table));
    if (missing.length) throw new Error(`Refusing to baseline an unrecognised database; required HYMN tables are missing: ${missing.join(", ")}.`);

    console.log("Baselining the recognised legacy HYMN PostgreSQL schema; legacy migrations will be recorded without re-running them.");
    const migrations = readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name < FIRST_DIRENOTE_V22_MIGRATION)
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) command(npx, ["prisma", "migrate", "resolve", "--applied", migration]);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (production) {
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error("DATABASE_URL is required for a Vercel Production deployment so Prisma migrations can be applied safely.");
    }
    await baselineLegacyProductionDatabase();
    console.log("Applying Prisma migrations for the Vercel Production deployment…");
    command(npm, ["run", "db:migrate:deploy"]);
  } else {
    console.log("Skipping Prisma migrations outside Vercel Production.");
  }

  command(npm, ["run", "build"]);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
