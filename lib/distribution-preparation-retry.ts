/** Capacity waits happen before ingest and never consume the failure allowance. */
export function preparationRetry(error: unknown, previousFailures: number, now = Date.now()) {
  const reason = error instanceof Error ? error.message : 'Delivery preparation needs review.';
  // Some worker/transaction boundaries preserve the message but drop custom
  // Error properties. Recognize only our exact internal capacity messages.
  const capacity = error instanceof Error && ((error as Error & { code?: string }).code === 'DIRENOTE_RATE_LIMIT'
    || /^DireNote (?:hourly request capacity is exhausted(?:\. Retry in \d+ minute\(s\)\.| during the provider Retry-After period\.)|requests deferred during the provider Retry-After period\.)$/.test(reason));
  const retryable = !/unconfirmed|reconcil|conflict|differs|changed|missing|invalid/i.test(reason)
    && /timed out|timeout|capacity|unavailable|connection|socket|ECONN|ETIMEDOUT/i.test(reason);
  const failures = capacity ? previousFailures : previousFailures + 1;
  const requested = Number((error as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? (reason.match(/Retry in (\d+) minute\(s\)\./)?.[1] ? Number(reason.match(/Retry in (\d+) minute\(s\)\./)![1]) * 60 : undefined));
  const delay = capacity ? Math.max(60, Number.isFinite(requested) ? requested : 3600) : Math.min(1800, 60 * 2 ** Math.min(5, failures - 1));
  return { reason, failures, deferredReason: capacity ? 'provider_capacity' : undefined,
    nextAttemptAt: capacity || retryable && failures < 5 ? new Date(now + delay * 1000).toISOString() : undefined };
}
