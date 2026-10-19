import EmbeddedPostgres from "embedded-postgres";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const tempRoot = path.resolve(os.tmpdir());
const fixture = mkdtempSync(path.join(tempRoot, "hymn-acquisition-"));
const databaseDir = path.join(fixture, "pg"); const port = 55473;
const env = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/acquisition_fixture`, DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/acquisition_fixture`, EMAIL_ENABLED: "false", NODE_ENV: "test" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => {
  const child = spawn(executable, args, { env, stdio: "inherit", windowsHide: true });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Acquisition fixture command exited ${code}`)));
});

async function main() {
  const oldSchema = path.join(fixture, "baseline.prisma");
  writeFileSync(oldSchema, execFileSync("git", ["show", "HEAD:prisma/schema.prisma"], { encoding: "utf8", windowsHide: true }));
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase("acquisition_fixture");
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", oldSchema, "--skip-generate"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261019120000_research_acquisition/migration.sql", "--schema", "prisma/schema.prisma"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-acquisition-domain.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop();
    if (path.resolve(fixture).startsWith(`${tempRoot}${path.sep}`)) rmSync(fixture, { recursive: true, force: true });
    console.log("Isolated acquisition database stopped; the production database was not used.");
  }
}
main().catch(error => { console.error(error); process.exit(1); });
