import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const fixture = mkdtempSync(path.join(os.tmpdir(), "hymn-referrals-"));
const databaseDir = path.join(fixture, "pg"); const port = 55452;
const environment = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/referral_fixture`, DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/referral_fixture`, EMAIL_ENABLED: "false", GROWTH_ANALYTICS_ENABLED: "false", GOOGLE_SHEETS_ENABLED: "false" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => {
  const child = spawn(executable, args, { env: environment, stdio: "inherit", windowsHide: true });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Fixture command exited ${code}`)));
});
async function main() {
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase("referral_fixture");
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-referral-domain.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"));
    else await pg.stop();
    console.log(`Isolated fixture retained at ${fixture}; production database was not used.`);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
