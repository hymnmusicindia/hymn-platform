import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

async function main() {
  assert.ok(process.env.DATABASE_URL?.includes("127.0.0.1:55461/team_fixture"));
  const member = await prisma.teamMember.findFirstOrThrow({ where: { workspace: { name: { startsWith: "Contact fixture" } }, role: { owner: true } }, include: { user: true } });
  const existing = await prisma.teamClient.findFirstOrThrow({ where: { workspaceId: member.workspaceId, name: "Existing Artist" } });
  const origin = "http://127.0.0.1:35469", secret = "team-client-browser-test-secret";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "35469", "--hostname", "127.0.0.1"], { env: { ...process.env, JWT_SECRET: secret, NEXT_DIST_DIR: ".next-team-client-review", NEXT_PUBLIC_APP_URL: origin, EMAIL_ENABLED: "false" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const browser = await chromium.launch();
  try {
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Calendar test server did not start")), 120000); server.stdout?.on("data", chunk => { if (/Ready in/.test(chunk.toString())) { clearTimeout(timer); resolve(); } }); server.stderr?.on("data", chunk => process.stderr.write(chunk)); server.on("exit", () => reject(new Error("Calendar test server exited"))); });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "hymn_session", value: jwt.sign({ sub: member.userId, name: member.user.name, email: member.user.email, role: "customer" }, secret), url: origin }]);
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    await page.goto(`${origin}/team?module=calendar&workspace=${member.workspaceId}`, { waitUntil: "load", timeout: 120000 });
    await page.getByRole("button", { name: "Schedule event", exact: true }).click();
    const dialog = page.locator("dialog[open]");
    await page.getByLabel("Event title").fill("Start-only browser appointment");
    await expect(page.getByLabel("Start time hour", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("End time hour", { exact: true })).toHaveValue("");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    assert.equal(await prisma.teamCalendarEvent.count({ where: { title: "Start-only browser appointment" } }), 0);
    await page.getByLabel("Start time hour", { exact: true }).selectOption("12");
    await page.getByLabel("Start time minute", { exact: true }).selectOption("00");
    await page.getByLabel("Start time AM or PM", { exact: true }).selectOption("AM");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0, { timeout: 120000 });
    const appointment = await prisma.teamCalendarEvent.findFirstOrThrow({ where: { title: "Start-only browser appointment" } });
    assert.equal(appointment.endsAt, null); assert.equal(appointment.startsAt.getUTCHours(), 18); assert.equal(appointment.startsAt.getUTCMinutes(), 30);
    await page.getByRole("button", { name: "New client card", exact: true }).click();
    await page.getByLabel("Primary email (optional)", { exact: true }).fill(existing.email);
    await expect(dialog.getByText("Existing HYMN account", { exact: false })).toBeVisible({ timeout: 120000 });
    await page.getByRole("button", { name: "Close calendar form" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Schedule event", exact: true }).click();
    await dialog.getByRole("button", { name: "Choose on clock" }).first().click();
    await page.getByRole("button", { name: "Start time hour 3", exact: true }).click();
    await page.getByRole("button", { name: "Start time minute 15", exact: true }).click();
    await expect(page.getByLabel("Start time hour", { exact: true })).toHaveValue("3");
    await expect(page.getByLabel("Start time minute", { exact: true })).toHaveValue("15");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    console.log("PASS: blank AM/PM controls, required-start browser validation, start-only save/midnight conversion, account matching and mobile dial layout.");
  } finally {
    await browser.close();
    if (server.pid && process.platform === "win32") await new Promise<void>(resolve => { const child = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); child.on("exit", () => resolve()); }); else server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
