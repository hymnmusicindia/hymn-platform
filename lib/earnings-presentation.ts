import type { PayoutSummary } from "@/lib/payout";
export const moneyLabel = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
export function payoutReadiness(summary: PayoutSummary) {
  const active = [...summary.payoutHistory].filter(row => ["requested", "under_review", "approved", "processing"].includes(row.status)).sort((a,b) => b.requestDate.localeCompare(a.requestDate))[0];
  if (active) return { ready:false, title:"Your withdrawal is in progress", detail:`Request #${active.id} is ${active.status.replace(/_/g," ")}. ${moneyLabel(active.requestedAmount)} is reserved while it is processed.`, tab:"requests" as const };
  if (summary.payoutProfileStatus !== "verified") return { ready:false, title:summary.payoutProfileStatus === "missing" ? "Add your payout details" : "Your payout profile needs attention", detail:summary.payoutProfileStatus === "missing" ? "Add a bank account or UPI ID to prepare for your first withdrawal." : `Profile status: ${summary.payoutProfileStatus.replace(/_/g," ")}. Your profile must be verified before you can withdraw.`, tab:"details" as const };
  if (summary.exchangeRate.rateStatus !== "active" || summary.availableBalanceUsd === null) return { ready:false,title:"Waiting for a current exchange rate",detail:"Your INR balance is unchanged. Withdrawal requests resume when a current USD conversion is available.",tab:null };
  if (!summary.payoutEligible) return { ready:false,title:"Building toward your next payout",detail:`Minimum withdrawal: $${summary.minimumPayoutUsd} USD. Your available balance is approximately $${summary.availableBalanceUsd.toFixed(2)}.`,tab:null };
  if (!summary.quarter.payoutRequestsOpen) return { ready:false,title:"Your balance is waiting for the payout window",detail:"Requests open after the reporting quarter closes. Your available balance stays in your account.",tab:"quarterly" as const };
  return { ready:true,title:"Ready when you are",detail:"Your balance meets the withdrawal threshold. Requests are reviewed before payment.",tab:null };
}
export function recentEarningMonths(rows: PayoutSummary["monthlyEarnings"]) {
  return [...rows].sort((a,b)=>monthOrder(a.month)-monthOrder(b.month)).slice(-6);
}

export function monthOrder(label: string) {
  const iso = /^(\d{4})-(\d{2})/.exec(label);
  if (iso) return Number(iso[1])*12+Number(iso[2])-1;
  const [month, year] = label.split(" ");
  return Number(year)*12+["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(month.slice(0,3));
}
