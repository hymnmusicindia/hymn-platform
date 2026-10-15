import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { chromium } from "@playwright/test";
import { prisma } from "../lib/prisma";
const origin = "http://127.0.0.1:35461";
async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55461/team_fixture")) throw new Error("Isolated fixture required.");
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "35461", "--hostname", "127.0.0.1"], { env: { ...process.env, NEXT_PUBLIC_APP_URL: origin, APP_URL: origin, NEXT_DIST_DIR: ".next-team-browser", JWT_SECRET: "isolated-team-browser-secret", ADMIN_JWT_SECRET: "isolated-team-admin-secret", EMAIL_ENABLED: "false" }, stdio: "ignore", windowsHide: true });
  const browser = await chromium.launch();
  try {
    for (let attempt = 0; attempt < 120; attempt++) { try { const r = await fetch(origin + "/api/team/session"); if (r.status === 401) break; } catch { /* Wait for the isolated dev server. */ } if (attempt === 119) throw new Error("Team test server did not become ready."); await new Promise(r => setTimeout(r, 1000)); }
    const founder = await prisma.user.findUniqueOrThrow({ where: { email: "founder@example.test" } });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "hymn_session", value: jwt.sign({ sub: founder.id, email: founder.email, name: founder.name, role: "customer" }, "isolated-team-browser-secret", { expiresIn: "1h" }), url: origin }]);
    const page = await context.newPage(); page.setDefaultNavigationTimeout(120000); page.setDefaultTimeout(60000); await page.goto(origin + "/team");
    await page.getByRole("heading", { name: "Good to see you, founder." }).waitFor({ timeout: 120000 });
    await page.getByRole("button", { name: "Your profile", exact: true }).click();
    await page.getByRole("menuitem", { name: "Team Workspace", exact: true }).waitFor({ timeout: 120000 }); await page.keyboard.press("Escape");
    const csrf = await context.request.post(origin + "/api/team/tasks", { data: { title: "Must not be created", ownerId: "invalid" } }); assert.equal(csrf.status(), 403);
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    const form = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "New task", exact: true }) });
    await form.getByLabel("Title", { exact: true }).fill("Browser delegation test"); await form.getByRole("button", { name: "Save", exact: true }).click(); await form.waitFor({ state: "hidden" });
    assert.equal(await prisma.teamTask.count({ where: { title: "Browser delegation test" } }), 1);
    await page.getByRole("button", { name: "My Work", exact: true }).click();
    await page.getByRole("button").filter({ hasText: "Browser delegation test" }).click();
    const detail = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Browser delegation test", exact: true }) });
    await detail.locator('select[name="status"]').selectOption("COMPLETED"); await detail.getByRole("button", { name: "Save task update" }).click();
    await page.waitForFunction(() => document.querySelector('dialog select[name="status"]')?.getAttribute("name") === "status");
    await page.waitForTimeout(1000); assert.equal((await prisma.teamTask.findFirstOrThrow({ where: { title: "Browser delegation test" } })).status, "COMPLETED");
    await detail.getByRole("button", { name: "Close task", exact: true }).click();
    await page.getByRole("button", { name: "Knowledge Base", exact: true }).click();
    await page.getByLabel("Document title", { exact: true }).fill("Browser SOP");
    await page.getByLabel("Instructions / approved response / handover", { exact: true }).fill("Verified operational instructions from the browser test.");
    await page.getByRole("button", { name: "Save document", exact: true }).click();
    await page.getByRole("button", { name: "Browser SOP", exact: true }).waitFor();
    assert.equal(await prisma.teamDocument.count({ where: { title: "Browser SOP" } }), 1);
    await page.getByRole("button", { name: "Acquisition Costs", exact: true }).click();
    await page.getByLabel("Category", { exact: true }).fill("Browser research"); await page.getByLabel("Description", { exact: true }).fill("Actual entered acquisition cost");
    await page.getByLabel("Amount (INR)", { exact: true }).fill("50.25"); await page.getByLabel("Date (India)", { exact: true }).fill("2026-10-15");
    await page.getByRole("button", { name: "Record expense", exact: true }).click(); await page.getByText("Browser research · ₹50.25", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Discover Leads", exact: true }).click(); await page.getByLabel("Artist, genre or region", { exact: true }).fill("Hindi independent artist");
    await page.getByRole("button", { name: "Find research sources", exact: true }).click(); await page.getByRole("link", { name: "Public web research", exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("button", { name: "Open workspace navigation" }).click(); await page.getByRole("button", { name: "Team Directory", exact: true }).click();
    await page.getByRole("heading", { name: "Team Directory", exact: true }).waitFor(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const outsider = await prisma.user.create({ data: { googleId: "fixture-outsider", name: "Ordinary customer", email: "outsider@example.test" } });
    const outsiderContext = await browser.newContext(); await outsiderContext.addCookies([{ name: "hymn_session", value: jwt.sign({ sub: outsider.id, email: outsider.email, name: outsider.name, role: "customer" }, "isolated-team-browser-secret", { expiresIn: "1h" }), url: origin }]);
    const response = await outsiderContext.request.get(origin + "/api/team/tasks"); assert.equal(response.status(), 403);
    const outsiderPage = await outsiderContext.newPage(); await outsiderPage.goto(origin + "/team"); await outsiderPage.getByRole("heading", { name: "Team Workspace access required" }).waitFor();
    console.log("PASS: desktop task creation/completion persists, native dialogs work, mobile directory/navigation fits, and a normal signed-in customer is denied at page and API boundaries.");
  } finally {
    await browser.close();
    if (process.platform === "win32" && server.pid) await new Promise<void>(resolve => { const stop = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); stop.on("exit", () => resolve()); }); else server.kill();
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
