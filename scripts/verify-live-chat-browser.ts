import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, expect as baseExpect } from "@playwright/test";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { roleTemplates } from "../lib/team/policy";
import { ALL_ADMIN_PERMISSIONS } from "../lib/access";

const origin = "http://127.0.0.1:35469", secret = "live-chat-fixture-secret";
const expect = baseExpect.configure({ timeout: 120000 });
async function main() {
  assert.ok(process.env.DATABASE_URL?.includes("127.0.0.1:55461/team_fixture"));
  const workspace = await prisma.teamWorkspace.create({ data: { name: "Live chat fixture" } });
  const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: "Owner", owner: true, permissions: roleTemplates.Owner } });
  const people = await Promise.all(["Alice", "Bob", "Outsider"].map(async name => {
    const user = await prisma.user.create({ data: { name, email: `${name.toLowerCase()}-live@example.test`, googleId: `live-${name}`, role: name === "Alice" ? "ADMIN" : "CUSTOMER", avatar: "/assets/hymnlogowhite.png" } });
    const member = await prisma.teamMember.create({ data: { userId: user.id, workspaceId: workspace.id, roleId: role.id } });
    return { user, member };
  }));
  const channel = await prisma.teamChannel.create({ data: { name: "Fast conversation", workspaceId: workspace.id, memberIds: people.slice(0, 2).map(p => p.member.id) } });
  const adminRole = await prisma.adminRole.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  for (const key of ALL_ADMIN_PERMISSIONS) {
    const p = await prisma.adminPermission.upsert({ where: { key }, create: { key }, update: {} });
    await prisma.adminRolePermission.upsert({ where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } }, create: { roleId: adminRole.id, permissionId: p.id }, update: {} });
  }
  await prisma.adminMembership.create({ data: { userId: people[0].user.id, roleId: adminRole.id } });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "35469", "--hostname", "127.0.0.1"], { env: { ...process.env, NEXT_DIST_DIR: ".next-live-chat", APP_URL: origin, NEXT_PUBLIC_APP_URL: origin, JWT_SECRET: secret, EMAIL_ENABLED: "false" }, stdio: "ignore", windowsHide: true });
  const browser = await chromium.launch();
  try {
    for (let i = 0; i < 120; i++) { try { if ((await fetch(origin + "/api/workspaces")).status === 401) break; } catch {} if (i === 119) throw Error("Server unavailable"); await new Promise(r => setTimeout(r, 1000)); }
    const contexts = await Promise.all(people.map(async ({ user }) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
      await context.addCookies([{ name: "hymn_session", value: jwt.sign({ sub: user.id, name: user.name, email: user.email, role: user.role === "ADMIN" ? "admin" : "customer" }, secret, { expiresIn: "1h" }), url: origin }]);
      return context;
    }));
    assert.equal((await contexts[2].request.get(`${origin}/api/team/chat-stream?workspace=${workspace.id}&channel=${channel.id}`)).status(), 404);
    const alice = await contexts[0].newPage(), bob = await contexts[1].newPage();
    for (const page of [alice, bob]) { page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(120000); await page.goto(origin + "/team?module=chat"); await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible(); }
    await alice.bringToFront();
    await alice.route("**/api/team/messages?*", async route => { if (route.request().method() === "POST") await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
    await alice.getByRole("textbox", { name: "Message", exact: true }).fill("Instant optimistic message");
    await alice.getByRole("button", { name: "Send", exact: true }).click();
    await expect(alice.getByText("Sending…", { exact: true })).toBeVisible({ timeout: 1000 });
    await expect(alice.getByText("Sent", { exact: true })).toBeVisible();
    await bob.bringToFront();
    await expect(bob.getByText("Instant optimistic message", { exact: true })).toBeVisible();
    await expect.poll(async () => (await prisma.teamMessage.findFirstOrThrow({ where: { channelId: channel.id } })).readMemberIds.includes(people[1].member.id)).toBe(true);
    await alice.bringToFront();
    await expect(alice.getByLabel("Seen by Bob", { exact: true })).toBeVisible();
    await alice.unroute("**/api/team/messages?*");
    let fail = true;
    await alice.route("**/api/team/messages?*", async route => { if (route.request().method() === "POST" && fail) { fail = false; await route.abort(); } else await route.continue(); });
    await alice.getByRole("textbox", { name: "Message", exact: true }).fill("Retry without duplication"); await alice.getByRole("button", { name: "Send", exact: true }).click();
    await alice.getByRole("button", { name: "Not sent · Retry", exact: true }).click();
    await expect.poll(() => prisma.teamMessage.count({ where: { channelId: channel.id, body: "Retry without duplication" } })).toBe(1);
    await alice.setViewportSize({ width: 390, height: 844 });
    assert.equal(await alice.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    mkdirSync(".cache", { recursive: true }); await alice.screenshot({ path: ".cache/live-chat-mobile.png" });
    await alice.setViewportSize({ width: 1280, height: 960 });
    await alice.goto(origin + "/admin?tab=overview");
    let serverNavigations = 0;
    alice.on("request", request => { if (request.url().includes("/admin?") && request.url().includes("_rsc")) serverNavigations++; });
    await alice.getByRole("link", { name: "HYMN Revenue", exact: true }).click();
    await expect(alice.getByRole("heading", { name: "HYMN Revenue", exact: true })).toBeVisible();
    assert.equal(serverNavigations, 0, "Admin tab switches must not rerender the server page");
    await alice.goBack(); await expect(alice).toHaveURL(/tab=overview/);
    console.log("PASS: optimistic send, live cross-user delivery, visible-only avatar receipts, retry deduplication, private-channel isolation, mobile overflow, zero-RSC admin tab switches and browser back.");
  } finally {
    await browser.close();
    if (process.platform === "win32" && server.pid) await new Promise<void>(resolve => { const child = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); child.on("exit", () => resolve()); }); else server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
