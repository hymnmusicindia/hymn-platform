import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const directory = mkdtempSync(path.join(os.tmpdir(), "hymn-manual-plans-"));
const env = { ...process.env, DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:55467/manual_plans", EMAIL_ENABLED: "false", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:35467", APP_URL: "http://127.0.0.1:35467", JWT_SECRET: "manual-plans-fixture-secret", ADMIN_JWT_SECRET: "manual-plans-admin-fixture-secret", NEXT_DIST_DIR: ".next-manual-plans-browser" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => { const child = spawn(executable, args, { env, stdio: "inherit", windowsHide: true }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(Error(`Fixture command failed (${code}).`))); });
async function main() {
  const pg = new EmbeddedPostgres({ databaseDir: path.join(directory, "pg"), port: 55467, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise(); await pg.start();
  try { await pg.createDatabase("manual_plans"); await run(["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"]); await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-manual-subscriptions.ts", ...(process.argv.includes("--browser") ? ["--browser"] : [])]); }
  finally { if (process.platform === "win32") await run(["-D", path.join(directory, "pg"), "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
