import { retryAdminRead } from "@/lib/admin-read-retry";
import { privateRobots } from "@/lib/seo";
export const metadata = { robots: privateRobots };
import { AdminPortalLayout } from "@/components/admin-portal-layout";
import { getAdminAccessForPage } from "@/lib/access";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/session";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session,access] = await Promise.all([getSession(),retryAdminRead(() => getAdminAccessForPage())]);
  return <div className="force-dark" data-theme="dark"><SiteHeader user={session} /><AdminPortalLayout permissions={access?.permissions||[]} role={access?.role} name={session?.name}>{children}</AdminPortalLayout></div>;
}
