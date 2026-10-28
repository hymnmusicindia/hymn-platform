import { activeWindows, withinWorkHours } from './availability-rules';
import { reservationsOverlap } from './calendar-reservations';
import { callLoadScore } from './call-allocation';

type Member = { id: string; preferences: unknown };
type Reservation = { id: string; assigneeId: string; startsAt: Date; endsAt: Date | null; kind: string };
type Callback = { id: string; ownerId: string; dueAt: Date | null; eventId: string };
export function planCallRebalance(members: Member[], callbacks: Callback[], fixed: Reservation[], initialLoad: Map<string, number>, now: Date) {
  const loads = new Map(initialLoad), reservations = [...fixed];
  const earliest = new Date(now.getTime() + 30 * 60000), horizon = new Date(now.getTime() + 14 * 86400000);
  const plans: { taskId: string; eventId: string; ownerId: string; startsAt: Date; endsAt: Date }[] = [];
  for (const task of callbacks) {
    const day = task.dueAt && task.dueAt > earliest ? new Date(new Date(task.dueAt.getTime() + 330 * 60000).toISOString().slice(0, 10) + 'T00:00:00+05:30') : earliest;
    let planned = false;
    for (const member of [...members].sort((a, b) => callLoadScore(a.preferences, loads.get(a.id) || 0) - callLoadScore(b.preferences, loads.get(b.id) || 0) || a.id.localeCompare(b.id))) {
      const free = (startsAt: Date) => startsAt >= earliest && startsAt < horizon && withinWorkHours(member.preferences, startsAt, new Date(startsAt.getTime() + 1800000)) && !reservations.some(event => event.assigneeId === member.id && reservationsOverlap({ kind: 'FOLLOW_UP', startsAt, endsAt: new Date(startsAt.getTime() + 1800000) }, event));
      let slot = task.dueAt && task.dueAt >= day && free(task.dueAt) ? task.dueAt : null;
      if (!slot) for (const window of activeWindows(member.preferences, new Date(Math.max(day.getTime(), earliest.getTime())), horizon)) {
        for (let time = Math.ceil(Math.max(day.getTime(), earliest.getTime(), window.startsAt.getTime()) / 900000) * 900000; time + 1800000 <= Math.min(window.endsAt.getTime(), horizon.getTime()); time += 900000) {
          if (free(new Date(time))) { slot = new Date(time); break; }
        }
        if (slot) break;
      }
      if (!slot) continue;
      const plan = { taskId: task.id, eventId: task.eventId, ownerId: member.id, startsAt: slot, endsAt: new Date(slot.getTime() + 1800000) };
      plans.push(plan); reservations.push({ id: task.eventId, assigneeId: member.id, kind: 'FOLLOW_UP', startsAt: plan.startsAt, endsAt: plan.endsAt });
      loads.set(member.id, (loads.get(member.id) || 0) + 1); planned = true; break;
    }
    if (!planned) throw Error('Not enough declared call capacity within 14 days; no partial rebalance is allowed.');
  }
  return plans;
}
