"use client";
import Link from "next/link";
import { HomeNewsletter } from "@/components/home-newsletter";
import { Gift, HelpCircle, Mail, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "@/app/styles/referral-center.css";

export function WorkspaceFooter({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const [open,setOpen] = useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{ if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[open]);
  const navigate=()=>{setOpen(false);onNavigate?.();};
  return <div className="workspace-footer-container" data-collapsed={collapsed}>
    <div className="workspace-footer-newsletter"><HomeNewsletter compact/></div>
    <button className="workspace-newsletter-expand" type="button" aria-label="Open newsletter signup" title="Newsletter" onClick={()=>window.dispatchEvent(new Event("hymn-toggle-navigation"))}><Mail size={19}/></button>
    <div className="workspace-footer" ref={root}>
    <Link href="/dashboard?tab=support" aria-label="Help & support" title="Help & support" onClick={navigate}><HelpCircle size={17}/></Link>
    <Link href="/dashboard?tab=referral" aria-label="Refer a friend" title="Refer a friend" onClick={navigate}><Gift size={17}/></Link>
    <button type="button" ref={trigger} className="workspace-footer-more" aria-label="More links" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><MoreHorizontal size={19}/></button>
    {open ? <nav className="workspace-footer-links" aria-label="More HYMN links"><Link href="/terms-of-service" onClick={navigate}>Terms of service</Link><Link href="/privacy-policy" onClick={navigate}>Privacy</Link><Link href="/policies" onClick={navigate}>Policy center</Link><Link href="/contact" onClick={navigate}>Contact HYMN</Link></nav>:null}
  </div></div>;
}
