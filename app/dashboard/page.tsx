import { redirect } from "next/navigation";
import { CustomerDashboardShell } from "@/components/workspace-shells";
import { destinationForRole, getCurrentUserForPage } from "@/lib/access";
import { listOrdersByUser, listReleasesByUser, getSubscriptionByUserId, getAnalyticsByUserId } from "@/lib/db";

export default async function DashboardPage() {
  const user = await getCurrentUserForPage();

  if (!user) {
    redirect("/login");
  }


  const [releases, orders, subscription, analytics] = await Promise.all([
    listReleasesByUser(user.id),
    listOrdersByUser(user.id),
    getSubscriptionByUserId(user.id),
    getAnalyticsByUserId(user.id)
  ]);

  return (
    <main className="shell py-16">
      <CustomerDashboardShell user={user} releases={releases} orders={orders} subscription={subscription} analytics={analytics} />
    </main>
  );
}

