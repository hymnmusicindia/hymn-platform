import { redirect } from "next/navigation";
import { AnalyticsOverview } from "@/components/analytics-overview";
import { destinationForRole, getCurrentUserForPage } from "@/lib/access";
import { getAnalyticsSummary } from "@/lib/db";

export default async function AnalyticsPage() {
  const user = await getCurrentUserForPage();
  if (!user) {
    return (
      <main className="shell py-16">
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center">
          <span className="eyebrow">Protected analytics</span>
          <h1 className="text-4xl font-semibold text-white">Log in to open analytics.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/65">Customers, producers, and admins each receive a different analytics view based on their role.</p>
        </div>
      </main>
    );
  }

  if (!["customer", "producer", "admin"].includes(user.role)) redirect(destinationForRole(user.role));
  const summary = await getAnalyticsSummary(user);

  return (
    <main className="shell py-16">
      <AnalyticsOverview summary={summary} />
    </main>
  );
}


