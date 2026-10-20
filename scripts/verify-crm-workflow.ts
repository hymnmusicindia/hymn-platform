import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { teamMutation } from "../lib/team/service";
import { acquisitionRead } from "../lib/team/acquisition";

async function main() {
  assert.match(process.env.DATABASE_URL || "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55473\/acquisition_fixture$/);
  const key = Date.now().toString(36);
  const workspace = await prisma.teamWorkspace.create({ data: { name: `CRM ${key}` } });
  const ownerRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: "Owner", owner: true, permissions: [] } });
  const callerRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: "Caller", permissions: ["crm.prospects.view", "crm.outreach.manage", "tasks.update", "tasks.complete"] } });
  async function member(name: string, roleId: string) {
    const user = await prisma.user.create({ data: { googleId: `crm-${name}-${key}`, name, email: `crm-${name}-${key}@fixture.invalid` } });
    return prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId }, include: { role: true } });
  }
  const owner = await member("Owner", ownerRole.id); const first = await member("First", callerRole.id); const second = await member("Second", callerRole.id);
  for (const employee of [first, second]) await teamMutation(owner, "acquisition-target-save", { employeeId: employee.id, researchTarget: 20, callTarget: 10, caller: true });
  await assert.rejects(teamMutation(first, "acquisition-target-save", { employeeId: first.id, researchTarget: 1, callTarget: 1, caller: true }), /permission/);
  const input = (index: number) => ({ ownerId: owner.id, name: `CRM artist ${index}`, phone: `+9198765432${index.toString().padStart(2, "0")}`, sourceUrl: "https://example.org/contact", evidence: "Verified public professional contact", contactEligibility: "LEGITIMATE_INTEREST", verified: true, categories: ["Distribution"], score: { intent: 0, relevance: 0, recency: 0, contactability: 0, fit: 0 }, followUpAt: "2026-12-01T08:00:00.000Z" });
  const created = [];
  for (let i = 1; i <= 3; i++) { const row = await teamMutation(owner, "prospects", input(i)) as { id: string }; created.push(await prisma.teamProspect.findUniqueOrThrow({ where: { id: row.id }, include: { acquisitionLead: true } })); }
  assert.equal(created[0].acquisitionLead?.acquisitionEmployeeId, created[2].acquisitionLead?.acquisitionEmployeeId);
  assert.notEqual(created[0].acquisitionLead?.acquisitionEmployeeId, created[1].acquisitionLead?.acquisitionEmployeeId);
  assert.ok(created.every(row => row.acquisitionLead?.researcherEmployeeId === owner.id), "Research attribution survives automatic assignment.");
  await assert.rejects(teamMutation(owner, "prospects", input(1)), /already exists/);
  const prospect = created[0]; const caller = prospect.ownerId === first.id ? first : second;
  const before = await prisma.teamTask.findUniqueOrThrow({ where: { eventKey: `${prospect.id}:call` } });
  const nextTime = "2026-12-02T10:00:00.000Z";
  await teamMutation(caller, "prospect-update", { id: prospect.id, version: prospect.version, followUpAt: nextTime, notes: "Call rescheduled by customer" });
  const task = await prisma.teamTask.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(task.dueAt?.toISOString(), nextTime);
  assert.equal(await prisma.teamTask.count({ where: { eventKey: { startsWith: `${prospect.id}:` } } }), 1);
  await teamMutation(caller, "task-update", { id: task.id, version: task.version, dueAt: "2026-12-03T10:00:00.000Z" });
  const updated = await prisma.teamProspect.findUniqueOrThrow({ where: { id: prospect.id } });
  assert.equal(updated.followUpAt?.toISOString(), "2026-12-03T10:00:00.000Z");
  await assert.rejects(teamMutation(caller, "prospect-call-save", { id: updated.id, version: updated.version, stage: "CONVERTED", contact: { body: "Spoke to customer", evidence: "Fixture call log" } }), /existing HYMN customer/);
  assert.equal(await prisma.teamOutreach.count({ where: { prospectId: updated.id } }), 0, "Failed save rolls back the contact event.");
  await teamMutation(caller, "prospect-call-save", { id: updated.id, version: updated.version, stage: "CONTACTED", contact: { body: "Spoke to customer", evidence: "Fixture call log" } });
  const targets = await acquisitionRead(caller, "acquisition-targets", new URLSearchParams()) as { items: { id: string; called: number }[] };
  assert.deepEqual(targets.items.map(row => [row.id, row.called]), [[caller.id, 1]], "Caller target reads are private and backed by contact events.");
  await prisma.teamMember.update({ where: { id: caller.id }, data: { availability: "AWAY" } });
  const another = await teamMutation(owner, "prospects", input(4)) as { id: string };
  const anotherLead = await prisma.acquisitionLead.findUniqueOrThrow({ where: { prospectId: another.id } });
  assert.notEqual(anotherLead.acquisitionEmployeeId, caller.id, "Away callers are skipped.");
  const otherCaller = caller.id === first.id ? second : first;
  await prisma.teamMember.update({ where: { id: otherCaller.id }, data: { availability: "AWAY" } });
  const waiting = await teamMutation(owner, "prospects", input(5)) as { id: string };
  assert.equal((await prisma.acquisitionLead.findUniqueOrThrow({ where: { prospectId: waiting.id } })).acquisitionEmployeeId, null);
  await assert.rejects(teamMutation(owner, "acquisition-dispatch", {}), /available caller/);
  await teamMutation(otherCaller, "preferences", { availability: "AVAILABLE", notifications: true, digest: "NONE", fridayReminder: false });
  const dispatched = await teamMutation(owner, "acquisition-dispatch", {}) as { assigned: number };
  assert.equal(dispatched.assigned, 1, "Personal preference saves preserve manager caller settings.");
  assert.equal((await prisma.acquisitionLead.findUniqueOrThrow({ where: { prospectId: waiting.id } })).acquisitionEmployeeId, otherCaller.id);
  assert.equal((await prisma.teamTask.findUniqueOrThrow({ where: { eventKey: `${waiting.id}:call` } })).ownerId, otherCaller.id);
  const suppressed = await teamMutation(owner, "prospects", { ...input(6), contactEligibility: "DO_NOT_CONTACT" }) as { id: string };
  assert.equal((await prisma.acquisitionLead.findUniqueOrThrow({ where: { prospectId: suppressed.id } })).acquisitionEmployeeId, null);
  assert.equal(await prisma.teamTask.count({ where: { eventKey: `${suppressed.id}:call` } }), 0);
  await assert.rejects(teamMutation(owner, "prospect-update", { id: updated.id, version: updated.version + 1, stage: "CONVERTED" }), /existing HYMN customer/);
  assert.equal(await prisma.acquisitionCommission.count({ where: { lead: { workspaceId: workspace.id } } }), 0, "CRM activity alone cannot create employee earnings.");
  console.log("CRM rotation, permission boundaries, phone deduplication, daily targets, scheduling and reward separation passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
