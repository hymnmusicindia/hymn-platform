import { spawn } from "node:child_process";
import path from "node:path";
import { assertProductionDatabaseReady } from "../lib/production-database-safety";
import { PrismaClient } from "@prisma/client";
import { assertDireNoteSchemaReady } from "../lib/direnote-schema-readiness";
import { startCronScheduler } from "./cron-scheduler";

async function main() {
  const identity = await assertProductionDatabaseReady();
  const db = new PrismaClient();
  try { await assertDireNoteSchemaReady(db); } finally { await db.$disconnect(); }
  console.log("Production database identity and schema preflight passed.");
  if (!identity.restrictedRole) console.warn("Database safety warning: runtime DATABASE_URL has schema-creation privileges. Use a restricted runtime role.");
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local application port.");
  const child = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start"], { cwd: process.cwd(), stdio: "inherit", env: process.env, windowsHide: true });
  let scheduler: ReturnType<typeof startCronScheduler> | undefined;
  const startup = setTimeout(() => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) { console.error("Scheduled automation unavailable: CRON_SECRET is missing."); return; }
    if (process.env.HYMN_CRON_WORKER_ENABLED === "false") { console.warn("Hostinger cron worker disabled; an external scheduler is required."); return; }
    scheduler = startCronScheduler({ port, secret });
    console.log("Central cron scheduler started; durable endpoint leases protect overlapping triggers.");
  }, 30000);
  const stop = () => { clearTimeout(startup); scheduler?.stop(); };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stop(); child.kill(signal); });
  child.on("error", () => { stop(); console.error("Production web process failed to start."); process.exitCode = 1; });
  child.on("exit", (code, signal) => { stop(); process.exitCode = code ?? (signal ? 1 : 0); });
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Production startup failed safely."); process.exitCode = 1; });
