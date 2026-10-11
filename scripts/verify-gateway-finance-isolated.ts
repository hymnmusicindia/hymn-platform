import EmbeddedPostgres from "embedded-postgres";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";

const reuse = process.argv.find(arg => arg.startsWith("--reuse="))?.slice(8);
const fixture = reuse ? path.resolve(reuse) : mkdtempSync(path.resolve(".cache/gateway-test-"));
if (!fixture.startsWith(path.resolve(".cache/gateway-test-"))) throw new Error("Fixture must be inside the workspace gateway test directory.");
const databaseDir = path.join(fixture, "pg"); const port = Number(process.argv.find(arg => arg.startsWith("--port="))?.slice(7)) || 55800 + Math.floor(Math.random() * 100);
if (port < 55800 || port > 55899) throw new Error("Gateway fixture port must be 55800–55899.");
const environment = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/gateway_fixture`, EMAIL_ENABLED: "false", RAZORPAY_KEY_ID: "rzp_test_fixture", RAZORPAY_KEY_SECRET: "fixture-secret", TEMP: path.resolve(".cache"), TMP: path.resolve(".cache") };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => { const child = spawn(executable, args, { env: environment, stdio: "inherit", windowsHide: true }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Fixture command exited ${code}`))); });
async function main() {
  const previous = path.join(fixture, "before.prisma");
  writeFileSync(previous, execFileSync("git", ["show", "HEAD:prisma/schema.prisma"], { encoding: "utf8", windowsHide: true }));
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  if (!reuse) await pg.initialise();
  await pg.start();
  try {
    if (!reuse) {
      await pg.createDatabase("gateway_fixture");
      await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", previous, "--skip-generate"]);
      await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261012120000_gateway_settlements_route/migration.sql", "--schema", "prisma/schema.prisma"]);
    }
    await run(["--import", "tsx", "scripts/verify-gateway-finance-integration.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop();
    console.log(`Isolated fixture retained at ${fixture}. No live transfers or production data were used.`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
