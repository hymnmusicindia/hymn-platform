import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { chromium } from "@playwright/test";
import { prisma } from "../lib/prisma";
import { ALL_ADMIN_PERMISSIONS } from "../lib/access";
const origin = "http://127.0.0.1:35462";
async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55461/team_fixture")) throw Error("Isolated fixture required");
  const owner = await prisma.user.create({ data: { name: "Admin Browser Owner", email: "admin-browser-owner@example.test", googleId: "admin-browser-owner", role: "ADMIN" } });
  const role = await prisma.adminRole.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super administrator" }, update: {} });
  for (const key of ALL_ADMIN_PERMISSIONS) { const permission = await prisma.adminPermission.upsert({ where: { key }, create: { key }, update: {} }); await prisma.adminRolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, create: { roleId: role.id, permissionId: permission.id }, update: {} }); }
  await prisma.adminMembership.create({ data: { userId: owner.id, roleId: role.id } });
  const workspace = await prisma.teamWorkspace.findFirstOrThrow(); const teamRole = await prisma.teamRole.findFirstOrThrow({ where: { workspaceId: workspace.id, owner: true } });
  await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: owner.id, roleId: teamRole.id } });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "35462", "--hostname", "127.0.0.1"], { env: { ...process.env, NEXT_DIST_DIR: ".next-admin-os-browser", JWT_SECRET: "isolated-admin-os-secret", ADMIN_JWT_SECRET: "isolated-admin-os-admin-secret", NEXT_PUBLIC_APP_URL: origin, APP_URL: origin, EMAIL_ENABLED: "false" }, stdio: "ignore", windowsHide: true });
  const browser = await chromium.launch();
  try {
    for (let attempt=0;attempt<120;attempt++) { try { const r = await fetch(origin+"/api/workspaces"); if (r.status===401) break; } catch {} if(attempt===119)throw Error("Fixture server unavailable"); await new Promise(r=>setTimeout(r,1000)); }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const cookie = (u: { id: number; email: string; name: string }, userRole: string) => ({ name: "hymn_session", value: jwt.sign({ sub: u.id, email: u.email, name: u.name, role: userRole }, "isolated-admin-os-secret", { expiresIn: "1h" }), url: origin });
    await context.addCookies([cookie(owner,"admin")]); const page = await context.newPage(); page.setDefaultNavigationTimeout(120000); page.setDefaultTimeout(60000);
    await page.goto(origin+"/admin"); await page.getByRole("heading",{name:"Clarity. Then action.",exact:true}).waitFor();
    assert.equal(await page.locator('[data-admin-workspace]').count(),1); assert.equal(await page.getByRole("navigation",{name:"Admin workspace",exact:true}).count(),1);
    await page.evaluate(() => window.dispatchEvent(new Event("hymn-toggle-navigation")));
    await page.keyboard.press("Control+k");
    await page.getByLabel("Find admin module", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Find admin module", { exact: true }).evaluate(el => el === document.activeElement), true);
    await page.screenshot({ path: ".cache/admin-os-desktop.png", fullPage: true });
    await page.getByLabel("Find admin module",{exact:true}).fill("Royalty"); await page.getByRole("navigation",{name:"Admin workspace",exact:true}).getByRole("link",{name:"Royalty Management",exact:true}).waitFor();
    await page.getByLabel("Find admin module",{exact:true}).fill("");
    await page.getByRole("navigation",{name:"Admin workspace",exact:true}).getByRole("link",{name:"Team",exact:true}).click(); await page.getByRole("heading",{name:"Who can do what",exact:true}).waitFor();
    await page.goto(origin+"/admin/royalties"); await page.getByRole("heading",{name:"Royalty Management",exact:true}).waitFor(); assert.equal(await page.getByRole("navigation",{name:"Admin workspace",exact:true}).count(),1);
    await page.setViewportSize({width:390,height:844}); await page.getByRole("button",{name:"Open admin navigation",exact:true}).click(); await page.getByRole("navigation",{name:"Admin workspace",exact:true}).getByRole("link",{name:"Operations Dashboard",exact:true}).click(); await page.getByRole("heading",{name:"Clarity. Then action.",exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({ path: ".cache/admin-os-mobile.png", fullPage: true });
    const options = await context.request.get(origin+"/api/workspaces"); const data = await options.json(); assert.ok(data.items.some((w:{kind:string})=>w.kind==="admin")); assert.ok(data.items.some((w:{kind:string})=>w.kind==="team"));
    const founder = await prisma.user.findUniqueOrThrow({where:{email:"founder@example.test"}}); const staffContext = await browser.newContext(); await staffContext.addCookies([cookie(founder,"customer")]);
    const staffOptions = await (await staffContext.request.get(origin+"/api/workspaces")).json(); assert.equal(staffOptions.items.some((w:{kind:string})=>w.kind==="admin"),false);
    const denied = await staffContext.request.get(origin+"/api/admin/memberships"); assert.equal(denied.status(),403);
    await prisma.adminMembership.update({where:{userId:owner.id},data:{active:false,revokedAt:new Date()}});
    const revoked = await (await context.request.get(origin+"/api/workspaces")).json(); assert.equal(revoked.items.some((w:{kind:string})=>w.kind==="admin"),false);
    console.log("PASS: one unified admin shell, visual command centre, module finder, actual role matrix, nested finance route, mobile navigation/no overflow, permission-aware workspace switching, Team-owner denial and immediate revocation.");
  } finally { await browser.close(); if(process.platform==="win32"&&server.pid)await new Promise<void>(resolve=>{const child=spawn("taskkill",["/PID",String(server.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});child.on("exit",()=>resolve());});else server.kill(); }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
