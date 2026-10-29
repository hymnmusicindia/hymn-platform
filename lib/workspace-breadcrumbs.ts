import {adminWorkspaceNavigation} from "@/lib/admin-workspace-navigation";
import { workspaceNavigation } from "@/lib/workspace-navigation";

export type WorkspaceCrumb = { label: string; href: string };
type ActiveLocation = { group: string; label?: string; href?: string };
const roots: Record<string, string> = {
  Administration: "/admin", Team: "/team", Home: "/", Library: "/audio-library", Distribution: "/dashboard/releases", Beatstore: "/beat-store",
  "Mixing / Mastering": "/studio", Account: "/dashboard?tab=settings", Support: "/dashboard?tab=support", Workspace: "/dashboard"
};
const title = (part: string) => part.replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

export function workspaceBreadcrumbs(pathname: string, search = "", active?: ActiveLocation): WorkspaceCrumb[] {
  const query = new URLSearchParams(search);
  const tab = pathname === "/dashboard" ? query.get("tab") : null;
  const exact = workspaceNavigation.find(item => {
    const url = new URL(item.href, "https://hymnmusic.fun");
    return url.pathname === pathname && url.searchParams.get("tab") === tab;
  });
  let group = exact?.group;
  let leaf: WorkspaceCrumb | undefined = exact ? { label: exact.label, href: exact.href } : undefined;
  let detail: string | undefined;
  if (pathname.startsWith("/dashboard/releases/")) { group = "Distribution"; leaf = { label: "My releases", href: "/dashboard/releases" }; detail = pathname.endsWith("/qc-report") ? "Quality review" : "Release details"; }
  else if (pathname.startsWith("/dashboard/purchases/")) { group="Beatstore"; leaf={label:"My purchases",href:"/dashboard/purchases"};detail="Purchase details"; }
  else if (pathname.startsWith("/studio/orders/")) { group = "Mixing / Mastering"; leaf = { label: "My projects", href: "/dashboard/studio" }; detail = "Project details"; }
  else if (pathname.startsWith("/studio/engineers/")) { group = "Mixing / Mastering"; leaf = { label: "Find an engineer", href: "/studio" }; detail = "Engineer profile"; }
  else if (pathname.startsWith("/beat-store/producers/")) { group = "Beatstore"; leaf = { label: "Browse beats", href: "/beat-store" }; detail = "Producer profile"; }
  else if (pathname === "/first-release") { group = "Distribution"; leaf = { label: "Add release", href: pathname }; }
  else if (pathname === "/royalty-payouts") { group = "Distribution"; leaf = { label: "Earnings & payouts", href: "/payout" }; }
  if (pathname.startsWith("/admin")) {
    group = "Administration";
    const item = adminWorkspaceNavigation.find(item => item.href === pathname);
    leaf = {label:item?.label || (pathname === "/admin" ? "Operations dashboard" : title(pathname.split("/").filter(Boolean).at(-1) || "Administration")),href:pathname+search};
    if (/^\/admin\/studio\/orders\/[^/]+$/.test(pathname)) { leaf={label:"Studio operations",href:"/admin/studio"}; detail="Project details"; }
    else if (/^\/admin\/referrals\/\d+$/.test(pathname)) { leaf={label:"Referrals",href:"/admin/referrals"}; detail="Referral details"; }
  }
  if (/^\/team\/performance(?:\/\d+)?$/.test(pathname)) { group="Team";leaf={label:"Performance",href:"/team/performance"};if(pathname!=="/team/performance")detail="Saved report"; }
  if (/^\/licenses\/[^/]+$/.test(pathname)) { group="Beatstore";leaf={label:"My purchases",href:"/dashboard/purchases"};detail="Licence details"; }
  if (/^\/p\/[^/]+$/.test(pathname)) { group="Beatstore";leaf={label:"Browse beats",href:"/beat-store"};detail="Producer profile"; }
  if (pathname === "/payout" && query.get("tab") && query.get("tab") !== "overview") {
    const sections: Record<string, string> = { monthly: "Earnings history", quarterly: "Quarter summary", statements: "Statements", requests: "Withdrawals", details: "Payout details" };
    detail = sections[query.get("tab")!];
  }
  // Frames also report local producer/admin tabs, which do not always change the URL.
  if (active && !detail && active.label && active.group !== "Workspace") {
    group = pathname.startsWith("/admin") ? "Administration" : active.group;
    leaf = { label: active.label, href: active.href ?? pathname + search };
  }
  if (pathname === "/") return [{ label: "Home", href: "/" }];
  if (!group) return [{ label: "Home", href: "/" }, { label: title(pathname.split("/").filter(Boolean).at(-1) ?? "Home"), href: pathname + search }];
  const crumbs: WorkspaceCrumb[] = [{ label: group, href: roots[group] ?? "/dashboard" }];
  if (leaf && leaf.label !== group) crumbs.push(leaf);
  if (detail) crumbs.push({ label: detail, href: pathname + search });
  return crumbs;
}
