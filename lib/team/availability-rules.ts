/** Weekly availability is declared in Asia/Kolkata, using Monday-based weeks. */
export type WorkSlot = { day: number; start: number; end: number };
export type WeekPlan = { revision: number; submittedAt: string; slots: WorkSlot[] };
export type WorkAvailability = { weeklyMinutes: number; leave: Record<string, number>; plans: Record<string, WeekPlan> };
export const MINIMUM_AVAILABILITY = 0.7;
export function record(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
export function workAvailability(preferences: unknown): WorkAvailability {
  const value = record(record(preferences).workAvailability);
  return { weeklyMinutes: Number.isInteger(value.weeklyMinutes) && value.weeklyMinutes >= 0 && value.weeklyMinutes <= 5040 ? value.weeklyMinutes : 2400, leave: record(value.leave), plans: record(value.plans) };
}
export function workWeek(now = new Date()) {
  const local = new Date(now.getTime() + 330 * 60000);
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  return local.toISOString().slice(0, 10);
}
export function moveWorkWeek(week: string, amount: number) { return new Date(Date.parse(`${week}T00:00:00Z`) + amount * 7 * 86400000).toISOString().slice(0, 10); }
export function validWorkWeek(week: string) { return /^\d{4}-\d{2}-\d{2}$/.test(week) && Number.isFinite(Date.parse(week)) && new Date(`${week}T00:00:00Z`).getUTCDay() === 1 && new Date(week).toISOString().slice(0,10) === week; }
export function planMinutes(slots: WorkSlot[]) { return slots.reduce((sum, slot) => sum + slot.end - slot.start, 0); }
export function requiredMinutes(preferences: unknown, week: string) {
  const config = workAvailability(preferences);
  return Math.max(0, config.weeklyMinutes - Math.min(config.weeklyMinutes, Math.max(0, Number(config.leave[week]) || 0)));
}
export function planMeetsTarget(preferences: unknown, week: string) {
  const plan = workAvailability(preferences).plans[week];
  return Boolean(plan?.submittedAt && Array.isArray(plan.slots) && planMinutes(plan.slots) >= Math.ceil(requiredMinutes(preferences, week) * MINIMUM_AVAILABILITY));
}
export function activeWindows(preferences: unknown, after: Date, until: Date) {
  const config = workAvailability(preferences), windows: { startsAt: Date; endsAt: Date }[] = [];
  for (const [week, plan] of Object.entries(config.plans)) {
    if (!validWorkWeek(week) || requiredMinutes(preferences,week)<=0 || !planMeetsTarget(preferences, week)) continue;
    for (const slot of plan.slots) {
      const startsAt = new Date(Date.parse(`${week}T00:00:00+05:30`) + (slot.day * 1440 + slot.start) * 60000);
      const endsAt = new Date(Date.parse(`${week}T00:00:00+05:30`) + (slot.day * 1440 + slot.end) * 60000);
      if (endsAt > after && startsAt < until) windows.push({ startsAt, endsAt });
    }
  }
  const merged:typeof windows=[];
  for(const window of windows.sort((a,b)=>a.startsAt.getTime()-b.startsAt.getTime())) {
    const previous=merged[merged.length-1];
    if(previous&&previous.endsAt>=window.startsAt){if(window.endsAt>previous.endsAt)previous.endsAt=window.endsAt;}
    else merged.push(window);
  }
  return merged;
}
export function withinWorkHours(preferences: unknown, startsAt: Date, endsAt: Date) {
  return activeWindows(preferences, startsAt, endsAt).some(slot => slot.startsAt <= startsAt && slot.endsAt >= endsAt);
}
