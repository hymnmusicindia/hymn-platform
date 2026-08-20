export const ARTIST_PROFILE_LIMITS = {
  one_time: 5,
  half_yearly: 5,
  yearly: 7,
  yearly_plus: 15,
  pay_per_release: 5,
  basic: 5,
  pro: 7,
  elite: 15
} as const;

export function artistProfileLimitForPlan(plan?: string | null) {
  return ARTIST_PROFILE_LIMITS[plan as keyof typeof ARTIST_PROFILE_LIMITS] ?? 0;
}

// vercel trigger 2
