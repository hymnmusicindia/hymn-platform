import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import path from "node:path";

const databaseDir = path.resolve(".cache", `direnote-postgres-${Date.now()}`);
const port = 55439;
const environment = { ...process.env,
  DATABASE_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/direnote_virtual?connection_limit=12`,
  DIRECT_URL: `postgresql://fixture:fixture@127.0.0.1:${port}/direnote_virtual`,
  DIRENOTE_API_PIN: "fixture-pin", DIRENOTE_CLIENT_ID: "fixture-client",
  DIRENOTE_INGEST_ENDPOINT: "http://127.0.0.1:55440/ingest_content",
  DIRENOTE_RELEASE_INFORMATION_ENDPOINT: "http://127.0.0.1:55440/check_release_status",
  DIRENOTE_REVENUE_REPORT_ENDPOINT: "http://127.0.0.1:55440/check_revenue_report",
  EMAIL_ENABLED: "false", RESEND_API_KEY: "", CRON_SECRET: "fixture-cron",
  RAZORPAY_KEY_ID: "rzp_test_fixture", RAZORPAY_KEY_SECRET: "fixture-razorpay-secret", NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_fixture",
  HTTPS_PROXY: "", HTTP_PROXY: "", ALL_PROXY: "",
  JWT_SECRET: "fixture-user-session-secret-long-enough", ADMIN_JWT_SECRET: "fixture-admin-session-secret-long-enough",
  CANONICAL_HOST: "127.0.0.1",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:55441", NEXT_DIST_DIR: ".next-direnote-virtual",
  DIRENOTE_RELEASE_SYNC_ENABLED: "true"
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
  const pg = new EmbeddedPostgres({ databaseDir, port, user: "fixture", password: "fixture", persistent: true, postgresFlags: ["-h", "127.0.0.1"], onLog: message => { startupLogs.push(message); if (startupLogs.length > 30) startupLogs.shift(); }, onError: message => console.error(message) });
  await pg.initialise();
  try { await pg.start(); }
  catch { throw new Error(`Isolated PostgreSQL startup failed: ${startupLogs.join("\n")}`); }
  try {
    await pg.createDatabase("direnote_virtual");
    await run(["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"]);
    if (process.argv.includes("--build")) await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
    await run(["--conditions=react-server", "--import", "tsx", "scripts/verify-direnote-lifecycle.ts", ...(process.argv.includes("--build") || process.argv.includes("--browser") ? ["--browser"] : [])]);
  } finally {
    if (process.platform === "win32") await run(["-D", databaseDir, "-m", "fast", "-w", "stop"], path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"));
    else await pg.stop();
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
