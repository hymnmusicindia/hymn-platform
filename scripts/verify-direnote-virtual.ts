import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import path from "node:path";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const databaseDir = path.join(mkdtempSync(path.join(tmpdir(), "hymn-direnote-")), "pg");
const port = 55439;
// Child processes use .cache as their temp directory. A fresh CI checkout has no
// such folder, and Prisma fails resolving a missing temp path before any test runs.
mkdirSync(path.resolve(".cache"), { recursive: true });
const environment = { ...process.env,
  DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/direnote_virtual?connection_limit=12`,
  DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/direnote_virtual`,
  DIRENOTE_API_PIN: "fixture-pin", DIRENOTE_CLIENT_ID: "fixture-client",
  DIRENOTE_INGEST_ENDPOINT: "http://127.0.0.1:55440/ingest_content",
  DIRENOTE_INGEST_STATUS_ENDPOINT: "http://127.0.0.1:55440/ingest_status",
  DIRENOTE_RELEASE_INFORMATION_ENDPOINT: "http://127.0.0.1:55440/check_release_status",
  DIRENOTE_REVENUE_REPORT_ENDPOINT: "http://127.0.0.1:55440/check_revenue_report",
  DIRENOTE_ARTIST_INFORMATION_ENDPOINT: "http://127.0.0.1:55440/check_artist",
  DIRENOTE_SONGWRITER_INFORMATION_ENDPOINT: "http://127.0.0.1:55440/check_songwriter",
  EMAIL_ENABLED: "false", CRON_SECRET: "fixture-cron",
  HYMN_STORAGE_ROOT: path.join(databaseDir, "private-storage"),
  HYMN_ALLOW_STORAGE_ROOT_OVERRIDE: "true",
  RAZORPAY_KEY_ID: "rzp_test_fixture", RAZORPAY_KEY_SECRET: "fixture-razorpay-secret", NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_fixture",
  HTTPS_PROXY: "", HTTP_PROXY: "", ALL_PROXY: "",
  JWT_SECRET: "fixture-user-session-secret-long-enough", ADMIN_JWT_SECRET: "fixture-admin-session-secret-long-enough",
  CANONICAL_HOST: "127.0.0.1",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:55441", APP_URL: "https://hymnmusic.fun", NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-direnote-virtual",
  DIRENOTE_RELEASE_SYNC_ENABLED: "true",
  TEMP: path.resolve(".cache"), TMP: path.resolve(".cache")
};

function run(args: string[], executable = process.execPath) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { env: environment, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`${args[0]} exited ${code}`)));
  });
}

async function main() {
  const startupLogs: string[] = [];
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"], postgresFlags: ["-h", "127.0.0.1"], onLog: message => { startupLogs.push(message); if (startupLogs.length > 30) startupLogs.shift(); }, onError: message => console.error(message) });
  await pg.initialise();
  try { await pg.start(); }
  catch { throw new Error(`Isolated PostgreSQL startup failed: ${startupLogs.join("\n")}`); }
  try {
    await pg.createDatabase("direnote_virtual");
    await run(["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"]);
    if (process.argv.includes('--reports-only')) {
      if (process.argv.includes('--build')) await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
      await run(['--conditions=react-server','--import','tsx','scripts/verify-distribution-reports.ts']);
      await run(['--conditions=react-server','--import','tsx','scripts/verify-royalty-ledger-integration.ts']);
      return;
    }
    if(process.argv.includes('--qc-report-only')){
      await run(['--conditions=react-server','--import','tsx','scripts/verify-release-qc-details.ts']);
      return;
    }
    if (process.argv.includes('--producer-workflow-only')) {
      await run(['--conditions=react-server','--import','tsx','scripts/verify-producer-workflow.ts']);
      return;
    }
    if (process.argv.includes("--policy-only")) {
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-policy-agreement.ts"]);
      return;
    }
    if (process.argv.includes("--release-email-only")) {
      if (process.argv.includes("--build")) await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-release-email-lifecycle.ts"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-draft-reminders.ts"]);
      return;
    }
    if (process.argv.includes("--cron-only")) {
      if (process.argv.includes("--build")) await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-cron-integration.ts"]);
      return;
    }
    if (process.argv.includes("--reconciliation-cron-only")) {
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-direnote-reconciliation-cron.ts"]);
      return;
    }
    if (process.argv.includes("--release-save-only")) {
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-release-pipeline-integration.ts"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-release-credit-batch.ts"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-release-change-requests-integration.ts"]);
      return;
    }
    if (process.argv.includes("--storage-only")) {
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-private-storage-integration.ts"]);
      return;
    }
    if (process.argv.includes("--v24-only")) {
      if (process.argv.includes("--build")) await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-direnote-v24-http.ts"]);
      return;
    }
    if (process.argv.includes("--lifecycle-only")) {
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-direnote-lifecycle.ts"]);
      return;
    }
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-release-pipeline-integration.ts"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-release-change-requests-integration.ts"]);
    if (process.argv.includes("--build")) await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
    if (process.argv.includes("--checkout-only")) {
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-direnote-lifecycle.ts"]);
      await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-first-release-http.ts"]);
    }
    else await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-direnote-lifecycle.ts", ...(process.argv.includes("--build") || process.argv.includes("--browser") ? ["--browser"] : [])]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-direnote-artist-enrichment.ts"]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"));
    else await pg.stop();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
