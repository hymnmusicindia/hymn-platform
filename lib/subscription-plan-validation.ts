export class SubscriptionPlanConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionPlanConfigurationError";
  }
}

export const subscriptionCheckoutUnavailable = "This subscription checkout is temporarily unavailable. Please try again later or contact HYMN support. No payment was taken.";

export function validateSubscriptionProviderPlan(
  provider: { item?: { amount?: number | string; currency?: string }; period?: string; interval?: number },
  expected: { amount: number; currency: string; months: number; planEnv: string },
) {
  if (Number(provider.item?.amount) !== expected.amount || provider.item?.currency?.toUpperCase() !== expected.currency) {
    throw new SubscriptionPlanConfigurationError(`${expected.planEnv}: expected ${expected.amount} minor units ${expected.currency}; provider has ${provider.item?.amount} ${provider.item?.currency}.`);
  }
  const interval = Number(provider.interval);
  const monthsPerPeriod: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };
  const months = monthsPerPeriod[provider.period || ""] * interval;
  if (!Number.isInteger(interval) || interval < 1 || months !== expected.months) {
    throw new SubscriptionPlanConfigurationError(`${expected.planEnv}: expected a ${expected.months}-month billing interval; provider has ${provider.period} every ${provider.interval}.`);
  }
}
