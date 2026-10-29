"use client";
import Link from "next/link";
import { HomeNewsletter } from "@/components/home-newsletter";
import { Headset, HelpCircle, Mail, MoreHorizontal, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "@/app/styles/referral-center.css";

export function WorkspaceFooter({ onNavigate, collapsed = false, workspace = "creator", adminActivityAllowed = false }: { onNavigate?: () => void; collapsed?: boolean; workspace?: "admin" | "creator"; adminActivityAllowed?: boolean }) {
  const [open,setOpen] = useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{ if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[open]);
  const navigate=()=>{setOpen(false);onNavigate?.();};
  if (workspace === "admin" && !adminActivityAllowed) return null;
  if (workspace === "admin") return <div className="workspace-admin-footer"><Link prefetch={false} href="/admin?tab=activity" onClick={navigate} aria-label="Audit & activity"><HelpCircle size={16}/><span>Audit & activity</span></Link></div>;
  return <div className="workspace-footer-container" data-collapsed={collapsed}>
    <div className="workspace-footer-newsletter"><HomeNewsletter compact/></div>
    <button className="workspace-newsletter-expand" type="button" aria-label="Open newsletter signup" title="Newsletter" onClick={()=>window.dispatchEvent(new Event("hymn-toggle-navigation"))}><Mail size={19}/></button>
    <div className="workspace-footer" ref={root}>
    <Link prefetch={false} href="/dashboard?tab=support" aria-label="Help & support" title="Help & support" onClick={navigate}><Headset size={19} strokeWidth={1.75}/></Link>
    <Link prefetch={false} href="/dashboard?tab=referral" aria-label="Refer a friend" title="Refer a friend" onClick={navigate}><Users size={19} strokeWidth={1.75}/></Link>
    <button type="button" ref={trigger} className="workspace-footer-more" aria-label="More links" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><MoreHorizontal size={19}/></button>
    {open ? <nav className="workspace-footer-links" aria-label="More HYMN links"><Link prefetch={false} href="/terms-of-service" onClick={navigate}>Terms of service</Link><Link prefetch={false} href="/privacy-policy" onClick={navigate}>Privacy</Link><Link prefetch={false} href="/policies" onClick={navigate}>Policy center</Link><Link prefetch={false} href="/contact" onClick={navigate}>Contact HYMN</Link></nav>:null}
  </div></div>;
}
