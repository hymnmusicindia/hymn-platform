"use client";
import { usePathname } from "next/navigation";
import { LandingWorkspace } from "@/components/landing-workspace";

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hasOwnFrame = ["/dashboard", "/dashboard/customer", "/producer/dashboard", "/producer-dashboard", "/dashboard/admin"].includes(pathname);
  return <div className="hymn-portal" data-theme="dark">{hasOwnFrame ? children : <div className="hymn-landing hymn-service-pages"><LandingWorkspace workspaceHref="/dashboard" releaseNavigation={pathname === "/distribution/start"}>{children}</LandingWorkspace></div>}</div>;
}
