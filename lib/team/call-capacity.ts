import { activeWindows } from "./availability-rules";
import { indiaWorkday } from "./daily-work";
import { callDayLimit } from "./daily-call-policy";
import { reservationEnd, reservationsOverlap } from "./calendar-reservations";

/** The same hours, overlap and daily-limit rules serve suggestions and writes. */
export function callSlotFromSnapshot(preferences: unknown, after: Date, reservations: { kind: string; startsAt: Date; endsAt: Date | null }[], callDates: Date[], until = new Date(after.getTime() + 14 * 86400000)) {
  const days = new Map<string, { used: number; limit: number }>();
  for (const window of activeWindows(preferences, after, until)) {
    let candidate = new Date(Math.ceil(Math.max(after.getTime(), window.startsAt.getTime()) / 900000) * 900000);
    while (candidate.getTime() + 1800000 <= Math.min(window.endsAt.getTime(), until.getTime())) {
      const { day, start, end } = indiaWorkday(candidate);
      if (!days.has(day)) days.set(day, { used: callDates.filter(value => value >= start && value < end).length, limit: callDayLimit(preferences, activeWindows(preferences, start, end).reduce((sum, value) => sum + (value.endsAt.getTime() - value.startsAt.getTime()) / 60000, 0)) });
      const capacity = days.get(day)!;
      if (capacity.used >= capacity.limit) break;
      const conflicts = reservations.filter(value => reservationsOverlap({ kind: "CALL", startsAt: candidate, endsAt: null }, value));
      if (!conflicts.length) return candidate;
      candidate = new Date(Math.ceil(Math.max(...conflicts.map(value => reservationEnd(value).getTime())) / 900000) * 900000);
    }
  }
  return null;
}
