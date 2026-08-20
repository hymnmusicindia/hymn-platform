import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { prisma } from "../lib/prisma";

function run(args: string[]) {
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [prismaCli, ...args], { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.error) throw new Error(`Unable to start Prisma CLI: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Prisma command failed: ${args.join(" ")}`);
}

async function main() {
  if (process.env.CONFIRM_EMPTY_DATABASE_BASELINE !== "yes") throw new Error("Set CONFIRM_EMPTY_DATABASE_BASELINE=yes only for a new, disposable empty PostgreSQL database.");
  const tables = await prisma.$queryRaw<Array<{ tableName: string }>>`SELECT tablename AS "tableName" FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) throw new Error(`Refusing fresh baseline: target database already contains ${tables.length} public table(s).`);
  await prisma.$disconnect();
  run(["db", "execute", "--schema", "prisma/schema.prisma", "--file", "prisma/fresh-baseline.sql"]);
  const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
  const migrations = readdirSync(migrationRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const migration of migrations) run(["migrate", "resolve", "--applied", migration]);
  run(["migrate", "deploy"]);
  console.log(`Fresh baseline installed and ${migrations.length} historical migrations recorded as applied.`);
}

main().catch(async error => { console.error(error instanceof Error ? error.message : "Fresh migration failed."); await prisma.$disconnect().catch(() => undefined); process.exitCode = 1; });
// vercel trigger 9
