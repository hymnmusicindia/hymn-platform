import { redirect } from "next/navigation";
import { ProducerDashboardShell } from "@/components/producer-dashboard-shell";
import { getCurrentUserForPage } from "@/lib/access";
import { getProducerEarnings, listBeatsByProducer, listOrdersByProducer } from "@/lib/db";
import { getProducerFinanceSummary } from "@/lib/producer-finance";

export default async function ProducerDashboardPage() {
  const user = await getCurrentUserForPage();
  if (!user) redirect("/login?role=producer");
  if (user.role !== "producer" && user.role !== "admin") redirect("/dashboard?producerAccess=disabled");

  const [beats, orders, earnings, finance] = await Promise.all([
    listBeatsByProducer(user.id),
    listOrdersByProducer(user.id),
    getProducerEarnings(user.id),
    getProducerFinanceSummary(user.id)
  ]);

  return <main className="producer-panel-shell py-6 sm:py-8"><ProducerDashboardShell user={user} beats={beats} orders={orders} earnings={earnings} finance={finance} /></main>;
}

// vercel trigger 11
