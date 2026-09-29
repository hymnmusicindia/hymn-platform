import { redirect } from "next/navigation";
import { AdminNewsletter } from "@/components/admin-newsletter";
import { getAdminSessionForPage, getCurrentUserForPage } from "@/lib/access";

export default async function NewsletterAdminPage() {
  const [user, session] = await Promise.all([getCurrentUserForPage(), getAdminSessionForPage()]);
  if (user?.role !== "admin" && !session) redirect("/admin/login");
  return <main className="shell py-12"><a href="/admin?tab=settings" className="text-sm text-[var(--accent)]">← Back to settings</a><div className="mt-7"><AdminNewsletter /></div></main>;
}
