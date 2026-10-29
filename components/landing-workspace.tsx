"use client";

import Link from "next/link";
import { WorkspaceFooter } from "@/components/workspace-footer";
import { WorkspaceDestinations } from "@/components/workspace-destinations";
import { workspaceGroups, workspaceGroupDestination, workspaceGroupForPath } from "@/lib/workspace-navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, Menu, Plus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { ReleaseNavigationTarget } from "./release-navigation-slot";

const groups = workspaceGroups;

export function LandingWorkspace({ children, workspaceHref, releaseNavigation = false }: {children:React.ReactNode; workspaceHref:string; releaseNavigation?:boolean}) {
  const pathname = usePathname();
  const activeGroup = workspaceGroupForPath(pathname);
  const [navigationTarget, setNavigationTarget] = useState<HTMLDivElement | null>(null);
  const [open,setOpen] = useState(false);
  const [collapsed,setCollapsed] = useState(false);
  const [navigationReady,setNavigationReady] = useState(false);
  const [openGroup,setOpenGroup] = useState<string | null>(activeGroup);
  useEffect(() => { setOpenGroup(activeGroup); }, [pathname, activeGroup]);
  useEffect(()=>{
    function toggleNavigation() { if(window.innerWidth<1024)setOpen(value=>!value);else setCollapsed(value=>!value); }
    function revealService(event: Event) { setOpenGroup((event as CustomEvent<string>).detail); setCollapsed(false); if(window.innerWidth<1024) setOpen(true); }
    function hideService() { setOpenGroup(activeGroup); setOpen(false); }
    window.addEventListener("hymn-reveal-service",revealService);
    window.addEventListener("hymn-hide-service",hideService);
    window.addEventListener("hymn-toggle-navigation",toggleNavigation);
    setNavigationReady(true);
    return ()=>{window.removeEventListener("hymn-toggle-navigation",toggleNavigation);window.removeEventListener("hymn-reveal-service",revealService);window.removeEventListener("hymn-hide-service",hideService);};
  },[activeGroup]);
  return <div data-navigation-ready={navigationReady} className={`landing-workspace ${collapsed ? "rail-collapsed" : ""}`}>
    <button type="button" className="landing-mobile-menu" aria-expanded={open} aria-controls="landing-navigation" onClick={()=>setOpen(!open)}><Menu size={18}/> Explore HYMN <ChevronDown size={16}/></button>
    {open && <button className="landing-rail-backdrop" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
    <aside id="landing-navigation" className={`landing-rail ${open ? "is-open" : ""}`}>
      <div className="landing-rail-top"><button type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}><X size={18}/></button></div>
      <div className="workspace-launch-row">
      <Link href="/distribution/start" className="landing-new" aria-label="New release"><Plus size={17}/><span>New</span></Link>
      <WorkspaceDestinations homeActive={pathname === "/" || pathname === "/home"} overviewHref={workspaceHref} onNavigate={()=>setOpen(false)} />
      </div>
      <nav aria-label="HYMN services">{groups.map(group => {
        const destination = workspaceGroupDestination(group.title);
        const items = group.links.filter(item => item.key !== destination?.key);
        const menuId = `landing-group-${group.title.replaceAll(/[^a-z]/gi, "-")}`;
        return <div className="landing-nav-group" key={group.title}>
          {destination ? <div className="workspace-service-heading"><Link href={destination.href} aria-label={group.title} title={group.title} aria-expanded={openGroup===group.title} aria-controls={menuId} data-guide-route={destination.href} className="landing-group-title" onClick={()=>{setOpenGroup(group.title);setOpen(false);}}><span>{group.title}</span></Link></div> : <button type="button" className="landing-group-title" aria-expanded={openGroup===group.title} aria-controls={menuId} onClick={()=>setOpenGroup(current=>current===group.title?null:group.title)}><span>{group.title}</span></button>}
          <div id={menuId} hidden={openGroup!==group.title}>{items.map(item=><Link href={item.href} data-guide-route={item.href} key={item.label} aria-label={item.label} className={`landing-nav-link ${item.label === "Promotion" ? "landing-service-divider" : ""}`} onClick={()=>setOpen(false)}><item.icon size={16}/><span>{item.label}</span></Link>)}</div>
        </div>;
      })}</nav>
      <div className="landing-rail-bottom"><Link href={workspaceHref}>Your workspace <ArrowUpRight size={15}/></Link><Link href="/contact">Talk to HYMN <ArrowUpRight size={15}/></Link><span>Independent music. Shared ambition.</span></div>
      <WorkspaceFooter collapsed={collapsed} onNavigate={()=>setOpen(false)}/>
    </aside>
    <div className="landing-canvas">
      {releaseNavigation ? <div ref={setNavigationTarget} className="release-navigation-header" /> : null}
      <ReleaseNavigationTarget.Provider value={releaseNavigation ? navigationTarget : undefined}>
        <div className="landing-page-content" data-workspace-page={pathname === "/" || pathname === "/home" ? "home" : "service"}>{children}</div>
      </ReleaseNavigationTarget.Provider>
    </div>
  </div>;
}
