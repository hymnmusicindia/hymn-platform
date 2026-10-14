import EmbeddedPostgres from "embedded-postgres";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const fixture = mkdtempSync(path.join(os.tmpdir(), "hymn-playlist-reviews-"));
const databaseDir = path.join(fixture, "pg"); const port = 55700 + Math.floor(Math.random() * 150);
const env = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/playlist_fixture`, EMAIL_ENABLED: "false", RAZORPAY_KEY_ID: "fixture", RAZORPAY_KEY_SECRET: "fixture", NEXT_PUBLIC_APP_URL: "https://hymn.fixture" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => {
  const child = spawn(executable, args, { env, stdio: "inherit", windowsHide: true }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Fixture command exited ${code}`)));
});
async function main() {
  const oldSchema = path.join(fixture, "before.prisma");
  const migrationCommit = execFileSync("git", ["log", "-n", "1", "--format=%H", "--diff-filter=A", "--", "prisma/migrations/20261014190000_playlist_reviews/migration.sql"], { encoding: "utf8", windowsHide: true }).trim();
  writeFileSync(oldSchema, execFileSync("git", ["show", `${migrationCommit ? migrationCommit + "^" : "HEAD"}:prisma/schema.prisma`], { encoding: "utf8", windowsHide: true }));
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase("playlist_fixture");
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", oldSchema, "--skip-generate"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261014190000_playlist_reviews/migration.sql", "--schema", "prisma/schema.prisma"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261015023000_playlist_release_scheduling/migration.sql", "--schema", "prisma/schema.prisma"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-playlist-reviews-integration.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop();
    console.log(`Isolated playlist fixture retained at ${fixture}; no production payments or customer records were used.`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
