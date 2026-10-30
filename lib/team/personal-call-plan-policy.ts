/** Owners opt in explicitly; routine employee routing continues to exclude them. */
export function personalCallPlan(preferences: unknown) {
  const crm = (preferences as { crm?: { personalCallPlan?: { enabled?: boolean; dailyLimit?: number } } } | null)?.crm;
  const plan = crm?.personalCallPlan;
  return { enabled: plan?.enabled === true, dailyLimit: plan?.dailyLimit === 3 ? 3 : 4 };
}
