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
  if (!identity.restrictedRole) console.warn("Database safety warning: runtime DATABASE_URL has schema-creation privileges. Use a restricted runtime role.");
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local application port.");
  const child = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start"], { cwd: process.cwd(), stdio: "inherit", env: process.env, windowsHide: true });
  // The cron worker starts inside the Next.js process (instrumentation.ts), so it
  // also runs when the host launches Next directly rather than through this script.
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { child.kill(signal); });
  child.on("error", () => { console.error("Production web process failed to start."); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Production startup failed safely."); process.exitCode = 1; });
