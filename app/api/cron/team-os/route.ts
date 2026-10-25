import { Prisma } from '@prisma/client';
import { cronHandler } from '@/lib/cron/runtime';
import { prisma } from '@/lib/prisma';
import { teamMutation, teamWrite } from '@/lib/team/service';
import { weekStartIndia } from '@/lib/team/policy';
import { processClientWelcomes } from '@/lib/team/client-welcome';
import { remindCalendarTasks } from '@/lib/team/calendar';
import { syncCoordinator, remindAvailability, ensureCoordinatorRules } from '@/lib/team/coordinator';
import { syncCustomerFollowups } from '@/lib/team/customer-followups';
import { syncDailyCrmWork } from '@/lib/team/daily-work';
import { repairWorkSchedule, syncSourceWork } from '@/lib/team/autonomous-work';
import { notifyTeamBatch, type TeamReminder } from '@/lib/team/notification-batch';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const GET = cronHandler('team-os', runJob);

async function runJob() {
  const owners = await prisma.teamMember.findMany({ where: { status: 'ACTIVE', role: { owner: true }, user: { status: 'ACTIVE' } }, include: { role: true } });
  const handled = new Set<string>(), errors: Array<{ phase: string; workspaceId?: string; code: string }> = [];
  async function phase(name: string, workspaceId: string | undefined, execute: () => Promise<unknown>) {
    const started = Date.now();
    try { await execute(); } catch (error) {
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'TEAM_AUTOMATION_ERROR';
      errors.push({ phase: name, workspaceId, code });
      await prisma.auditLog.create({ data: { actorType: 'system', entity: 'cron_job', entityId: 'team-os', action: 'TEAM_OS_PHASE_FAILED', metadata: { phase: name, workspaceId: workspaceId || null, code, durationMs: Date.now() - started } } });
    }
  }
  for (const owner of owners) {
    if (handled.has(owner.workspaceId)) continue;
    handled.add(owner.workspaceId);
    const run = (name: string, execute: Parameters<typeof teamWrite>[1]) => phase(name, owner.workspaceId, () => teamWrite(owner, execute));
    await run('rules', (tx, a) => ensureCoordinatorRules(tx, a));
    await phase('workflows', owner.workspaceId, () => teamMutation(owner, 'workflow-sync', {}));
    await phase('schedule-repair',owner.workspaceId,()=>repairWorkSchedule(owner,new Date(),3));
    await phase('source-work',owner.workspaceId,async()=>{
      for(let i=0;i<4;i++){
        const result=await teamWrite(owner,(tx,a)=>syncSourceWork(tx,a));
        if(!result.created&&!result.reconciled)break;
      }
    });
    await run('daily-work', (tx, a) => syncDailyCrmWork(tx, a));
    await run('calendar-events', async (tx, a) => {
      const now = new Date();
      const events = await tx.teamCalendarEvent.findMany({ where: { workspaceId: a.workspaceId, kind: { not: 'CALL' }, status: 'SCHEDULED', remindedAt: null, OR: [{ endsAt: { gt: now } }, { endsAt: null }], startsAt: { gte: new Date(now.getTime() - 15 * 60000), lte: new Date(now.getTime() + 7 * 86400000) } }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take: 1000 });
      const due = events.filter(event => event.startsAt.getTime() - now.getTime() <= event.reminderMinutes * 60000);
      await notifyTeamBatch(tx, a, due.map(event => ({ eventKey: `calendar-event-reminder:${event.id}:${event.scheduleRevision}`, memberId: event.assigneeId, title: `Upcoming ${event.kind.toLowerCase()}: ${event.title}`, href: '/team?module=calendar' })));
      if (due.length) await tx.teamCalendarEvent.updateMany({ where: { workspaceId: a.workspaceId, id: { in: due.map(event => event.id) }, remindedAt: null }, data: { remindedAt: now } });
    });
    await run('task-reminders', (tx, a) => remindCalendarTasks(tx, a, new Date()));
    await run('digests', async (tx, a) => {
      const now = new Date(), local = new Date(now.getTime() + 330 * 60000), day = local.getUTCDay(), week = weekStartIndia(now).toISOString().slice(0, 10);
      const members = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' } }, select: { id: true, preferences: true } });
      const counts = await tx.teamTask.groupBy({ by: ['ownerId'], where: { workspaceId: a.workspaceId, ownerId: { in: members.map(member => member.id) }, archivedAt: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, _count: true });
      const reminders: TeamReminder[] = [];
      for (const member of members) {
        const preferences = member.preferences as { digest?: string; fridayReminder?: boolean } | null;
        const key = preferences?.digest === 'DAILY' ? `${member.id}:digest:${local.toISOString().slice(0, 10)}` : preferences?.digest === 'WEEKLY' && day === 5 ? `${member.id}:digest:${week}` : '';
        if (key) reminders.push({ eventKey: key, memberId: member.id, title: `Your activity digest: ${counts.find(item => item.ownerId === member.id)?._count || 0} active assignments` });
        if (day === 5 && preferences?.fridayReminder) reminders.push({ eventKey: `${member.id}:friday:${week}`, memberId: member.id, title: 'Review and submit your weekly report', href: '/team?module=reports' });
      }
      await notifyTeamBatch(tx, a, reminders);
    });
    await run('customer-followups', (tx, a) => syncCustomerFollowups(tx, a));
    await run('coordinator', (tx, a) => syncCoordinator(tx, a));
    await run('availability', (tx, a) => remindAvailability(tx, a));
  }
  let welcomeEmails: { sent: number; skipped?: string } = { sent: 0 };
  await phase('client-introductions', undefined, async () => {
    const result = await processClientWelcomes();
    if (result.disabled) {
      if (await prisma.teamClientWelcome.count({ where: { status: 'PENDING' } })) throw Error('Client introduction sender is not configured.');
      welcomeEmails = { sent: 0, skipped: 'no_pending_introductions' };
    } else welcomeEmails = { sent: result.sent };
  });
  return Response.json({ workspaces: handled.size, welcomeEmails, errors, success: errors.length === 0 }, { status: errors.length ? 503 : 200 });
}
