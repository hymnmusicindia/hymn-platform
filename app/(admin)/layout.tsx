import { AdminPortalLayout } from "@/components/admin-portal-layout";
import { getAdminAccessForPage } from "@/lib/access";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/session";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session,access] = await Promise.all([getSession(),getAdminAccessForPage()]);
  return <div className="hymn-portal-root force-dark admin-dark-workspace" data-theme="dark"><SiteHeader user={session} /><div className="hymn-portal" data-theme="dark"><AdminPortalLayout permissions={access?.permissions||[]}>{children}</AdminPortalLayout></div></div>;
}
