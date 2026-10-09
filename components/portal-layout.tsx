"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { DashboardFrame } from "@/components/dashboard-frame";

const navigation = [
  { key: "overview", label: "Overview", group: "Home", href: "/dashboard" },
  { key: "files", label: "My files", group: "Library", href: "/audio-library" },
  { key: "releases", label: "My releases", group: "Distribution", href: "/dashboard/releases" },
  { key: "upload", label: "Add release", group: "Distribution", href: "/distribution/start" },
  { key: "analytics", label: "Trends", group: "Distribution", href: "/analytics" },
  { key: "earnings", label: "Earnings", group: "Distribution", href: "/dashboard?tab=earnings" },
  { key: "promotions", label: "Promotion", group: "Distribution", href: "/dashboard/releases?view=promotion" },
  { key: "content-id", label: "Content ID", group: "Distribution", href: "/dashboard?tab=content-id" },
  { key: "collaborators", label: "Royalty splits", group: "Distribution", href: "/dashboard?tab=collaborators" },
  { key: "payout", label: "Payouts", group: "Distribution", href: "/payout" },
  { key: "beat-store", label: "Browse beats", group: "Beatstore", href: "/beat-store" },
  { key: "purchases", label: "My purchases", group: "Beatstore", href: "/dashboard?tab=purchases" },
  { key: "studio", label: "Browse services", group: "Mixing / Mastering", href: "/studio" },
  { key: "studio-orders", label: "My projects", group: "Mixing / Mastering", href: "/dashboard/studio" },
  { key: "managed-services", label: "Artist services", group: "Mixing / Mastering", href: "/managed-services" },
  { key: "settings", label: "Settings", group: "Account", href: "/dashboard?tab=settings" },
  { key: "support", label: "Help & support", group: "Account", href: "/dashboard?tab=support" }
];

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasOwnFrame = ["/dashboard", "/dashboard/customer", "/producer/dashboard", "/producer-dashboard", "/dashboard/admin"].includes(pathname);
  const activeKey = pathname.startsWith("/dashboard/releases") ? searchParams.get("view") === "promotion" ? "promotions" : "releases" : pathname.startsWith("/studio/orders") || pathname === "/dashboard/studio" ? "studio-orders" : pathname.startsWith("/distribution/start") || pathname === "/first-release" ? "upload" : navigation.find(item => item.href === pathname)?.key ?? "overview";
  return <div className="hymn-portal" data-theme="dark">{hasOwnFrame ? children : <DashboardFrame title="Your workspace" subtitle="HYMN Music" navItems={navigation} activeKey={activeKey} onSelect={() => {}} compactOverview>{children}</DashboardFrame>}</div>;
}
