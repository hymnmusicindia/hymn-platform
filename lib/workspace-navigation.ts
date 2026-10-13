import { Disc3, Folder, Headphones, LayoutGrid, Megaphone, Music2, Plus, ShieldCheck, Store, TrendingUp, Users, Wallet } from "lucide-react";

// Shared by the home rail and every artist/producer workspace frame.
export const workspaceNavigation = [
  { key:"overview", label:"Overview", group:"Home", href:"/dashboard", icon:LayoutGrid },
  { key:"files", label:"My files", group:"Library", href:"/audio-library", icon:Folder },
  { key:"upload", label:"Add release", group:"Distribution", href:"/distribution/start", icon:Plus },
  { key:"releases", label:"My releases", group:"Distribution", href:"/dashboard/releases", icon:Disc3 },
  { key:"analytics", label:"Trends", group:"Distribution", href:"/analytics", icon:TrendingUp },
  { key:"earnings", label:"Earnings & payouts", group:"Distribution", href:"/payout", icon:Wallet },
  { key:"promotions", label:"Promotion", group:"Distribution", href:"/dashboard?tab=promotions", icon:Megaphone },
  { key:"content-id", label:"Content ID", group:"Distribution", href:"/dashboard?tab=content-id", icon:ShieldCheck },
  { key:"collaborators", label:"Royalty splits", group:"Distribution", href:"/dashboard?tab=collaborators", icon:Users },
  { key:"plans", label:"Subscriptions", group:"Distribution", href:"/distribution", icon:Music2 },
  { key:"beat-store", label:"Browse beats", group:"Beatstore", href:"/beat-store", icon:Store },
  { key:"purchases", label:"My purchases", group:"Beatstore", href:"/dashboard?tab=purchases", icon:Music2 },
  { key:"sell-beats", label:"Sell beats", group:"Beatstore", href:"/producer/dashboard", icon:Users },
  { key:"studio", label:"Find an engineer", group:"Mixing / Mastering", href:"/studio", icon:Headphones },
  { key:"studio-engineer", label:"Engineer workspace", group:"Mixing / Mastering", href:"/studio/engineer", icon:Headphones },
  { key:"studio-readiness", label:"Mix-readiness check", group:"Mixing / Mastering", href:"/studio/readiness", icon:Music2 },
  { key:"studio-orders", label:"My projects", group:"Mixing / Mastering", href:"/dashboard/studio", icon:LayoutGrid },
  { key:"studio-apply", label:"Become an engineer", group:"Mixing / Mastering", href:"/studio/apply", icon:Users },
  { key:"managed-services", label:"Artist services", group:"Mixing / Mastering", href:"/managed-services", icon:Music2 },
];

export const workspaceGroups = Array.from(new Set(workspaceNavigation.map(item=>item.group)))
  .filter(title=>title!=="Home")
  .map(title=>({title,links:workspaceNavigation.filter(item=>item.group===title)}));

type NavItem = {key:string;label:string;group?:string;href?:string;description?:string};
export function consistentWorkspaceNavigation(items: NavItem[]): NavItem[] {
  // Administrative operations have a separate, permission-specific information architecture.
  if(items.some(item=>item.group==="Command Center")) return items;
  items = items.filter(item => item.group !== "Support" && item.group !== "Account");
  const producer = items.some(item=>item.key==="catalog" && item.group==="Beatstore");
  const matched = new Set<NavItem>();
  const shared = workspaceNavigation.map(canonical=>{
    const existing = items.find(item=>item.group!=="Business" && (item.label===canonical.label
      || (canonical.key==="earnings" && item.key==="earnings")
      || (canonical.key==="studio" && item.label==="Browse services")
      || (canonical.key==="overview" && item.key==="overview")));
    if(existing) matched.add(existing);
    return {...canonical,...existing,key:existing?.key ?? (items.some(item=>item.key===canonical.key) ? `workspace-${canonical.key}` : canonical.key),label:canonical.label,group:canonical.group,href:producer && existing ? existing.href : canonical.href};
  });
  const extras = items.filter(item=>!matched.has(item) && !(item.group==="Account" && item.href==="/dashboard?tab=settings") && !(item.group==="Distribution" && ["payouts", "earnings"].includes(item.key))).map(item=>({...item,
    group:item.group==="Business" ? "Beatstore" : item.group==="Profile" ? "Account" : item.group}));
  return [...new Set([...shared.map(item=>item.group),...extras.map(item=>item.group)])]
    .flatMap(group=>[...shared.filter(item=>item.group===group),...extras.filter(item=>item.group===group)]);
}
