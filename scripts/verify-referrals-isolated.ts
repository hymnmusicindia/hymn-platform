import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";

mkdirSync(".cache", { recursive: true });
const reuse = process.argv.find(arg => arg.startsWith("--reuse="))?.slice(8);
const fixture = reuse ? path.resolve(reuse) : mkdtempSync(path.resolve(".cache/hymn-referrals-"));
if (!fixture.startsWith(path.resolve(".cache/hymn-referrals-"))) throw new Error("Fixture must stay within workspace cache.");
const databaseDir = path.join(fixture, "pg"); const port = 55452;
const environment = { ...process.env, NODE_ENV: "development", DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/referral_fixture`, DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/referral_fixture`, EMAIL_ENABLED: "false", RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", NEXT_PUBLIC_RAZORPAY_KEY_ID: "", PRIVATE_STORAGE_ROOT: path.join(fixture,"private"), TEMP: fixture, TMP: fixture, GROWTH_ANALYTICS_ENABLED: "false", GOOGLE_SHEETS_ENABLED: "false" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => {
  const child = spawn(executable, args, { env: environment, stdio: "inherit", windowsHide: true });
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Fixture command exited ${code}`)));
});
async function main() {
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  if (!reuse) await pg.initialise(); await pg.start();
  try {
    if (!reuse) await pg.createDatabase("referral_fixture");
    if (process.argv.includes("--mail-only")) { await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-referral-mail.ts"]); return; }
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate", "--force-reset"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-lifetime-referral-migration.ts"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-referral-domain.ts"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-lifetime-referrals.ts"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-referral-network.ts"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-referral-mail.ts"]);
    if (process.argv.includes("--payments")) for (const script of ["verify-payment-webhooks-integration", "verify-studio-services-integration"]) await run(["--conditions=react-server", "--import", "tsx", `scripts/${script}.ts`]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"));
    else await pg.stop();
    console.log(`Isolated fixture retained at ${fixture}; production database was not used.`);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
