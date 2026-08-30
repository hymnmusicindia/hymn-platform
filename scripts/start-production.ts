import { spawn } from "node:child_process";
import path from "node:path";
import { assertProductionDatabaseReady } from "../lib/production-database-safety";

async function main() {
  const identity = await assertProductionDatabaseReady();
  console.log("Production database identity and schema preflight passed.");
  if (!identity.restrictedRole) console.warn("Database safety warning: runtime DATABASE_URL has schema-creation privileges. Move the app to a restricted Neon role, then set REQUIRE_RESTRICTED_DATABASE_ROLE=true.");
  const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "start"], { cwd: process.cwd(), stdio: "inherit", env: process.env });
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  child.on("error", (error) => { throw error; });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Production startup failed safely."); process.exitCode = 1; });
