import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { prisma } from "../lib/prisma";
async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55461/team_fixture")) throw Error("Isolated fixture required");
  const emails = ["bootstrap-one@example.test", "bootstrap-two@example.test"];
  for (const email of emails) await prisma.user.create({ data: { email, googleId: email, name: email } });
  const run = () => spawnSync(process.execPath, ["--import", "tsx", "scripts/grant-team-owners.ts", "--emails", emails.join(","), "--apply"], { env: process.env, encoding: "utf8", windowsHide: true });
  const first = run(); assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(await prisma.teamWorkspace.count(), 1);
  assert.equal(await prisma.teamMember.count({ where: { role: { owner: true } } }), 2);
  assert.equal(await prisma.teamAudit.count({ where: { action: "owner.explicit_operator_grant" } }), 2);
  assert.equal(run().status, 0);
  assert.equal(await prisma.teamAudit.count({ where: { action: "owner.explicit_operator_grant" } }), 2);
  assert.equal(await prisma.user.count({ where: { email: { in: emails }, role: "ADMIN" } }), 0);
  console.log("PASS: atomic explicit co-owner bootstrap, protected role sharing, idempotent grants and unchanged application roles.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
