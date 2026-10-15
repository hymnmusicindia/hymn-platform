import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
const fixture = mkdtempSync(path.join(os.tmpdir(), "hymn-pricing-")); const databaseDir = path.join(fixture, "pg");
const env = { ...process.env, DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:55462/pricing_fixture", EMAIL_ENABLED: "false" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => { const child = spawn(executable, args, { env, stdio: "inherit", windowsHide: true }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Pricing fixture failed: ${code}`))); });
async function main() {
  const pg = new EmbeddedPostgres({ databaseDir, port: 55462, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] }); await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase("pricing_fixture"); const baseline = path.join(fixture, "baseline.prisma");
    writeFileSync(baseline, readFileSync("prisma/schema.prisma", "utf8").replace(/^.*mp3PriceCents.*\r?\n/gm, ""));
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", baseline, "--skip-generate"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--schema", "prisma/schema.prisma", "--file", "prisma/migrations/20261015210000_producer_mp3_pricing/migration.sql"]);
    await run(["--import", "tsx", "scripts/verify-producer-pricing.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
