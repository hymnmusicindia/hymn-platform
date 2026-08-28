import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PayoutDashboard } from "@/components/payout-dashboard";
import { getCurrentUserForPage } from "@/lib/access";
import { getPayoutSummary } from "@/lib/payout";

export const metadata: Metadata = {
  title: "Payout | HYMN",
  description: "Track HYMN earnings, request withdrawals, and review payout history."
};

export default async function PayoutPage() {
  const user = await getCurrentUserForPage();
  if (!user) redirect("/login?role=customer&next=/payout");

  const summary = await getPayoutSummary(user.id);
  return <PayoutDashboard initialSummary={summary} />;
}

// vercel trigger 2
