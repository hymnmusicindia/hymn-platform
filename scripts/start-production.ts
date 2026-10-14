import { spawn } from "node:child_process";
import path from "node:path";
import { assertProductionDatabaseReady } from "../lib/production-database-safety";
import { PrismaClient } from "@prisma/client";
import { assertDireNoteSchemaReady } from "../lib/direnote-schema-readiness";

async function main() {
  const identity = await assertProductionDatabaseReady();
  const db = new PrismaClient();
  try { await assertDireNoteSchemaReady(db); } finally { await db.$disconnect(); }
  console.log("Production database identity and schema preflight passed.");
  if (!identity.restrictedRole) console.warn("Database safety warning: runtime DATABASE_URL has schema-creation privileges. Move the app to a restricted Neon role, then set REQUIRE_RESTRICTED_DATABASE_ROLE=true.");
  const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "start"], { cwd: process.cwd(), stdio: "inherit", env: process.env });
  // Hostinger runs this long-lived entrypoint; vercel.json alone cannot install
  // a Hostinger cron. The endpoint's database lease handles multiple instances.
  let reviewTimer: ReturnType<typeof setInterval> | undefined;
  let reviewStartup: ReturnType<typeof setTimeout> | undefined;
  let reviewRunning = false;
  const tickReviews = async () => {
    if (reviewRunning || !process.env.CRON_SECRET) return;
    reviewRunning = true;
    try {
      const port = Number(process.env.PORT || 3000);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local application port.");
      const response = await fetch(`http://127.0.0.1:${port}/api/cron/playlist-reviews`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(290000) });
      if (!response.ok) console.error("Playlist review automation needs attention", { status: response.status });
    } catch { console.error("Playlist review automation could not complete; it will retry on the next tick."); }
    finally { reviewRunning = false; }
  };
  if (process.env.CRON_SECRET && process.env.PLAYLIST_REVIEW_AUTOMATION_ENABLED !== "false") {
    reviewStartup = setTimeout(() => { void tickReviews(); }, 60000);
    reviewTimer = setInterval(() => { void tickReviews(); }, 15 * 60000);
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  child.on("error", (error) => { throw error; });
  child.on("exit", (code, signal) => { clearInterval(reviewTimer); clearTimeout(reviewStartup); process.exitCode = code ?? (signal ? 1 : 0); });
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Production startup failed safely."); process.exitCode = 1; });
