import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const fixture = mkdtempSync(path.join(os.tmpdir(), "hymn-merge-fixture-")); const databaseDir = path.join(fixture, "pg"); const port = 55900 + Math.floor(Math.random() * 90);
const env = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/merge_fixture`, EMAIL_ENABLED: "false", ACCOUNT_MERGE_BACKUP_KEY: "isolated-fixture-encryption-key-not-production" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => { const child = spawn(executable, args, { env, stdio: "inherit", windowsHide: true }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Fixture command exited ${code}`))); });
async function main() {
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] }); await pg.initialise(); await pg.start();
  try { await pg.createDatabase("merge_fixture"); await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"]); await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-account-merge-integration.ts"]); }
  finally { if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop(); console.log(`Isolated merge fixture retained at ${fixture}. Production accounts were not used.`); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
