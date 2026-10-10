"use client";

import Link from "next/link";
import { workspaceGroups } from "@/lib/workspace-navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, Home, Menu, Plus, X } from "lucide-react";

const groups = workspaceGroups;

export function LandingWorkspace({ children, workspaceHref }: {children:React.ReactNode; workspaceHref:string}) {
  const [open,setOpen] = useState(false);
  const [collapsed,setCollapsed] = useState(false);
  const [navigationReady,setNavigationReady] = useState(false);
  const [openGroup,setOpenGroup] = useState<string | null>("Distribution");
  useEffect(()=>{
    function toggleNavigation() { if(window.innerWidth<1024)setOpen(value=>!value);else setCollapsed(value=>!value); }
    function revealService(event: Event) { setOpenGroup((event as CustomEvent<string>).detail); setCollapsed(false); if(window.innerWidth<1024) setOpen(true); }
    function hideService() { setOpen(false); }
    window.addEventListener("hymn-reveal-service",revealService);
    window.addEventListener("hymn-hide-service",hideService);
    window.addEventListener("hymn-toggle-navigation",toggleNavigation);
    setNavigationReady(true);
    return ()=>{window.removeEventListener("hymn-toggle-navigation",toggleNavigation);window.removeEventListener("hymn-reveal-service",revealService);window.removeEventListener("hymn-hide-service",hideService);};
  },[]);
  return <div data-navigation-ready={navigationReady} className={`landing-workspace ${collapsed ? "rail-collapsed" : ""}`}>
    <button type="button" className="landing-mobile-menu" aria-expanded={open} aria-controls="landing-navigation" onClick={()=>setOpen(!open)}><Menu size={18}/> Explore HYMN <ChevronDown size={16}/></button>
    {open && <button className="landing-rail-backdrop" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
    <aside id="landing-navigation" className={`landing-rail ${open ? "is-open" : ""}`}>
      <div className="landing-rail-top"><button type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}><X size={18}/></button></div>
      <Link href="/distribution/start" className="landing-new" aria-label="New release"><Plus size={17}/><span>New</span></Link>
      <Link href="/" className="workspace-home-link is-active" aria-current="page" aria-label="Home" onClick={()=>setOpen(false)}><Home size={16}/><span>Home</span></Link>
      <nav aria-label="HYMN services">{groups.map(group=><div className="landing-nav-group" key={group.title}><button type="button" className="landing-group-title" aria-expanded={openGroup===group.title} aria-controls={`landing-group-${group.title.replaceAll(/[^a-z]/gi, "-")}`} onClick={()=>setOpenGroup(current=>current===group.title?null:group.title)}>{group.title}<ChevronDown size={13}/></button><div id={`landing-group-${group.title.replaceAll(/[^a-z]/gi, "-")}`} hidden={openGroup!==group.title}>{group.links.map(item=><Link href={item.href} data-guide-route={item.href} key={item.label} aria-label={item.label} className={`landing-nav-link ${item.label === "Promotion" ? "landing-service-divider" : ""}`} onClick={()=>setOpen(false)}><item.icon size={16}/><span>{item.label}</span></Link>)}</div></div>)}</nav>
      <div className="landing-rail-bottom"><Link href={workspaceHref}>Your workspace <ArrowUpRight size={15}/></Link><Link href="/contact">Talk to HYMN <ArrowUpRight size={15}/></Link><span>Independent music. Shared ambition.</span></div>
    </aside>
    <div className="landing-canvas">{children}</div>
  </div>;
}
