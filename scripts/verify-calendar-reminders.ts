import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { teamMutation } from "../lib/team/service";
import { GET } from "../app/api/cron/team-os/route";
async function main() {
  assert.ok(process.env.DATABASE_URL?.includes("127.0.0.1:55461/team_fixture"));
  const stamp = Date.now(); const workspace = await prisma.teamWorkspace.create({ data: { name: `Reminder fixture ${stamp}` } });
  const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: "Owner", owner: true } });
  const user = await prisma.user.create({ data: { name: "Reminder tester", email: `reminder-${stamp}@example.test`, googleId: `reminder-${stamp}` } });
  const member = await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: role.id } }); const actor = { ...member, role };
  const email = `contact-${stamp}@example.test`;
  await teamMutation(actor, "clients-save", { name: "Contact", ownerId: member.id, phone: "+91 90000 12345", email: email.toUpperCase() });
  await assert.rejects(teamMutation(actor, "clients-save", { name: "Duplicate email", ownerId: member.id, email }), /already exists/);
  await assert.rejects(teamMutation(actor, "clients-save", { name: "Duplicate phone", ownerId: member.id, phone: "+919000012345" }), /already exists/);
  const event = await teamMutation(actor, "calendar-save", { title: `Reminder check ${stamp}`, kind: "EVENT", clientId: null, assigneeId: member.id, startsAt: new Date(Date.now()+180000).toISOString(), endsAt: new Date(Date.now()+1800000).toISOString(), reminderMinutes: 30 }) as { id:string };
  process.env.CRON_SECRET = "fixture-calendar-reminder";
  for(let i=0;i<2;i++) assert.equal((await GET(new Request("https://fixture/api/cron/team-os",{headers:{authorization:"Bearer fixture-calendar-reminder"}}))).status,200);
  assert.equal(await prisma.teamNotification.count({where:{memberId:member.id,title:`Upcoming event: Reminder check ${stamp}`}}),1);
  assert.ok((await prisma.teamCalendarEvent.findUniqueOrThrow({where:{id:event.id}})).remindedAt);
  console.log("PASS: phone/email deduplication, scheduled in-app reminder and cron replay deduplication.");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
