import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { GET } from '../app/api/cron/team-os/route';
import { notifyTeamBatch } from '../lib/team/notification-batch';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  process.env.CRON_SECRET = 'team-cron-recovery-fixture'; process.env.EMAIL_ENABLED = 'false';
  const workspace = await prisma.teamWorkspace.create({ data: { name: 'Cron recovery', clientCardsImportedAt: new Date() } });
  const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, owner: true, name: 'Owner' } });
  const user = await prisma.user.create({ data: { name: 'Cron owner', email: 'cron-recovery@fixture.invalid', googleId: 'cron-recovery' } });
  const owner = await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: role.id, preferences: { digest: 'DAILY' } }, include: { role: true } });
  const quietUser = await prisma.user.create({ data: { name: 'Quiet employee', email: 'quiet-cron@fixture.invalid', googleId: 'quiet-cron' } });
  const quiet = await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: quietUser.id, roleId: role.id, preferences: { notifications: false } } });
  await prisma.teamTask.createMany({ data: Array.from({ length: 130 }, (_, i) => ({ workspaceId: workspace.id, ownerId: owner.id, creatorId: owner.id, title: `Overdue ${i}`, dueAt: new Date(Date.now() - 86400000) })) });
  const now = new Date();
  const calendar = await prisma.teamCalendarEvent.create({ data: { workspaceId: workspace.id, creatorId: owner.id, assigneeId: owner.id, title: 'Recovery calendar', kind: 'EVENT', startsAt: new Date(now.getTime() + 60000), reminderMinutes: 30 } });
  const tick = () => GET(new Request('https://fixture.invalid/api/cron/team-os', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  for (const expected of [100, 130, 130]) {
    const result = await tick(); assert.equal(result.status, 200, await result.text());
    assert.equal(await prisma.teamNotification.count({ where: { title: { startsWith: 'Deadline attention:' } } }), expected, 'Batches advance without replaying previous reminders.');
  }
  assert.equal(await prisma.teamNotification.count({ where: { title: 'Upcoming event: Recovery calendar' } }), 1);
  assert.ok((await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: calendar.id } })).remindedAt);
  assert.equal(await prisma.teamNotification.count({ where: { title: { startsWith: 'Your activity digest:' } } }), 1);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id=${workspace.id} FOR UPDATE`;
    await notifyTeamBatch(tx, owner, [{ eventKey: 'quiet-reminder', memberId: quiet.id, title: 'Must be suppressed' }]);
  });
  assert.equal(await prisma.teamNotification.count({ where: { memberId: quiet.id } }), 0);
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id=${workspace.id} FOR UPDATE`;
    await notifyTeamBatch(tx, owner, [{ eventKey: 'rollback-reminder', memberId: owner.id, title: 'Must roll back' }]);
    throw Error('Simulate transaction rollback');
  }));
  assert.equal(await prisma.teamWorkflowEvent.count({ where: { eventKey: 'rollback-reminder' } }), 0);
  assert.equal(await prisma.teamNotification.count({ where: { title: 'Must roll back' } }), 0);
  await prisma.teamCalendarEvent.create({ data: { workspaceId: workspace.id, creatorId: owner.id, assigneeId: owner.id, title: 'Reminder despite workflow failure', kind: 'EVENT', startsAt: new Date(Date.now() + 60000), reminderMinutes: 30 } });
  // Disposable fixture only: emulate a real phase failure without mocking Prisma.
  await prisma.$executeRawUnsafe('ALTER TABLE team_workflow_rules RENAME TO fixture_unavailable_workflow_rules');
  try {
    const result = await tick(); assert.equal(result.status, 503);
    const data = await result.json(); assert.ok(data.errors.some((error: { phase: string }) => error.phase === 'workflows'));
    assert.equal(await prisma.teamNotification.count({ where: { title: 'Upcoming event: Reminder despite workflow failure' } }), 1, 'Independent reminders continue after a workflow failure.');
    assert.ok(await prisma.auditLog.count({ where: { action: 'TEAM_OS_PHASE_FAILED', entityId: 'team-os' } }) > 0);
  } finally { await prisma.$executeRawUnsafe('ALTER TABLE fixture_unavailable_workflow_rules RENAME TO team_workflow_rules'); }
  assert.equal((await tick()).status, 200);
  console.log('Team cron recovery: 130-task batching, advancing batches, replay safety, notification preferences, atomic rollback, phase isolation, durable diagnostics and empty disabled welcome queue passed.');
}
main().finally(() => prisma.$disconnect());
