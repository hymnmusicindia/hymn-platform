import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { AdminClientCards } from "@/components/admin-client-cards";

export default async function AdminClientCardsPage() {
  const admin = await requireAdminPermission("users.manage");
  if ("error" in admin) redirect("/admin/login");
  return <AdminClientCards />;
}
