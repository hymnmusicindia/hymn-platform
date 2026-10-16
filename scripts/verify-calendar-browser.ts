import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
import { chromium, expect as baseExpect } from "@playwright/test";
import { prisma } from "../lib/prisma";
const expect = baseExpect.configure({ timeout: 90000 });
async function main() {
  assert.ok(process.env.DATABASE_URL?.includes("127.0.0.1:55461/team_fixture")); const origin = "http://127.0.0.1:35469", secret = "calendar-browser-fixture-secret";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "35469", "--hostname", "127.0.0.1"], { env: { ...process.env, JWT_SECRET: secret, ADMIN_JWT_SECRET: "calendar-admin-fixture-secret", APP_URL: origin, NEXT_PUBLIC_APP_URL: origin, NEXT_DIST_DIR: ".next-workspace-upgrade", EMAIL_ENABLED: "false" }, stdio: "ignore", windowsHide: true });
  const browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage(); page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(120000);
  try {
    for (let i=0;i<120;i++) { try { if ((await fetch(origin+"/api/workspaces")).status===401) break; } catch {} if(i===119)throw Error("Fixture unavailable"); await new Promise(r=>setTimeout(r,1000)); }
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "calendar-owner@example.test" } });
    const member = await prisma.teamMember.findFirstOrThrow({ where: { userId: user.id } });
    await context.addCookies([{ name:"hymn_session", value:jwt.sign({sub:user.id,name:user.name,email:user.email,role:"customer"},secret,{expiresIn:"1h"}),url:origin }]);
    const result = await context.request.get(`${origin}/api/team/members?workspace=${member.workspaceId}`, {timeout:120000}); assert.equal(result.status(),200); console.log("Calendar member directory:", (await result.json()).items.map((m:{status:string;user:{name:string}})=>`${m.user.name}:${m.status}`).join(", "));
    await page.goto(origin+"/team?module=calendar"); await page.getByRole("button",{name:"New client card",exact:true}).click();
    const form=page.getByRole("dialog").filter({has:page.getByRole("heading",{name:"New client card",exact:true})}); await expect(form).toBeVisible();
    await expect(form.getByLabel("Responsible teammate")).toHaveValue(member.id);
    const name=`Browser Client ${Date.now()}`; await form.getByLabel("Name",{exact:true}).fill(name); await form.getByRole("button",{name:"Save",exact:true}).click(); await expect(form).not.toBeVisible();
    const card=page.locator("article").filter({has:page.getByText(name,{exact:true})}); await expect(card).toBeVisible(); await card.getByRole("button",{name:"Schedule",exact:true}).click();
    const event=page.getByRole("dialog").filter({has:page.getByRole("heading",{name:"Schedule event",exact:true})}); await event.getByRole("button",{name:"Save",exact:true}).click(); await expect(event).not.toBeVisible();
    await expect(page.getByText(`Call ${name}`,{exact:false}).first()).toBeVisible(); mkdirSync(".cache",{recursive:true}); await page.screenshot({path:".cache/team-calendar-desktop.png"});
    await page.setViewportSize({width:390,height:844}); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false); await page.screenshot({path:".cache/team-calendar-mobile.png"});
    console.log("PASS: immediate assignee, saved client card, scheduled call and desktop/mobile shared calendar without overflow.");
  } catch(error) { mkdirSync(".cache",{recursive:true}); console.error((await page.locator("body").innerText()).slice(-6000)); await page.screenshot({path:".cache/calendar-failure.png"}).catch(()=>{}); throw error; }
  finally { await browser.close(); if(process.platform==="win32"&&server.pid)await new Promise<void>(resolve=>{const child=spawn("taskkill",["/PID",String(server.pid),"/T","/F"],{stdio:"ignore",windowsHide:true});child.on("exit",()=>resolve());});else server.kill(); }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
