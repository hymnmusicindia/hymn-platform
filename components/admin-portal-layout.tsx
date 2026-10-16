"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, Menu, Search, ShieldCheck, X } from "lucide-react";
import { adminNavigation } from "@/lib/admin-workspace-navigation";
import { adminRoleGuidance } from "@/lib/admin-role-policy";
import { AdminNavigationGroups } from "./admin-navigation-groups";
import { InternalWorkspaceSwitcher } from "./internal-workspace-switcher";
import team from "./team/workspace.module.css";
import styles from "./admin-workspace.module.css";

export function AdminPortalLayout({ children, permissions, role = "unassigned", name = "Administrator" }: { children: React.ReactNode; permissions: string[]; role?: string; name?: string }) {
  const pathname = usePathname(), query = useSearchParams();
  const [collapsed, setCollapsed] = useState(false), [mobile, setMobile] = useState(false), [search, setSearch] = useState(""); const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const saved = localStorage.getItem("hymn-admin-sidebar"); setCollapsed(saved === "collapsed"); }, []);
  useEffect(() => { setMobile(false); }, [pathname, query]);
  useEffect(() => {
    const toggle = () => { if (innerWidth <= 1000) setMobile(value => !value); else setCollapsed(value => !value); };
    window.addEventListener("hymn-toggle-navigation", toggle);
    return () => window.removeEventListener("hymn-toggle-navigation", toggle);
  }, []);
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCollapsed(false); if (innerWidth <= 1000) setMobile(true); requestAnimationFrame(() => searchRef.current?.focus()); } if (e.key === "Escape") setMobile(false); }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
  if (pathname === "/admin/login") return children;
  if (!permissions.length) return <section className={styles.denied}><ShieldCheck /><h1>Admin Workspace access required</h1><p>An active platform administrator role is required. Team OS membership does not grant admin access.</p><Link href="/admin/login">Sign in as administrator</Link><Link href="/team">Return to Team OS</Link></section>;
  const nav = adminNavigation(permissions).map(n => ({ ...n, href: n.href || `/admin?tab=${n.key}` }));
  const active = pathname === "/admin" ? query.get("tab") || "overview" : nav.filter(n => n.href.startsWith("/admin/") && pathname.startsWith(n.href)).sort((a,b) => b.href.length - a.href.length)[0]?.key;
  const current = nav.find(n => n.key === active) || nav[0]; const guidance = adminRoleGuidance[role];
  return <div className={`${team.workspace} ${styles.workspace} ${collapsed ? team.collapsed : ""}`} data-admin-workspace>
    {mobile ? <button className={styles.backdrop} aria-label="Close admin navigation" onClick={() => setMobile(false)} /> : null}
    <aside className={`${team.sidebar} ${styles.sidebar} ${mobile ? team.mobileOpen : ""}`}><div className={team.brand}><span>HYMN <small>ADMIN OS</small></span><button aria-label={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"} onClick={() => { setCollapsed(!collapsed); localStorage.setItem("hymn-admin-sidebar", collapsed ? "expanded" : "collapsed"); }}><ChevronLeft size={18} /></button><button className={team.mobileClose} aria-label="Close navigation" onClick={() => setMobile(false)}><X size={18} /></button></div><div className={styles.switcher}><InternalWorkspaceSwitcher current="admin" name="HYMN Admin OS" /></div><div className={styles.finder}><Search size={15} /><input ref={searchRef} aria-label="Find admin module" placeholder="Find a module · ⌘K" value={search} onChange={e => { setSearch(e.target.value); setCollapsed(false); }} /></div><nav aria-label="Admin workspace"><AdminNavigationGroups items={nav} active={active} search={search}/></nav><Link href="/" className={team.return}><ArrowUpRight size={16} /><span>Back to HYMN</span></Link></aside>
    <div className={team.main}><header className={team.topbar}><button className={team.mobileMenu} aria-label="Open admin navigation" onClick={() => setMobile(true)}><Menu size={20} /></button><div><span className={team.eyebrow}>Admin Workspace / {current?.group}</span><p>{current?.label || "Administration"}</p></div><div className={styles.identity}><ShieldCheck size={16} /><div><strong>{name}</strong><span>{role.replaceAll("_", " ")} · {permissions.length} permissions</span></div></div></header><div className={`${team.content} ${styles.content}`}><div className={styles.access}><ShieldCheck size={15} /><p><strong>{guidance?.purpose || "Explicit administrator permissions"}</strong> {guidance?.boundary || "Only the modules and actions assigned to your role are available."}</p>{permissions.includes("system.manage") ? <Link href="/admin?tab=team">View access map</Link> : null}</div>{children}</div></div>
  </div>;
}
