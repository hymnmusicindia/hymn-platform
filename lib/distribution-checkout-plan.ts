import type { DistributionPlanOption } from "./distribution-plans";

/** Carry the server's persisted order plan through upload and payment callbacks. */
export function checkoutPlan(order: { plan?: unknown }, fallback: DistributionPlanOption): DistributionPlanOption {
  const legacy: Record<string, DistributionPlanOption> = { pay_per_release: "one_time", basic: "half_yearly", pro: "yearly", elite: "yearly_plus" };
  if (typeof order.plan === "string" && legacy[order.plan]) return legacy[order.plan];
  return ["one_time", "half_yearly", "yearly", "yearly_plus"].includes(String(order.plan)) ? order.plan as DistributionPlanOption : fallback;
}
