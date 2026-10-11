import { redirect } from "next/navigation";
import { AdminNewsletter } from "@/components/admin-newsletter";
import { requireAdminPermission } from "@/lib/access";

export default async function NewsletterAdminPage() {
  const admin=await requireAdminPermission("system.manage");
  if("error" in admin)redirect("/admin");
  return <main className="shell py-12"><a href="/admin?tab=settings" className="text-sm text-[var(--accent)]">← Back to settings</a><div className="mt-7"><AdminNewsletter /></div></main>;
}
