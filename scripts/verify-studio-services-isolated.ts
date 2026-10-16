import EmbeddedPostgres from "embedded-postgres";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const fixture = mkdtempSync(path.join(os.tmpdir(), "hymn-studio-"));
const databaseDir = path.join(fixture, "pg");
const port = 55600 + Math.floor(Math.random() * 300);
const database = "studio_fixture";
const webPort = 55910;
const environment = { ...process.env, DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/${database}`, DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/${database}`, PRIVATE_STORAGE_ROOT: path.join(fixture, "private-storage"), HYMN_STORAGE_ROOT: "", EMAIL_ENABLED: "false", RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", RAZORPAY_WEBHOOK_SECRET: "studio-fixture-webhook-secret", JWT_SECRET: "studio-fixture-user-session-secret-long-enough", ADMIN_JWT_SECRET: "studio-fixture-admin-session-secret-long-enough", NEXT_PUBLIC_APP_URL: `http://localhost:${webPort}`, CANONICAL_HOST: "127.0.0.1", NEXT_DIST_DIR: ".next-studio-review", HTTPS_PROXY: "", HTTP_PROXY: "", ALL_PROXY: "", NO_PROXY: "127.0.0.1,localhost", https_proxy: "", http_proxy: "", all_proxy: "", no_proxy: "127.0.0.1,localhost" };
const run = (args: string[], executable = process.execPath) => new Promise<void>((resolve, reject) => { const child = spawn(executable, args, { env: environment, stdio: "inherit", windowsHide: true }); child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Fixture command exited ${code}`))); });

async function main() {
  const previousSchema = path.join(fixture, "schema-before-studio.prisma");
  const migrationCommit = execFileSync("git", ["log", "-n", "1", "--format=%H", "--diff-filter=A", "--", "prisma/migrations/20261014120000_studio_conversation_trust/migration.sql"], { encoding: "utf8", windowsHide: true }).trim();
  writeFileSync(previousSchema, execFileSync("git", ["show", `${migrationCommit ? migrationCommit + "^" : "HEAD"}:prisma/schema.prisma`], { encoding: "utf8", windowsHide: true }));
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"] });
  await pg.initialise(); await pg.start();
  try {
    await pg.createDatabase(database);
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", previousSchema, "--skip-generate"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261014120000_studio_conversation_trust/migration.sql", "--schema", "prisma/schema.prisma"]);
    await run(["node_modules/prisma/build/index.js", "db", "execute", "--file", "prisma/migrations/20261016160000_studio_refund_recovery/migration.sql", "--schema", "prisma/schema.prisma"]);
    // The historical migration fixture must also include subsequent additive fields.
    // This targets only the freshly-created, isolated database above.
    await run(["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"]);
    await run(["--import", "tsx", "scripts/verify-studio-services-integration.ts"]);
    await run(["--import", "tsx", "scripts/verify-managed-uploads.ts"]);
    if (process.argv.includes("--chat-audit")) await run(["--import", "tsx", "scripts/audit-studio-workflow.ts"]);
    await run(["--import", "tsx", "scripts/verify-studio-financial-recovery.ts"]);
    if (process.argv.includes("--build")) await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
    if (process.argv.includes("--browser") || process.argv.includes("--chat-audit")) {
      const serverMode = process.argv.includes("--production") ? "start" : "dev";
      const serverArgs = ["node_modules/next/dist/bin/next", serverMode, "-p", String(webPort), ...(serverMode === "dev" ? ["--webpack"] : [])];
      const server = spawn(process.execPath, serverArgs, { env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Studio review server did not become ready.")), 120000);
          const inspect = (chunk: Buffer) => { const value = chunk.toString(); process.stdout.write(value); if (/Ready in|Local:/i.test(value)) { clearTimeout(timeout); resolve(); } };
          server.stdout?.on("data", inspect); server.stderr?.on("data", chunk => process.stderr.write(chunk)); server.on("exit", code => reject(new Error(`Studio review server exited ${code}`)));
        });
        await run(["--import", "tsx", process.argv.includes("--chat-audit") ? "scripts/verify-studio-live-chat.ts" : "scripts/verify-studio-browser.ts", ...(serverMode === "start" ? ["--http-only"] : []), ...(process.argv.includes("--profile-only") ? ["--profile-only"] : [])]);
      } finally {
        if (process.platform === "win32" && server.pid) await new Promise<void>(resolve => { const cleanup = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); cleanup.on("exit", () => resolve()); });
        else server.kill();
      }
    }
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe")); else await pg.stop();
    console.log(`Isolated Studio fixture retained at ${fixture}; production database was not used.`);
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
