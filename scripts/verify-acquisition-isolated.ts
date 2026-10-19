import EmbeddedPostgres from "embedded-postgres";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// Keep the disposable PostgreSQL fixture inside the workspace on Windows,
// where the embedded server cannot initialise under the profile temp path.
const tempRoot = process.platform === "win32" ? path.resolve(".cache") : path.resolve(os.tmpdir());
mkdirSync(tempRoot, { recursive: true });
const fixture = mkdtempSync(path.join(tempRoot, "hymn-acquisition-"));
const databaseDir = path.join(fixture, "pg"); const port = 55473;
const env = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/acquisition_fixture`, DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/acquisition_fixture`, EMAIL_ENABLED: "false", NODE_ENV: "test" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => {
  const child = spawn(executable, args, { env, stdio: "inherit", windowsHide: true });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Acquisition fixture command exited ${code}`)));
});

async function main() {
  const oldSchema = path.join(fixture, "baseline.prisma");
  // Build the pre-feature schema from the base revision, then apply the
  // acquisition SQL migration exactly as production would. Using HEAD here
  // includes the feature models and makes the migration create duplicate tables.
  writeFileSync(oldSchema, execFileSync("git", ["show", "83ca6fe86ccb00ed78c9c080413e93284a682e7d:prisma/schema.prisma"], { encoding: "utf8", windowsHide: true }));
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase("acquisition_fixture");
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", oldSchema, "--skip-generate"]);
    const migrations = readdirSync("prisma/migrations", { withFileTypes: true }).filter(entry => entry.isDirectory() && /^20261019\d+_/.test(entry.name)).map(entry => path.join("prisma/migrations", entry.name, "migration.sql")).sort();
    for (const migration of migrations) await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", migration, "--schema", "prisma/schema.prisma"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-acquisition-domain.ts"]);
    if (process.argv.includes("--browser")) await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-acquisition-browser.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop();
    if (path.resolve(fixture).startsWith(`${tempRoot}${path.sep}`)) rmSync(fixture, { recursive: true, force: true });
    console.log("Isolated acquisition database stopped; the production database was not used.");
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
