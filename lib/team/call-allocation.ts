export function callAllocationWeight(preferences: unknown) {
  const crm = (preferences as { crm?: { callWeight?: unknown } } | null)?.crm;
  const weight = crm?.callWeight;
  return typeof weight === 'number' && Number.isFinite(weight) ? Math.max(1, Math.min(2, weight)) : 1;
}

// Projected workload, rather than raw round-robin, keeps reassignments balanced.
export function callLoadScore(preferences: unknown, openCalls: number) {
  return (openCalls + 1) / callAllocationWeight(preferences);
}

/** Dedicated call representatives take new call work before backup callers. */
export function callRepresentativePriority(member: { preferences: unknown; role: { name: string } }) {
  const crm = (member.preferences as { crm?: { workRole?: string } } | null)?.crm;
  return crm?.workRole === 'caller' || /call representative/i.test(member.role.name) ? 1 : 0;
}
