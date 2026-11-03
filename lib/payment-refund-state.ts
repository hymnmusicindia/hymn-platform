// A refund ID has one terminal outcome. Provider retries and delivery order
// must not add the same refund twice or reopen a completed/failed refund.
export function paymentRefundState(events: ReadonlyArray<{ eventType: string; amountMinor: number | null; payloadRedacted: unknown }>) {
  const processed = new Map<string, number>(), pending = new Set<string>(), failed = new Set<string>();
  let unknown = false;
  for (const event of events) {
    if (!['refund.created', 'refund.processed', 'refund.failed'].includes(event.eventType)) continue;
    const entity = (event.payloadRedacted as { entity?: { id?: unknown } } | null)?.entity;
    const id = typeof entity?.id === 'string' ? entity.id.trim() : '';
    if (!id || !Number.isSafeInteger(event.amountMinor) || event.amountMinor! < 0) { unknown = true; continue; }
    if (event.eventType === 'refund.processed') { processed.set(id, Math.max(processed.get(id) ?? 0, event.amountMinor!)); pending.delete(id); }
    else if (event.eventType === 'refund.failed') { failed.add(id); pending.delete(id); }
    else if (!processed.has(id) && !failed.has(id)) pending.add(id);
  }
  return { processed, pending, unknown, totalMinor: [...processed.values()].reduce((sum, value) => sum + value, 0) };
}

export function paymentDisputeState(events: ReadonlyArray<{ eventType: string; payloadRedacted: unknown }>) {
  const outcomes = new Map<string, string>();
  for (const event of events) {
    if (!['payment.dispute.created', 'payment.dispute.won', 'payment.dispute.lost'].includes(event.eventType)) continue;
    const id = (event.payloadRedacted as { entity?: { id?: unknown } } | null)?.entity?.id;
    const key = typeof id === 'string' && id ? id : 'unknown-dispute';
    const previous = outcomes.get(key);
    if (event.eventType === 'payment.dispute.lost' || previous !== 'payment.dispute.lost' && event.eventType === 'payment.dispute.won' || !previous) outcomes.set(key, event.eventType);
  }
  const states = [...outcomes.values()];
  return states.includes('payment.dispute.lost') ? 'payment.dispute.lost' : states.includes('payment.dispute.created') ? 'payment.dispute.created' : states.includes('payment.dispute.won') ? 'payment.dispute.won' : '';
}
