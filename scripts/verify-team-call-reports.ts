import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { teamMutation, teamRead } from '../lib/team/service';
async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const workspace = await prisma.teamWorkspace.create({ data: { name: 'Report fixture' } });
  async function member(name: string, permissions: string[]) {
    const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name, permissions } });
    const user = await prisma.user.create({ data: { name, email: `${name}@call-report.fixture.invalid`, googleId: randomUUID() } });
    return prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: role.id }, include: { role: true } });
  }
  const rep = await member('Caller', ['crm.outreach.manage', 'tasks.update']);
  const viewer = await member('Viewer', ['clients.view']);
  const contact = await prisma.teamClient.create({ data: { workspaceId: workspace.id, ownerId: rep.id, name: 'Customer', notes: 'PRIVATE NOTE' } });
  const payload = { clientId: contact.id, requestKey: randomUUID(), occurredAt: '2026-10-01T14:15:00+05:30', source: 'PERSONAL_PHONE', outcome: 'TALKED', discussion: 'Discussed distribution plans and answered questions.', needs: 'Release support', commitments: 'Send a checklist', nextAction: 'Caller follows up after customer review' };
  const result = await teamMutation(rep, 'call-report-save', payload);
  assert.equal((await teamMutation(rep, 'call-report-save', payload)).id, result.id);
  await assert.rejects(teamMutation(rep, 'call-report-save', { ...payload, discussion: 'Different conversation report' }), /save request changed/);
  await assert.rejects(teamMutation(viewer, 'call-report-save', { ...payload, requestKey: randomUUID() }), /permission/);
  await assert.rejects(teamMutation(rep, 'call-report-save', { ...payload, requestKey: randomUUID(), occurredAt: '2099-01-01T12:00:00Z' }), /past call/);
  await assert.rejects(teamMutation(rep, 'call-report-save', { ...payload, requestKey: randomUUID(), outcome: 'CALLBACK' }), /callback time/);
  const first = await teamRead(viewer, 'call-reports', new URLSearchParams({ clientId: contact.id }));
  assert.equal(first.total, 1); assert.equal(first.canWrite, false);
  assert.equal(first.items[0].occurredAt, payload.occurredAt);
  assert.ok(!JSON.stringify(first).includes('PRIVATE NOTE'));
  await teamMutation(rep, 'call-report-save', { ...payload, requestKey: randomUUID(), amendsReportId: result.id, discussion: 'Customer clarified their preferred release date.' });
  const updated = await teamRead(viewer, 'call-reports', new URLSearchParams({ clientId: contact.id }));
  assert.equal(updated.total, 2); assert.ok(updated.items.some(row => row.discussion === payload.discussion));
  const retained = await prisma.teamClient.create({ data: { workspaceId: workspace.id, ownerId: rep.id, name: 'Retained customer' } });
  await prisma.teamClient.update({ where: { id: contact.id }, data: { mergedIntoId: retained.id } });
  assert.equal((await teamRead(viewer, 'call-reports', new URLSearchParams({ clientId: retained.id }))).total, 2);
  await assert.rejects(teamRead(viewer, 'call-reports', new URLSearchParams({ clientId: contact.id })), /retained contact/);
  const foreignWorkspace = await prisma.teamWorkspace.create({ data: { name: 'Other workspace' } });
  await assert.rejects(teamRead({ ...viewer, workspaceId: foreignWorkspace.id }, 'call-reports', new URLSearchParams({ clientId: retained.id })), /not found/);
  const callback = await prisma.teamTask.create({ data: { workspaceId: workspace.id, ownerId: rep.id, creatorId: rep.id, clientId: retained.id, title: 'Call customer', eventKey: `support-call:report:${randomUUID()}`, followUpContext: { kind: 'FRIENDLY_INTRO' } } });
  const callbackPayload = { ...payload, clientId: retained.id, requestKey: randomUUID(), taskId: callback.id, taskVersion: callback.version };
  await assert.rejects(teamMutation(rep, 'call-report-save', { ...callbackPayload, taskVersion: 99 }), /changed/);
  const completed = await teamMutation(rep, 'call-report-save', callbackPayload);
  assert.equal((await prisma.teamTask.findUniqueOrThrow({ where: { id: callback.id } })).status, 'COMPLETED');
  assert.equal((await teamMutation(rep, 'call-report-save', callbackPayload)).id, completed.id);
  const outsider = await member('OtherCaller', ['crm.outreach.manage', 'tasks.update']);
  const otherTask = await prisma.teamTask.create({ data: { workspaceId: workspace.id, ownerId: outsider.id, creatorId: rep.id, clientId: retained.id, title: 'Other call', eventKey: `support-call:report:${randomUUID()}` } });
  await assert.rejects(teamMutation(rep, 'call-report-save', { ...callbackPayload, requestKey: randomUUID(), taskId: otherTask.id }), /unavailable/);
  assert.equal(await prisma.teamAudit.count({ where: { workspaceId: workspace.id, action: 'contact.call_report' } }), 3);
  assert.equal(await prisma.teamOutreachEmail.count({ where: { workspaceId: workspace.id } }), 0);
  console.log('PASS actual call time, shared read-only history, append-only updates, retry deduplication, merge retention, workspace isolation, callback ownership/version and atomic completion.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
