export const CALL_RESERVATION_MINUTES = 30;
type Slot = { kind: string; startsAt: Date; endsAt: Date | null };
export function reservationEnd(event: Slot) {
  // A call's uncertain completion time is not a multi-day availability hold.
  // Other explicitly timed events retain their actual duration; start-only
  // events also reserve a predictable half-hour rather than a zero-length point.
  return event.kind === "CALL" || !event.endsAt
    ? new Date(event.startsAt.getTime() + CALL_RESERVATION_MINUTES * 60000)
    : event.endsAt;
}
export function reservationsOverlap(first: Slot, second: Slot) {
  // Half-open intervals: 4:00–4:30 and 4:30–5:00 are valid adjacent slots.
  return first.startsAt < reservationEnd(second) && second.startsAt < reservationEnd(first);
}
