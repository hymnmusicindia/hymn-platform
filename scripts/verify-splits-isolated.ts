import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const fixture = mkdtempSync(path.join(os.tmpdir(), "hymn-splits-"));
const databaseDir = path.join(fixture, "pg"); const port = 55451;
const environment = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/splits_fixture`, DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/splits_fixture`, EMAIL_ENABLED: "false", GROWTH_ANALYTICS_ENABLED: "false", GOOGLE_SHEETS_ENABLED: "false" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => {
  const child = spawn(executable, args, { env: environment, stdio: "inherit", windowsHide: true });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Fixture command exited ${code}`)));
});
async function main() {
  const oldSchema = path.join(fixture, "schema.prisma");
  const baseline = readFileSync("prisma/schema.prisma", "utf8")
    .replace(/^model UserHandle(?:Reservation)? \{[\s\S]*?^\}/gm, "")
    .replace(/^\s*handle UserHandle\?\r?$/gm, "")
    .replace(/^\s*handleReservations UserHandleReservation\[\]\r?$/gm, "");
  writeFileSync(oldSchema, baseline);
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase("splits_fixture");
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", oldSchema, "--skip-generate"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261011120000_artist_handles/migration.sql", "--schema", "prisma/schema.prisma"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-splits-integration.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"));
    else await pg.stop();
    console.log(`Isolated fixture retained at ${fixture}; production database was not used.`);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
