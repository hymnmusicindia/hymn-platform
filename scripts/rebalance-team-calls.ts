import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import path from 'node:path';
import { assertProductionDatabaseReady } from '../lib/production-database-safety';
import { rebalanceCalls } from '../lib/team/rebalance-calls';

async function main() {
  await assertProductionDatabaseReady(undefined, { enforceRestrictedRole: false });
  const preferredId = process.argv.find(arg => arg.startsWith('--preferred-member='))?.slice(19);
  const requestKey = process.argv.find(arg => arg.startsWith('--request-key='))?.slice(14);
  if (!preferredId || !requestKey || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestKey)) throw Error('Supply the verified preferred member and a stable request key.');
  const db = new PrismaClient();
  try {
    const preferred = await db.teamMember.findUniqueOrThrow({ where: { id: preferredId }, include: { user: { select: { name: true } } } });
    const actor = await db.teamMember.findFirstOrThrow({ where: { workspaceId: preferred.workspaceId, status: 'ACTIVE', role: { owner: true }, user: { status: 'ACTIVE' } }, include: { role: true }, orderBy: { id: 'asc' } });
    const apply = process.argv.includes('--apply');
    if (apply) {
      const snapshot = await db.$transaction(async tx => ({ members: await tx.teamMember.findMany({ where: { workspaceId: actor.workspaceId } }), tasks: await tx.teamTask.findMany({ where: { workspaceId: actor.workspaceId } }), events: await tx.teamCalendarEvent.findMany({ where: { workspaceId: actor.workspaceId } }), reminders: await tx.teamAppointmentMessage.findMany({ where: { event: { workspaceId: actor.workspaceId } } }) }), { isolationLevel: 'RepeatableRead', timeout: 30000 });
      mkdirSync('.cache', { recursive: true }); const file = path.resolve('.cache', `call-rebalance-${Date.now()}.json.gz`);
      writeFileSync(file, gzipSync(JSON.stringify(snapshot)), { mode: 0o600 });
      const checked = JSON.parse(gunzipSync(readFileSync(file)).toString());
      for (const key of ['members', 'tasks', 'events', 'reminders'] as const) if (checked[key].length !== snapshot[key].length) throw Error('Snapshot verification failed.');
      console.log('Verified backup:', file);
    }
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id=${actor.workspaceId} FOR UPDATE`;
      return rebalanceCalls(tx, actor, preferredId, requestKey, new Date(), apply);
    }, { maxWait: 10000, timeout: 60000 });
    console.log(JSON.stringify({ applied: apply, alreadyApplied: result.alreadyApplied, preferred: preferred.user.name, counts: result.counts, tasks: result.plans.length, first: result.plans[0]?.startsAt, last: result.plans.at(-1)?.startsAt }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]') : 'Rebalance failed.'); process.exitCode = 1; });
