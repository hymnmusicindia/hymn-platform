import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { rebalanceCalls } from '../lib/team/rebalance-calls';
import { withinWorkHours } from '../lib/team/availability-rules';
import { reservationsOverlap } from '../lib/team/calendar-reservations';
import { buildNightlyPlan, queueNightlyPlans, deliverNightlyPlans } from '../lib/team/nightly-plan';
import { nextDayPlanWindow } from '../lib/team/nightly-plan-model';
import { nextCaller } from '../lib/team/crm-workflow';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const workspace = await prisma.teamWorkspace.create({ data: { name: 'Call planning fixture' } });
  const ownerUser = await prisma.user.create({ data: { name: 'Owner', email: 'owner@callplan.invalid', googleId: 'callplan-owner' } });
  const ownerRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Owner', owner: true } });
  const actor = await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: ownerUser.id, roleId: ownerRole.id }, include: { role: true } });
  const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Calling', permissions: ['crm.prospects.view', 'crm.outreach.manage', 'calendar.manage', 'tasks.update'] } });
  const reps = [];
  for (const name of ['Kira fixture', 'Tavish fixture', 'Manha fixture']) {
    const user = await prisma.user.create({ data: { name, email: `${name.split(' ')[0].toLowerCase()}@callplan.invalid`, googleId: name } });
    const dedicated = name.startsWith('Kira');
    reps.push(await prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: role.id, preferences: { crm: { caller: true, workRole: dedicated ? 'caller' : 'researcher', researchTarget: dedicated ? 0 : 15 }, ...(dedicated ? { workAvailability: { weeklyMinutes: 1440, recurring: { enabled: true, slots: [0,1,2,3,4,5].map(day => ({ day, start: 1020, end: 1260 })) } } } : {}) } } }));
  }
  const now = new Date('2026-10-28T18:30:00Z');
  const client = await prisma.teamClient.create({ data: { workspaceId: workspace.id, ownerId: actor.id, name: 'Real fixture customer', phone: '+919876543210' } });
  for (let index = 0; index < 70; index++) {
    const dueAt = new Date(Date.parse('2026-10-29T11:30:00Z') + index * 1800000);
    const task = await prisma.teamTask.create({ data: { workspaceId: workspace.id, creatorId: actor.id, ownerId: reps[0].id, clientId: client.id, title: `Callback ${index}`, dueAt, eventKey: `support-call:${workspace.id}:${index}` } });
    await prisma.teamCalendarEvent.create({ data: { workspaceId: workspace.id, creatorId: actor.id, assigneeId: reps[0].id, clientId: client.id, followUpTaskId: task.id, title: task.title, kind: 'FOLLOW_UP', startsAt: dueAt, endsAt: new Date(dueAt.getTime() + 1800000) } });
  }
  const fixed = await prisma.teamCalendarEvent.create({ data: { workspaceId: workspace.id, creatorId: actor.id, assigneeId: reps[1].id, clientId: client.id, title: 'Confirmed customer appointment', kind: 'CALL', startsAt: new Date('2026-10-29T04:00:00Z') } });
  const run = (apply: boolean) => prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id=${workspace.id} FOR UPDATE`; return rebalanceCalls(tx, actor, reps[0].id, 'fixture-request', now, apply); }, { timeout: 60000 });
  const preview = await run(false); assert.equal(preview.plans.length, 70);
  assert.equal(await prisma.teamTask.count({ where: { ownerId: reps[0].id } }), 70, 'Preview never changes ownership.');
  const result = await run(true); assert.equal(result.plans.length, 70);
  const counts = result.counts.map(row => row.callbacks); assert(counts[0] > counts[1] && counts[0] > counts[2]); assert(Math.max(...counts) - Math.min(...counts) <= 8); assert(Math.min(...counts) >= 20);
  assert.equal((await run(true)).alreadyApplied, true);
  assert.deepEqual(await prisma.teamCalendarEvent.findUniqueOrThrow({ where: { id: fixed.id } }), fixed, 'Confirmed customer appointments are unchanged.');
  const updated = await prisma.teamMember.findMany({ where: { id: { in: reps.map(rep => rep.id) } } });
  const events = await prisma.teamCalendarEvent.findMany({ where: { workspaceId: workspace.id, status: 'SCHEDULED' } });
  for (const event of events) {
    if (event.kind === 'FOLLOW_UP') assert(withinWorkHours(updated.find(rep => rep.id === event.assigneeId)!.preferences, event.startsAt, event.endsAt!));
    for (const other of events) if (event.id !== other.id && event.assigneeId === other.assigneeId) assert(!reservationsOverlap(event, other), 'No call overlaps another reservation.');
    if (event.followUpTaskId) assert.equal((await prisma.teamTask.findUniqueOrThrow({ where: { id: event.followUpTaskId } })).ownerId, event.assigneeId);
  }
  const futureCaller = await prisma.$transaction(tx => nextCaller(tx, actor, new Date('2026-10-29T12:00:00Z')));
  assert(futureCaller && reps.some(rep => rep.id === futureCaller.id));
  assert.equal(nextDayPlanWindow(new Date('2026-10-29T15:29:59Z')), null);
  const night = new Date('2026-10-29T15:30:00Z'), window = nextDayPlanWindow(night)!;
  assert.equal(window.day, '2026-10-30');
  await prisma.teamTask.createMany({ data: [
    { workspaceId: workspace.id, creatorId: actor.id, ownerId: reps[0].id, title: 'Unique overdue work', dueAt: new Date('2026-10-28T05:00:00Z') },
    { workspaceId: workspace.id, creatorId: actor.id, ownerId: reps[0].id, title: 'Unique undated work' },
    { workspaceId: workspace.id, creatorId: actor.id, ownerId: reps[0].id, title: 'Other due tomorrow', dueAt: new Date('2026-10-30T05:00:00Z') },
    { workspaceId: workspace.id, creatorId: actor.id, ownerId: reps[0].id, title: 'Secret other day', dueAt: new Date('2026-11-02T05:00:00Z') },
  ] });
  const message = await buildNightlyPlan(reps[0].userId, window); assert(message); assert(message.text.includes('Unique overdue work')); assert(message.text.includes('Unique undated work')); assert(message.text.includes('Other due tomorrow')); assert(!message.text.includes('Secret other day')); assert(message.text.includes('IST'));
  assert(!message.html.includes('Chat with HYMN on WhatsApp')); assert(!message.text.includes('Contact HYMN on WhatsApp')); assert(message.html.includes('(internal callback plan)<br>'), 'Schedules render as separate readable lines.');
  const secondWorkspace = await prisma.teamWorkspace.create({ data: { name: 'Other active workspace' } });
  const secondRole = await prisma.teamRole.create({ data: { workspaceId: secondWorkspace.id, name: 'Member' } });
  await prisma.teamMember.create({ data: { workspaceId: secondWorkspace.id, userId: reps[0].userId, roleId: secondRole.id } });
  const jobs = await Promise.all([queueNightlyPlans(night), queueNightlyPlans(night)]); assert.equal(jobs.reduce((sum, job) => sum + job.queued, 0), 4, 'One email per user across workspaces and concurrent cron runs.');
  const deliveries: string[] = [];
  const deliver = async (input: { to: string; text: string }) => { deliveries.push(input.to); return { data: { id: `accepted-${deliveries.length}` }, error: null }; };
  await Promise.all([deliverNightlyPlans(night, deliver), deliverNightlyPlans(night, deliver)]);
  assert.equal(deliveries.length, 4); assert.equal(new Set(deliveries).size, 4); await deliverNightlyPlans(night, deliver); assert.equal(deliveries.length, 4);
  // Only provably pre-connection failures retry. Uncertain SMTP outcomes require review.
  const kiraJob = await prisma.emailLog.findUniqueOrThrow({ where: { eventKey: `team-next-day:${reps[0].userId}:${window.day}` } });
  await prisma.emailLog.update({ where: { id: kiraJob.id }, data: { status: 'pending' } });
  await deliverNightlyPlans(night, async () => { throw Error('Connection lost after DATA'); });
  assert.equal((await prisma.emailLog.findUniqueOrThrow({ where: { id: kiraJob.id } })).status, 'review');
  const other = await prisma.emailLog.findFirstOrThrow({ where: { userId: reps[1].userId, template: 'team_next_day_plan' } });
  await prisma.emailLog.update({ where: { id: other.id }, data: { status: 'pending' } });
  await deliverNightlyPlans(new Date('2026-10-29T18:30:00Z'), deliver); assert.equal((await prisma.emailLog.findUniqueOrThrow({ where: { id: other.id } })).status, 'cancelled');
  console.log('PASS weighted call redistribution:', counts.join('/'), '- schedules, task/calendar ownership, fixed appointments, replay safety, future routing.');
  console.log('PASS nightly plan: 21:00 IST, complete personal agenda, cross-workspace consolidation, concurrent deduplication, SMTP uncertainty review and stale-plan suppression.');
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
