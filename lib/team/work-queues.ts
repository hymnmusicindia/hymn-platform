import { Prisma } from '@prisma/client';
import { callTaskWhere } from './daily-call-policy';
import type { WorkQueueType } from './work-station-policy';

export function workQueueType(value: string | null): WorkQueueType {
  return value === 'calls' || value === 'tasks' ? value : 'all';
}

/** Positive null branches keep internal tasks with missing JSON metadata visible. */
export function workQueueWhere(type: WorkQueueType): Prisma.TeamTaskWhereInput {
  if (type === 'calls') return callTaskWhere;
  if (type === 'all') return {};
  return { AND: [
    { OR: [{ eventKey: null }, { NOT: { OR: [{ eventKey: { startsWith: 'support-call:' } }, { eventKey: { endsWith: ':call' } }] } }] },
    { OR: [
      { followUpContext: { equals: Prisma.DbNull } },
      { followUpContext: { path: ['kind'], equals: Prisma.AnyNull } },
      { AND: ['CALL', 'SUPPORT_CALLBACK', 'FRIENDLY_INTRO'].map(kind => ({ followUpContext: { path: ['kind'], not: kind } })) }
    ] }
  ] };
}
