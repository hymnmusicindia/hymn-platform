import { reservationEnd, reservationsOverlap } from './calendar-reservations';
export const CALL_SLOT_MINUTES = 30;
/** Internal representative work windows in IST, not a customer-confirmed booking. */
export function callWindowStart(value: Date) {
  const local = new Date(value.getTime() + 330 * 60000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minute > 1050 || minute === 1050 && (local.getUTCSeconds() || local.getUTCMilliseconds())) { local.setUTCDate(local.getUTCDate() + 1); local.setUTCHours(9, 30, 0, 0); }
  else if (minute < 570) local.setUTCHours(9, 30, 0, 0);
  return new Date(local.getTime() - 330 * 60000);
}
export function freeCallSlot(after: Date, reservations: { kind: string; startsAt: Date; endsAt: Date | null }[]) {
  let candidate = callWindowStart(after);
  for (let i = 0; i < 14 * 18; i++) {
    const slot = { kind: 'CALL', startsAt: candidate, endsAt: null };
    const conflict = reservations.filter(event => reservationsOverlap(slot, event));
    if (!conflict.length) return candidate;
    candidate = callWindowStart(new Date(Math.max(...conflict.map(event => reservationEnd(event).getTime()))));
  }
  return null;
}
export function callbackTip(kind: string, outcome?: string) {
  if (kind === 'SUPPORT_CALLBACK') return outcome === 'NO_ANSWER' ? 'Customer was unavailable. Support can send the missed-call template; wait for the customer to request another time.' : 'Read the customer support ticket, call the requested number, and help with that issue. Record the actual outcome.';
  if (outcome === 'NO_ANSWER') return 'No answer recorded. Try the next scheduled slot; do not mark the customer as contacted or send repeated messages.';
  if (outcome === 'INTERESTED') return 'Summarise the service they asked about, confirm their budget and timeline, and offer the next practical step.';
  if (outcome === 'CALLBACK') return 'The customer requested another time. Use the saved callback time and review the previous call notes before reaching out.';
  if (kind === 'DRAFT_INACTIVE') return 'Ask what is blocking the release: audio, artwork, credits or delivery details. Offer help completing it.';
  if (kind === 'ENQUIRY') return 'Read the exact enquiry first, answer that question, then ask what they would like to do next.';
  return 'This is browsing interest, not a booking. Ask whether help with the selected service would be welcome.';
}
