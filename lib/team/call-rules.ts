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
  if (outcome === 'TALKED') return 'Conversation recorded. Review notes and email delivery history for any further assistance.';
  if (kind === 'FRIENDLY_INTRO' && !outcome) return 'Offer a friendly introduction to HYMN services, understand their needs, and invite them to reach out whenever they need help. Start with the saved contact context.';
  if (kind === 'SUPPORT_CALLBACK') return outcome === 'NO_ANSWER' ? 'Customer was unavailable. Support can send the missed-call template; wait for the customer to request another time.' : 'Read the customer support ticket, call the requested number, and help with that issue. Record the actual outcome.';
  if (outcome === 'NO_ANSWER') return 'No answer recorded. Try the next scheduled slot; do not mark the customer as contacted or send repeated messages.';
  if (outcome === 'INTERESTED') return 'Summarise the service they asked about, confirm their budget and timeline, and offer the next practical step.';
  if (outcome === 'CALLBACK') return 'The customer requested another time. Use the saved callback time and review the previous call notes before reaching out.';
  if (kind === 'DRAFT_INACTIVE') return 'Ask what is blocking the release: audio, artwork, credits or delivery details. Offer help completing it.';
  if (kind === 'ENQUIRY') return 'Read the exact enquiry first, answer that question, then ask what they would like to do next.';
  return 'This is browsing interest, not a booking. Ask whether help with the selected service would be welcome.';
}

/** Short, contextual prompts; imported free-text scripts stay in the full history. */
export function callbackSuggestions(context: { kind?: string; outcome?: string; service?: string } | null, missingEmail = false, blocked = false) {
  if (blocked) return ['Review the saved notes and previous attempts.', 'Ask a manager to review before further outreach.', 'Add context without recording another call.'];
  const kind = context?.kind, outcome = context?.outcome;
  let bullets: string[];
  if (outcome === 'NO_ANSWER') bullets = ['Review the last attempt before calling.', 'Try the next agreed slot; avoid repeated messages.'];
  else if (outcome === 'CALLBACK') bullets = ['Call at the time the client requested.', 'Review their previous questions first.'];
  else if (outcome === 'INTERESTED') bullets = ['Confirm their goal, timeline and budget.', 'Agree one practical next step.'];
  else if (kind === 'SUPPORT_CALLBACK') bullets = ['Read the support request before calling.', 'Help with that issue; confirm what is still needed.'];
  else if (kind === 'FRIENDLY_INTRO') bullets = ['Introduce yourself from HYMN; ask if now is convenient.', 'Ask what they are working on and where they need help.'];
  else if (kind === 'DRAFT_INACTIVE') bullets = ['Ask what is holding up their release draft.', 'Offer help with audio, artwork or credits.'];
  else if (kind === 'ENQUIRY') bullets = ['Read their enquiry and answer the main question.', 'Agree the next step together.'];
  else bullets = [`Ask if they need help with ${context?.service?.slice(0, 80) || 'the service they viewed'}.`, 'Browsing interest is not a booking or purchase.'];
  return [...bullets, missingEmail ? 'Confirm their preferred email for follow-up.' : 'Record the real outcome and any agreed follow-up.'];
}
