import { redirect } from "next/navigation";
import { CustomerDashboardShell } from "@/components/customer-dashboard-shell";
import { getCurrentUserForPage } from "@/lib/access";
import { listOrdersByUser, listReleasesByUser, getSubscriptionByUserId } from "@/lib/db";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ producerAccess?: string }> }) {
  const user = await getCurrentUserForPage();

  if (!user) {
    redirect("/login");
  }


  const [releases, orders, subscription] = await Promise.all([
    listReleasesByUser(user.id),
    listOrdersByUser(user.id),
    getSubscriptionByUserId(user.id)
  ]);

  return (
    <main className="customer-panel-shell py-6 sm:py-8">
      <CustomerDashboardShell
        user={user}
        releases={releases}
        orders={orders}
        subscription={subscription}
        producerAccessDisabled={(await searchParams)?.producerAccess === "disabled"}
      />
    </main>
  );
}

// vercel trigger 7
