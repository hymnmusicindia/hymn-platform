import { redirect } from "next/navigation";
import { ProducerDashboardShell } from "@/components/workspace-shells";
import { destinationForRole, getCurrentUserForPage } from "@/lib/access";
import { getProducerEarnings, listBeatsByProducer, listOrdersByProducer } from "@/lib/db";

export default async function ProducerDashboardPage() {
  const user = await getCurrentUserForPage();

  if (!user) {
    redirect("/login?role=producer");
  }

  if (user.role !== "producer") redirect(destinationForRole(user.role));

  const [beats, orders, earnings] = await Promise.all([
    listBeatsByProducer(user.id),
    listOrdersByProducer(user.id),
    getProducerEarnings(user.id)
  ]);

  return (
    <main className="shell py-16">
      <ProducerDashboardShell user={user} beats={beats} orders={orders} earnings={earnings} />
    </main>
  );
}



