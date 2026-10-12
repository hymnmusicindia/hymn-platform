import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";

async function main() {
  mkdirSync(".cache", { recursive: true });
  const reuse = process.argv.find(arg => arg.startsWith("--reuse="))?.slice(8);
  const fixture = reuse ? path.resolve(reuse) : mkdtempSync(path.resolve(".cache/payment-audit-"));
  if (!fixture.startsWith(path.resolve(".cache/payment-audit-"))) throw new Error("Audit fixture must stay inside the workspace cache.");
  const databaseDir = path.join(fixture, "pg");
  const port = Number(process.argv.find(arg => arg.startsWith("--port="))?.slice(7)) || 55700 + Math.floor(Math.random() * 90);
  if (port < 55700 || port > 55789) throw new Error("Invalid audit fixture port.");
  const url = `postgresql://fixture:fixture@127.0.0.1:${port}/payments_fixture`;
  const environment = { ...process.env, NODE_ENV: "development", DATABASE_URL: url, DIRECT_URL: url, EMAIL_ENABLED: "false", RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", NEXT_PUBLIC_RAZORPAY_KEY_ID: "", RAZORPAY_WEBHOOK_SECRET: "fixture-webhook-secret", PRIVATE_STORAGE_ROOT: path.join(fixture, "private"), HYMN_STORAGE_ROOT: "", STORAGE_ROOT: path.join(fixture, "public"), TEMP: fixture, TMP: fixture };
  const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { env: environment, stdio: "inherit", windowsHide: true });
    child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Payment audit command exited ${code}`)));
  });
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  if (!reuse) await pg.initialise();
  await pg.start();
  try {
    if (!reuse) {
      await pg.createDatabase("payments_fixture");
      await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"]);
    }
    for (const script of ["verify-payment-webhooks-integration", "verify-studio-services-integration"]) {
      await run(["--conditions=react-server", "--import", "tsx", `scripts/${script}.ts`]);
    }
    console.log("PASS isolated PostgreSQL payment audit; no production database, payment credentials or outgoing email used.");
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"));
    else await pg.stop();
    console.log(`Audit fixture retained at ${fixture}`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
