"use client";
import { usePathname, useRouter } from "next/navigation";
import { DashboardFrame } from "@/components/dashboard-frame";
import { adminNavigation } from "@/lib/admin-workspace-navigation";

export function AdminPortalLayout({children,permissions}:{children:React.ReactNode;permissions:string[]}) {
  const pathname=usePathname();
  const router=useRouter();
  if(pathname==="/admin"||pathname==="/admin/login")return children;
  const nav=adminNavigation(permissions).map(item=>({...item,href:item.href||`/admin?tab=${item.key}`}));
  const current=[...nav].filter(item=>item.href?.startsWith("/admin/")&&pathname.startsWith(item.href)).sort((a,b)=>(b.href?.length||0)-(a.href?.length||0))[0];
  return <div className="admin-panel-shell py-6"><DashboardFrame title="Admin workspace" subtitle="Platform operations" navItems={nav} activeKey={current?.key||"settings"} onSelect={key=>router.push(`/admin?tab=${key}`)} compactOverview>{children}</DashboardFrame></div>;
}
