export function callAllocationWeight(preferences: unknown) {
  const crm = (preferences as { crm?: { callWeight?: unknown } } | null)?.crm;
  const weight = crm?.callWeight;
  return typeof weight === 'number' && Number.isFinite(weight) ? Math.max(1, Math.min(2, weight)) : 1;
}

// Projected workload, rather than raw round-robin, keeps reassignments balanced.
export function callLoadScore(preferences: unknown, openCalls: number) {
  return (openCalls + 1) / callAllocationWeight(preferences);
}
