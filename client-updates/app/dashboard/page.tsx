import { redirect } from "next/navigation";
import { CustomerDashboardShell } from "@/components/workspace-shells";
import { destinationForRole, getCurrentUserForPage } from "@/lib/access";
import { listOrdersByUser, listReleasesByUser } from "@/lib/db";

export default async function DashboardPage() {
  const user = await getCurrentUserForPage();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "customer") redirect(destinationForRole(user.role));

  const [releases, orders] = await Promise.all([listReleasesByUser(user.id), listOrdersByUser(user.id)]);

  return (
    <main className="shell py-16">
      <CustomerDashboardShell user={user} releases={releases} orders={orders} />
    </main>
  );
}

