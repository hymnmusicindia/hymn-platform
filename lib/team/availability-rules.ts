/** Weekly availability is declared in Asia/Kolkata, using Monday-based weeks. */
export type WorkSlot = { day: number; start: number; end: number };
export type WeekPlan = { revision: number; submittedAt: string; slots: WorkSlot[] };
export type RecurringHours = { enabled: boolean; slots: WorkSlot[]; assignOnlyWhileActive: boolean; restrictOverrides: boolean };
export type WorkAvailability = { weeklyMinutes: number; leave: Record<string, number>; plans: Record<string, WeekPlan>; recurring: RecurringHours };
export const DEFAULT_WORK_SLOTS: WorkSlot[] = [0,1,2,3,4,5].map(day=>({day,start:570,end:1080}));
export const MINIMUM_AVAILABILITY = 0.7;
export function record(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
export function workAvailability(preferences: unknown): WorkAvailability {
  const value = record(record(preferences).workAvailability);
  const recurring=record(value.recurring);
  const slots=Array.isArray(recurring.slots)?recurring.slots.filter((slot:WorkSlot)=>Number.isInteger(slot.day)&&slot.day>=0&&slot.day<=6&&Number.isInteger(slot.start)&&Number.isInteger(slot.end)&&slot.start>=0&&slot.end<=1440&&slot.end>slot.start):DEFAULT_WORK_SLOTS;
  return { weeklyMinutes: Number.isInteger(value.weeklyMinutes) && value.weeklyMinutes >= 0 && value.weeklyMinutes <= 5040 ? value.weeklyMinutes : 2400, leave: record(value.leave), plans: record(value.plans), recurring:{enabled:recurring.enabled!==false,slots,assignOnlyWhileActive:recurring.assignOnlyWhileActive===true,restrictOverrides:recurring.restrictOverrides===true} };
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
  const config=workAvailability(preferences), plan=config.plans[week];
  return Boolean((plan?.submittedAt || !plan && config.recurring.enabled) && planMinutes(effectiveSlots(preferences,week)) >= Math.ceil(requiredMinutes(preferences, week) * MINIMUM_AVAILABILITY));
}
/** Weekly overrides never escape a manager's restricted recurring shift. */
export function effectiveSlots(preferences:unknown,week:string):WorkSlot[] {
  const config=workAvailability(preferences), plan=config.plans[week];
  const slots=plan?(Array.isArray(plan.slots)?plan.slots:[]):config.recurring.enabled?config.recurring.slots:[];
  if(!config.recurring.restrictOverrides)return slots;
  return slots.flatMap(slot=>config.recurring.slots.filter(limit=>limit.day===slot.day).map(limit=>({day:slot.day,start:Math.max(slot.start,limit.start),end:Math.min(slot.end,limit.end)})).filter(slot=>slot.end>slot.start));
}
export function acceptsAssignmentsNow(preferences:unknown,now=new Date()) {
  return !workAvailability(preferences).recurring.assignOnlyWhileActive || withinWorkHours(preferences,now,new Date(now.getTime()+1));
}
export function activeWindows(preferences: unknown, after: Date, until: Date) {
  const windows: { startsAt: Date; endsAt: Date }[] = [];
  for (let week=workWeek(after);week<=workWeek(until);week=moveWorkWeek(week,1)) {
    if (!validWorkWeek(week) || requiredMinutes(preferences,week)<=0 || !planMeetsTarget(preferences, week)) continue;
    for (const slot of effectiveSlots(preferences,week)) {
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
