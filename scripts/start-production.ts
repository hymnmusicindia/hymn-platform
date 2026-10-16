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
  let teamRunning = false;
  let draftRunning = false;
  let engineerRunning = false;
  let studioRunning = false;
  const tickStudio = async () => {
    if (studioRunning || !process.env.CRON_SECRET) return;
    studioRunning = true;
    try {
      const port = Number(process.env.PORT || 3000);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return;
      const response = await fetch(`http://127.0.0.1:${port}/api/cron/studio-automation`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(60000) });
      if (!response.ok) console.error("Studio recovery automation needs attention.");
    } catch { console.error("Studio recovery automation will retry on the next tick."); }
    finally { studioRunning = false; }
  };
  const studioStartup = process.env.CRON_SECRET && process.env.STUDIO_AUTOMATION_ENABLED !== "false" ? setTimeout(() => { void tickStudio(); }, 180000) : undefined;
  const studioTimer = process.env.CRON_SECRET && process.env.STUDIO_AUTOMATION_ENABLED !== "false" ? setInterval(() => { void tickStudio(); }, 15 * 60000) : undefined;
  const tickEngineers = async () => {
    if (engineerRunning || !process.env.CRON_SECRET) return;
    engineerRunning = true;
    try { const port = Number(process.env.PORT || 3000); if (!Number.isInteger(port) || port < 1 || port > 65535) return; const response = await fetch(`http://127.0.0.1:${port}/api/cron/engineer-reminders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(290000) }); if (!response.ok) console.error("Engineer reminder automation needs attention."); }
    catch { console.error("Engineer reminder automation is temporarily unavailable."); }
    finally { engineerRunning = false; }
  };
  const engineerStartup = process.env.CRON_SECRET && process.env.ENGINEER_REMINDERS_ENABLED !== "false" ? setTimeout(() => { void tickEngineers(); }, 150000) : undefined;
  const engineerTimer = process.env.CRON_SECRET && process.env.ENGINEER_REMINDERS_ENABLED !== "false" ? setInterval(() => { void tickEngineers(); }, 60 * 60000) : undefined;
  const tickDrafts = async () => {
    if (draftRunning || !process.env.CRON_SECRET) return;
    draftRunning = true;
    try {
      const port = Number(process.env.PORT || 3000);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return;
      const response = await fetch(`http://127.0.0.1:${port}/api/cron/draft-reminders`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(290000) });
      if (!response.ok) console.error("Draft reminder automation needs attention.");
    } catch { console.error("Draft reminder automation is temporarily unavailable."); }
    finally { draftRunning = false; }
  };
  const draftStartup = process.env.CRON_SECRET && process.env.DRAFT_REMINDERS_ENABLED !== "false" ? setTimeout(() => { void tickDrafts(); }, 120000) : undefined;
  const draftTimer = process.env.CRON_SECRET && process.env.DRAFT_REMINDERS_ENABLED !== "false" ? setInterval(() => { void tickDrafts(); }, 60 * 60000) : undefined;
  const tickTeam = async () => {
    if (teamRunning || !process.env.CRON_SECRET) return; teamRunning = true;
    try { const port = Number(process.env.PORT || 3000); if (!Number.isInteger(port) || port < 1 || port > 65535) return; const response = await fetch(`http://127.0.0.1:${port}/api/cron/team-os`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(60000) }); if (!response.ok) console.error("Team OS automation will retry on the next tick."); } catch { console.error("Team OS automation is temporarily unavailable."); } finally { teamRunning = false; }
  };
  const teamStartup = process.env.CRON_SECRET && process.env.TEAM_AUTOMATION_ENABLED !== "false" ? setTimeout(() => { void tickTeam(); }, 90000) : undefined;
  const teamTimer = process.env.CRON_SECRET && process.env.TEAM_AUTOMATION_ENABLED !== "false" ? setInterval(() => { void tickTeam(); }, 15 * 60000) : undefined;
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
  child.on("exit", (code, signal) => { clearInterval(studioTimer); clearTimeout(studioStartup); clearInterval(engineerTimer); clearTimeout(engineerStartup); clearInterval(draftTimer); clearTimeout(draftStartup); clearInterval(reviewTimer); clearTimeout(reviewStartup); clearInterval(teamTimer); clearTimeout(teamStartup); process.exitCode = code ?? (signal ? 1 : 0); });
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Production startup failed safely."); process.exitCode = 1; });
