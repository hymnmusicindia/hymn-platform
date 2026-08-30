export type DistributionOrderPriceCheck = {
  amount: number;
  creditsUsed: number;
  expectedAmount: number;
  currency: string;
  subscriptionEntitlement: boolean;
};

export function distributionOrderPriceMatches(input: DistributionOrderPriceCheck) {
  if (input.currency.toUpperCase() !== "INR") return false;
  if (![input.amount, input.creditsUsed, input.expectedAmount].every(Number.isSafeInteger)) return false;
  if (input.amount < 0 || input.creditsUsed < 0 || input.expectedAmount < 0) return false;

  // Active subscriptions create a zero-value entitlement order. The retail
  // subscription price was paid through the subscription billing flow and
  // must not be charged or represented as credits on each release.
  if (input.subscriptionEntitlement) return input.amount === 0 && input.creditsUsed === 0;

  // One-time releases may be paid by Razorpay, HYMN credits, or a combination.
  return input.amount + input.creditsUsed === input.expectedAmount;
}
