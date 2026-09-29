import { redirect } from "next/navigation";
import { getCurrentUserForPage } from "@/lib/access";
import { ProducerEnrollment } from "@/components/producer-enrollment";

export default async function ProducerLoginPage() {
  const user = await getCurrentUserForPage();
  if (!user) redirect("/login?role=producer&next=/producer-login");
  if (user.role === "producer" || user.role === "admin") redirect("/producer/dashboard");
  return <ProducerEnrollment name={user.name} />;
}
