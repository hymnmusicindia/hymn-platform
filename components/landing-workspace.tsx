"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, Disc3, Headphones, Home, LayoutGrid, Menu, Music2, Plus, Store, Users, X, TrendingUp, Wallet, Megaphone, ShieldCheck, Settings, LifeBuoy, Folder } from "lucide-react";

const groups = [
  { title:"Library", links:[{label:"My files",href:"/audio-library",icon:Folder}] },
  { title:"Distribution", links:[{label:"My releases",href:"/dashboard/releases",icon:Disc3},{label:"Trends",href:"/analytics",icon:TrendingUp},{label:"Earnings",href:"/payout",icon:Wallet},{label:"Promotion",href:"/dashboard?tab=promotions",icon:Megaphone},{label:"Content ID",href:"/dashboard?tab=content-id",icon:ShieldCheck},{label:"Royalty splits",href:"/dashboard?tab=collaborators",icon:Users}] },
  { title:"Beatstore", links:[{label:"Browse beats",href:"/beat-store",icon:Store},{label:"My purchases",href:"/dashboard?tab=purchases",icon:Music2},{label:"Sell beats",href:"/producer/dashboard",icon:Users}] },
  { title:"Mixing / Mastering", links:[{label:"Find an engineer",href:"/studio",icon:Headphones},{label:"My projects",href:"/dashboard/studio",icon:LayoutGrid},{label:"Artist services",href:"/managed-services",icon:Music2}] },
  { title:"Account", links:[{label:"Settings",href:"/dashboard?tab=settings",icon:Settings},{label:"Help & support",href:"/dashboard?tab=support",icon:LifeBuoy}] }
];

export function LandingWorkspace({ children, workspaceHref }: {children:React.ReactNode; workspaceHref:string}) {
  const [open,setOpen] = useState(false);
  const [collapsed,setCollapsed] = useState(false);
  const [navigationReady,setNavigationReady] = useState(false);
  const [openGroup,setOpenGroup] = useState<string | null>("Distribution");
  useEffect(()=>{
    function toggleNavigation() { if(window.innerWidth<1024)setOpen(value=>!value);else setCollapsed(value=>!value); }
    window.addEventListener("hymn-toggle-navigation",toggleNavigation);
    setNavigationReady(true);
    return ()=>window.removeEventListener("hymn-toggle-navigation",toggleNavigation);
  },[]);
  return <div data-navigation-ready={navigationReady} className={`landing-workspace ${collapsed ? "rail-collapsed" : ""}`}>
    <button type="button" className="landing-mobile-menu" aria-expanded={open} aria-controls="landing-navigation" onClick={()=>setOpen(!open)}><Menu size={18}/> Explore HYMN <ChevronDown size={16}/></button>
    {open && <button className="landing-rail-backdrop" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
    <aside id="landing-navigation" className={`landing-rail ${open ? "is-open" : ""}`}>
      <div className="landing-rail-top"><button type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}><X size={18}/></button></div>
      <Link href="/distribution/start" className="landing-new" aria-label="New release"><Plus size={17}/><span>New</span></Link>
      <Link href="/" className="landing-nav-link is-active" aria-current="page" aria-label="Home" onClick={()=>setOpen(false)}><Home size={16}/><span>Home</span></Link>
      <nav aria-label="HYMN services">{groups.map(group=><div className="landing-nav-group" key={group.title}><button type="button" className="landing-group-title" aria-expanded={openGroup===group.title} aria-controls={`landing-group-${group.title.replaceAll(/[^a-z]/gi, "-")}`} onClick={()=>setOpenGroup(current=>current===group.title?null:group.title)}>{group.title}<ChevronDown size={13}/></button><div id={`landing-group-${group.title.replaceAll(/[^a-z]/gi, "-")}`} hidden={openGroup!==group.title}>{group.links.map(item=><Link href={item.href} key={item.label} aria-label={item.label} className={`landing-nav-link ${item.label === "Promotion" ? "landing-service-divider" : ""}`} onClick={()=>setOpen(false)}><item.icon size={16}/><span>{item.label}</span></Link>)}</div></div>)}</nav>
      <div className="landing-rail-bottom"><Link href={workspaceHref}>Your workspace <ArrowUpRight size={15}/></Link><Link href="/contact">Talk to HYMN <ArrowUpRight size={15}/></Link><span>Independent music. Shared ambition.</span></div>
    </aside>
    <div className="landing-canvas">{children}</div>
  </div>;
}
