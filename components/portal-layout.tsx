"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { workspaceNavigation } from "@/lib/workspace-navigation";
import { DashboardFrame } from "@/components/dashboard-frame";

const navigation = workspaceNavigation;

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasOwnFrame = ["/dashboard", "/dashboard/customer", "/producer/dashboard", "/producer-dashboard", "/dashboard/admin"].includes(pathname);
  const activeKey = pathname.startsWith("/dashboard/releases") ? searchParams.get("view") === "promotion" ? "promotions" : "releases" : pathname.startsWith("/studio/orders") || pathname === "/dashboard/studio" ? "studio-orders" : pathname.startsWith("/distribution/start") || pathname === "/first-release" ? "upload" : navigation.find(item => item.href === pathname + (searchParams.size ? `?${searchParams.toString()}` : ""))?.key ?? "overview";
  return <div className="hymn-portal" data-theme="dark">{hasOwnFrame ? children : <DashboardFrame title="Your workspace" subtitle="HYMN Music" navItems={navigation} activeKey={activeKey} onSelect={() => {}} compactOverview>{children}</DashboardFrame>}</div>;
}
