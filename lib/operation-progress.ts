/** Shared timing for async work; completion is always server/callback confirmed. */
export function operationTarget(elapsedMs: number) {
  const seconds = Math.max(0, elapsedMs) / 1000;
  if (seconds <= 2) return 1 + 49 * seconds / 2;
  if (seconds <= 8) return 50 + 30 * (seconds - 2) / 6;
  return Math.min(99, 80 + 19 * (1 - Math.exp(-(seconds - 8) / 18)));
}
export function advanceOperationProgress(current: number, target: number, elapsedMs: number) {
  const rate = current < 50 ? 28 : current < 80 ? 9 : current < 95 ? 2 : .45;
  return Math.min(99, Math.max(current, Math.min(target, current + rate * Math.min(1000, Math.max(0, elapsedMs)) / 1000)));
}
