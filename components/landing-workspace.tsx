"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ChevronDown, Disc3, Headphones, Home, LayoutGrid, Menu, Music2, Plus, Store, Users, X } from "lucide-react";

const groups = [
  { title:"Distribution", links:[{label:"Release your music",href:"/distribution",icon:Disc3},{label:"Released on HYMN",href:"#released",icon:Music2},{label:"Your release journey",href:"#journey",icon:LayoutGrid}] },
  { title:"Beatstore", links:[{label:"Discover beats",href:"#beats",icon:Headphones},{label:"Browse the store",href:"/beat-store",icon:Store},{label:"For producers",href:"#producers",icon:Users}] },
  { title:"Mixing / Mastering", links:[{label:"Find an engineer",href:"/studio",icon:Headphones},{label:"Artist services",href:"/managed-services",icon:LayoutGrid}] },
  { title:"Community", links:[{label:"Artist stories",href:"#artists",icon:Users},{label:"Stay in the loop",href:"#newsletter",icon:Music2}] }
];

export function LandingWorkspace({ children, workspaceHref }: {children:React.ReactNode; workspaceHref:string}) {
  const [open,setOpen] = useState(false);
  const [closed,setClosed] = useState<string[]>([]);
  return <div className="landing-workspace">
    <button type="button" className="landing-mobile-menu" aria-expanded={open} aria-controls="landing-navigation" onClick={()=>setOpen(!open)}><Menu size={18}/> Explore HYMN <ChevronDown size={16}/></button>
    {open && <button className="landing-rail-backdrop" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
    <aside id="landing-navigation" className={`landing-rail ${open ? "is-open" : ""}`}>
      <div className="landing-rail-top"><span>YOUR NEXT CHAPTER</span><button type="button" aria-label="Close navigation" onClick={()=>setOpen(false)}><X size={18}/></button></div>
      <Link href="/first-release" className="landing-new"><Plus size={17}/> Start a release</Link>
      <a href="#home" className="landing-nav-link is-active" onClick={()=>setOpen(false)}><Home size={16}/> Home</a>
      <nav aria-label="HYMN services">{groups.map(group=><div className="landing-nav-group" key={group.title}><button type="button" className="landing-group-title" aria-expanded={!closed.includes(group.title)} onClick={()=>setClosed(current=>current.includes(group.title)?current.filter(item=>item!==group.title):[...current,group.title])}>{group.title}<ChevronDown size={13} className={closed.includes(group.title)?"is-closed":""}/></button>{!closed.includes(group.title)&&group.links.map(item=><Link href={item.href} key={item.label} className="landing-nav-link" onClick={()=>setOpen(false)}><item.icon size={16}/>{item.label}</Link>)}</div>)}</nav>
      <div className="landing-rail-bottom"><Link href={workspaceHref}>Your workspace <ArrowUpRight size={15}/></Link><Link href="/contact">Talk to HYMN <ArrowUpRight size={15}/></Link><span>Independent music. Shared ambition.</span></div>
    </aside>
    <div className="landing-canvas"><div className="landing-canvas-bar"><span><LayoutGrid size={15}/> Artist hub</span><span>Make your next move.</span><Link href={workspaceHref}>Open workspace <ArrowUpRight size={15}/></Link></div>{children}</div>
  </div>;
}
