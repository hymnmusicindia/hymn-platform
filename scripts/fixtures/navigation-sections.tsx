"use client";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AdminNavigationGroups } from "@/components/admin-navigation-groups";
import { ModuleTabs } from "@/components/module-tabs";
import { DashboardFrame } from "@/components/dashboard-frame";
import { TeamWorkspaceUI } from "@/components/team/workspace";
import { adminNavigation } from "@/lib/admin-workspace-navigation";

function Fixture() {
  const query = useSearchParams();
  const [mode] = useState(query.get("mode") || "admin");
  const active = query.get("tab") || "overview";
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const go = (key: string) => { const next = new URLSearchParams(location.search); next.set("tab", key); history.pushState(null, "", location.pathname + "?" + next); };
  if (mode === "team") return <TeamWorkspaceUI actor={{ id: "fixture-member", workspaceId: "fixture-workspace", workspaceName: "Fixture", name: "Member", owner: false, jobTitle: "Researcher", permissions: ["crm.prospects.view", "team.members.view", "chat.use", "calendar.view"] }}/>;
  if (mode === "admin") {
    const limited = query.get("limited") === "1";
    const items = adminNavigation(limited ? ["royalties.import"] : ["system.manage", "users.read", "users.manage", "audit.read", "releases.read", "releases.review", "distribution.retry", "updates.review", "takedowns.review", "fraud.read", "wallets.adjust", "payouts.review", "royalties.import", "royalties.reconcile", "kyc.review", "services.manage"]).map(item => ({ ...item, href: "/navigation-sections-preview?mode=admin" + (limited ? "&limited=1" : "") + "&tab=" + item.key }));
    const current = items.find(item => item.key === active) || items[0];
    return <div style={{ display: "grid", gridTemplateColumns: "minmax(120px,220px) minmax(0,1fr)", padding: 12, gap: 16 }}>
      <nav aria-label="Admin sections"><AdminNavigationGroups items={items} active={active} search={query.get("search") || ""}/></nav>
      <main style={{ minWidth: 0 }}><ModuleTabs items={items.filter(item => item.group === current?.group)} active={current?.key} label={current?.group || "Admin"}/><h1>{current?.label}</h1></main>
    </div>;
  }
  return <DashboardFrame title="Navigation fixture" subtitle="Creator workspace" activeKey={active} onSelect={go} navItems={[
    { key: "overview", label: "Overview", group: "Home" },
    { key: "earnings", label: "Earnings", group: mode === "producer" ? "Business" : "Distribution" },
    { key: "payouts", label: "Payouts", group: "Distribution", href: "/payout" },
    { key: "profile", label: "Profile", group: "Account" },
    { key: "settings", label: "Settings", group: "Account" },
    { key: "referral", label: "Referrals", group: "Account" },
    { key: "support", label: "Help & support", group: "Support" },
  ]}><h2 data-selected-module data-fixture-ready={ready}>{active}</h2></DashboardFrame>;
}
export default function NavigationSectionsFixture() { return <Suspense><Fixture/></Suspense>; }
