import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
const fixture = mkdtempSync(path.join(os.tmpdir(), "hymn-team-")); const databaseDir = path.join(fixture, "pg");
const env = { ...process.env, DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:55461/team_fixture", EMAIL_ENABLED: "false" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => { const child = spawn(executable, args, { env, stdio: "inherit", windowsHide: true }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Fixture command exited ${code}`))); });
async function main() {
  const pg = new EmbeddedPostgres({ databaseDir, port: 55461, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase("team_fixture");
    // Start with the unchanged application schema, then exercise the additive SQL.
    const baseline = path.join(fixture, "baseline.prisma");
    writeFileSync(baseline, readFileSync("prisma/schema.prisma", "utf8").replace(/^model Team\w+ \{[\s\S]*?^\}\r?\n/gm, "").replace(/^  teamMemberships TeamMember\[\]\r?\n/gm, "").replace(/^  teamProspect TeamProspect\?\r?\n/gm, ""));
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", baseline, "--skip-generate"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261015190000_team_os/migration.sql", "--schema", "prisma/schema.prisma"]);
    if (process.argv.includes("--generate-advanced")) await run(["node_modules/prisma/build/index.js", "migrate", "diff", "--from-url", env.DATABASE_URL, "--to-schema-datamodel", "prisma/schema.prisma", "--script", "--output", "prisma/migrations/20261015220000_team_os_complete/migration.sql"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261015220000_team_os_complete/migration.sql", "--schema", "prisma/schema.prisma"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261016090000_team_calendar_clients/migration.sql", "--schema", "prisma/schema.prisma"]);
    await run(["--import", "tsx", "scripts/verify-team-owner-bootstrap.ts"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-team-os.ts"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-team-os-advanced.ts"]);
    if (process.argv.includes("--live-chat")) await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-live-chat-browser.ts"]);
    if (process.argv.includes("--upgrade")) {
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-admin-workspace.ts"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-workspace-upgrade.ts"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-workspace-upgrade-browser.ts"]);
    }
    if (process.argv.includes("--admin")) await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-admin-workspace.ts"]);
    if (process.argv.includes("--browser")) await run(["--import", "tsx", "scripts/verify-team-os-browser.ts"]);
    if (process.argv.includes("--admin")) await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-admin-workspace-browser.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop();
    console.log("Isolated database stopped. Production data and accounts were not touched.");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
