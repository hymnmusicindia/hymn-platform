"use client";
import { usePathname } from "next/navigation";
import { LandingWorkspace } from "@/components/landing-workspace";
import { HymnStudioRouteFrame } from "@/components/hymn-studio-route-frame";

export function PortalLayout({ children, user }: { children: React.ReactNode; user?: { name: string; role: string } | null }) {
  const pathname = usePathname();
  const studioFrame = ["/studio", "/dashboard", "/dashboard/customer", "/producer/dashboard", "/producer-dashboard"].includes(pathname);
  const studioTool = pathname.startsWith('/studio/') || !!user && ['/library','/audio-library','/dashboard/releases','/dashboard/purchases','/analytics','/payout'].some(path => pathname === path || pathname.startsWith(path + '/'));
  const hasOwnFrame = studioFrame || pathname === "/dashboard/admin";
  return <div className="hymn-portal" data-theme={studioFrame || studioTool ? undefined : "dark"}>{hasOwnFrame ? children : studioTool ? <HymnStudioRouteFrame user={user || {name:'',role:'guest'}}>{children}</HymnStudioRouteFrame> : <div className="hymn-landing hymn-service-pages"><LandingWorkspace workspaceHref="/studio" releaseNavigation={pathname === "/distribution/start"}>{children}</LandingWorkspace></div>}</div>;
}
