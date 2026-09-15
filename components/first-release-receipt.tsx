import { FIRST_RELEASE_BASE_DISCOUNT } from "@/lib/first-release-promotion";
import { findDistributionPlan } from "@/lib/distribution-plans";

type ReceiptProps = {
  className?: string;
  totalLabel?: string;
};

// Uses the same price and first-release credit sources as the checkout flow.
// It is deliberately presentational so it can be reused in the pass and CTA.
export function FirstReleaseReceipt({ className = "", totalLabel = "DUE TODAY" }: ReceiptProps) {
  const baseAmount = findDistributionPlan("one_time").price;
  const credit = Math.min(FIRST_RELEASE_BASE_DISCOUNT, baseAmount);
  const due = Math.max(0, baseAmount - credit);

  return <div className={`first-release-receipt ${className}`} aria-label={`First release receipt: due today ₹${due}`}>
    <span>Base distribution <b>₹{baseAmount}</b></span>
    <span>HYMN first-release credit <b>−₹{credit}</b></span>
    <strong>{totalLabel} <b>₹{due}</b></strong>
  </div>;
}
