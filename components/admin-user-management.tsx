"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Search, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { AdminUserBenefits } from "@/components/admin-user-benefits";
import type { AdminPermissionKey } from "@/lib/access";
import type { User } from "@/lib/types";

type AdminRole = { key: string; name: string; description?: string | null; permissions: string[]; memberCount: number };
type Membership = { id: number; userId: number; role: string; roleName: string; active: boolean; permissions: string[]; updatedAt: string };
type AccessData = { roles: AdminRole[]; memberships: Membership[]; legacyAdmins: Array<{ id: number; name: string; email: string }> };

function accountLabel(status?: User["status"]) { return String(status || "active").replaceAll("_", " "); }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

export function AdminUserManagement({ initialUsers, releaseCounts, latestActivity, permissions, onUserChange }: { initialUsers: User[]; releaseCounts: Record<number, number>; latestActivity: Record<number, string>; permissions: AdminPermissionKey[]; onUserChange: (user: User) => void }) {
  const [users, setUsers] = useState(initialUsers);
  const [access, setAccess] = useState<AccessData>({ roles: [], memberships: [], legacyAdmins: [] });
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [selectedAdminRole, setSelectedAdminRole] = useState<Record<number, string>>({});
  const [reason, setReason] = useState<Record<number, string>>({});
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const canManageUsers = permissions.includes("users.manage");
  const canManageAdmins = permissions.includes("system.manage");
  const membershipByUser = useMemo(() => new Map(access.memberships.map((membership) => [membership.userId, membership])), [access.memberships]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/memberships", { cache: "no-store" }).then(async (response) => ({ response, body: await response.json().catch(() => ({})) })).then(({ response, body }) => {
      if (!active) return;
      if (!response.ok) setNotice({ kind: "error", text: body.error || "Administrator roles could not be loaded." });
      else setAccess(body);
    }).catch(() => active && setNotice({ kind: "error", text: "Administrator roles could not be loaded." })).finally(() => active && setLoadingAccess(false));
    return () => { active = false; };
  }, []);

  const visibleUsers = useMemo(() => users.filter((user) => {
    const membership = membershipByUser.get(user.id);
    const effectiveRole = membership?.active ? "admin" : user.role;
    const searchable = `${user.id} ${user.name} ${user.email} ${membership?.roleName || ""}`.toLowerCase();
    return (!query.trim() || searchable.includes(query.trim().toLowerCase())) && (roleFilter === "all" || effectiveRole === roleFilter || membership?.role === roleFilter) && (statusFilter === "all" || (user.status || "active") === statusFilter);
  }), [membershipByUser, query, roleFilter, statusFilter, users]);

  const counts = useMemo(() => ({ all: users.length, producers: users.filter((user) => user.role === "producer").length, admins: access.memberships.filter((item) => item.active).length, restricted: users.filter((user) => user.status && user.status !== "active").length }), [access.memberships, users]);
  function updateLocalUser(user: User) { setUsers((items) => items.map((item) => item.id === user.id ? { ...item, ...user } : item)); onUserChange(user); }
  async function request(url: string, init: RequestInit) { const response = await fetch(url, init); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "The update could not be completed."); return body; }

  async function assignWorkspace(user: User, role: "customer" | "producer") {
    if (!canManageUsers || pendingUserId) return;
    setPendingUserId(user.id); setNotice(null);
    try {
      const membership = membershipByUser.get(user.id);
      const body = membership?.active
        ? await request(`/api/admin/memberships/${user.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nextRole: role, reason: reason[user.id] || `Administrator access removed; ${role} workspace assigned.` }) })
        : await request(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      updateLocalUser({ ...user, ...body.user, role });
      if (membership) setAccess((current) => ({ ...current, memberships: current.memberships.map((item) => item.userId === user.id ? { ...item, active: false } : item) }));
      setNotice({ kind: "success", text: `${user.name} now has ${role === "producer" ? "Producer" : "Artist"} workspace access.` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Role update failed." }); }
    finally { setPendingUserId(null); }
  }

  async function assignAdmin(user: User) {
    if (!canManageAdmins || pendingUserId) return;
    const role = selectedAdminRole[user.id] || membershipByUser.get(user.id)?.role || access.roles.find((item) => item.key !== "super_admin")?.key || access.roles[0]?.key;
    const note = reason[user.id]?.trim();
    if (!role) return setNotice({ kind: "error", text: "No administrator roles are configured." });
    if (!note || note.length < 5) return setNotice({ kind: "error", text: "Add a short reason before changing administrator access." });
    setPendingUserId(user.id); setNotice(null);
    try {
      await request(`/api/admin/memberships/${user.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, active: true, reason: note }) });
      const roleRecord = access.roles.find((item) => item.key === role);
      setAccess((current) => ({ ...current, memberships: [...current.memberships.filter((item) => item.userId !== user.id), { id: membershipByUser.get(user.id)?.id || Date.now(), userId: user.id, role, roleName: roleRecord?.name || role, active: true, permissions: roleRecord?.permissions || [], updatedAt: new Date().toISOString() }] }));
      updateLocalUser({ ...user, role: "admin" });
      setNotice({ kind: "success", text: `${user.name} now has ${roleRecord?.name || role} access.` });
      setExpandedUserId(null);
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Administrator assignment failed." }); }
    finally { setPendingUserId(null); }
  }

  async function updateStatus(user: User, accountStatus: NonNullable<User["status"]>) {
    if (!canManageUsers || pendingUserId || accountStatus === user.status) return;
    const note = accountStatus === "active" ? "Review completed; account is in good standing." : reason[user.id]?.trim();
    if (!note || note.length < 3) return setNotice({ kind: "error", text: "Add a reason before restricting an account." });
    setPendingUserId(user.id); setNotice(null);
    try { const body = await request(`/api/admin/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountStatus, reason: note }) }); updateLocalUser({ ...user, ...body.user }); setNotice({ kind: "success", text: `${user.name}'s account is now ${accountLabel(accountStatus)}.` }); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Account update failed." }); }
    finally { setPendingUserId(null); }
  }

  return <section className="grid gap-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Total users", counts.all], ["Producers", counts.producers], ["Admin members", counts.admins], ["Restricted", counts.restricted]].map(([label, value]) => <div key={label} className="metric-card p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
    <div className="surface-card p-4 sm:p-5"><div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr),12rem,12rem,auto]"><label className="relative"><span className="sr-only">Search users</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted"/><input className="field w-full pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, ID, or admin role" /></label><select className="field" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter by access"><option value="all">All access</option><option value="customer">Artist</option><option value="producer">Producer</option><option value="admin">Any administrator</option>{access.roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select><select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by account status"><option value="all">All statuses</option><option value="active">Good standing</option><option value="paused">Paused</option><option value="under_review">Under review</option><option value="suspended">Suspended</option><option value="deletion_scheduled">Deletion scheduled</option><option value="banned">Banned</option></select><button type="button" className="btn-outline" onClick={() => { setQuery(""); setRoleFilter("all"); setStatusFilter("all"); }}>Reset</button></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted"><span>{visibleUsers.length} of {users.length} users</span><span>{loadingAccess ? "Loading administrator roles..." : `${access.roles.length} administrator roles available`}</span></div></div>
    {notice ? <div role="status" className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-sm ${notice.kind === "error" ? "border-red-400/30 bg-red-500/10" : "border-emerald-400/30 bg-emerald-500/10"}`}><span>{notice.text}</span><button type="button" className="rounded-lg p-1" aria-label="Dismiss message" onClick={() => setNotice(null)}><X className="h-4 w-4"/></button></div> : null}
    <div className="grid gap-3">{visibleUsers.map((user) => { const membership = membershipByUser.get(user.id); const pending = pendingUserId === user.id; const expanded = expandedUserId === user.id; const effectiveRole = membership?.active ? "admin" : user.role; return <article key={user.id} className="surface-card overflow-hidden"><div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(15rem,1fr),minmax(20rem,auto)] xl:items-center"><div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : initials(user.name)}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{user.name}</h3><span className="status-pill">{effectiveRole === "admin" ? membership?.roleName || "Administrator" : effectiveRole === "producer" ? "Producer" : "Artist"}</span><span className="status-pill">{accountLabel(user.status)}</span></div><p className="mt-1 break-all text-sm text-muted">{user.email}</p><p className="mt-2 text-xs text-muted">User #{user.id} · {releaseCounts[user.id] || 0} releases · {latestActivity[user.id] ? `Last activity ${new Date(latestActivity[user.id]).toLocaleDateString("en-IN")}` : "No recorded activity"}</p></div></div><div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end"><button type="button" disabled={!canManageUsers || pending} onClick={() => assignWorkspace(user, "customer")} className={effectiveRole === "customer" ? "btn-primary" : "btn-outline"}>{pending ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserRound className="h-4 w-4"/>} Artist</button><button type="button" disabled={!canManageUsers || pending} onClick={() => assignWorkspace(user, "producer")} className={effectiveRole === "producer" ? "btn-primary" : "btn-outline"}>{pending ? <Loader2 className="h-4 w-4 animate-spin"/> : <UsersRound className="h-4 w-4"/>} Producer</button><button type="button" disabled={!canManageAdmins || pending || loadingAccess} onClick={() => setExpandedUserId(expanded ? null : user.id)} className={effectiveRole === "admin" ? "btn-primary col-span-2" : "btn-outline col-span-2"}><ShieldCheck className="h-4 w-4"/> {effectiveRole === "admin" ? membership?.roleName || "Administrator" : "Grant admin access"}<ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}/></button></div></div>{expanded ? <div className="grid gap-4 border-t p-4 sm:p-5 lg:grid-cols-[minmax(14rem,.8fr),minmax(18rem,1.2fr)]" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div><label className="grid gap-2 text-sm font-semibold">Administrator role<select className="field" value={selectedAdminRole[user.id] || membership?.role || ""} onChange={(event) => setSelectedAdminRole((current) => ({ ...current, [user.id]: event.target.value }))}><option value="" disabled>Select a role</option>{access.roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></label>{(() => { const role = access.roles.find((item) => item.key === (selectedAdminRole[user.id] || membership?.role)); return role ? <div className="mt-3"><p className="text-sm text-muted">{role.description || `${role.permissions.length} explicit permissions`}</p><div className="mt-2 flex flex-wrap gap-1.5">{role.permissions.map((permission) => <span key={permission} className="rounded-full border px-2 py-1 text-[11px] text-muted" style={{ borderColor: "var(--border)" }}>{permission}</span>)}</div></div> : null; })()}</div><div className="grid content-start gap-3"><label className="grid gap-2 text-sm font-semibold">Reason for access change<textarea className="field min-h-24" value={reason[user.id] || ""} onChange={(event) => setReason((current) => ({ ...current, [user.id]: event.target.value }))} placeholder="Document why this access is needed"/></label><button type="button" disabled={!canManageAdmins || pending} onClick={() => assignAdmin(user)} className="btn-primary justify-center">{pending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>} Save administrator access</button><p className="text-xs text-muted">Administrator changes require a recent secure admin login and are written to the audit log.</p></div></div> : null}<div className="grid gap-3 border-t p-4 sm:p-5 md:grid-cols-[minmax(0,1fr),14rem]" style={{ borderColor: "var(--border)" }}><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Account controls</p><p className="mt-1 text-sm text-muted">{user.statusReason || "No restrictions or review flags."}</p><label className="mt-3 block max-w-xl text-xs text-muted">Reason for the next sensitive change<input className="field mt-1 w-full" value={reason[user.id] || ""} onChange={(event) => setReason((current) => ({ ...current, [user.id]: event.target.value }))} placeholder="Required for restrictions and admin changes"/></label></div><select className="field self-start" value={user.status || "active"} disabled={!canManageUsers || pending} onChange={(event) => updateStatus(user, event.target.value as NonNullable<User["status"]>)} aria-label={`Change account status for ${user.name}`}><option value="active">Good standing</option><option value="paused">Paused</option><option value="under_review">Under review</option><option value="suspended">Suspended</option><option value="deletion_scheduled">Schedule deletion</option><option value="banned">Banned</option></select></div><div className="border-t px-4 pb-4 sm:px-5 sm:pb-5" style={{ borderColor: "var(--border)" }}><AdminUserBenefits user={user} onCreditChange={(balance) => updateLocalUser({ ...user, referralCredits: balance })}/></div></article>; })}{!visibleUsers.length ? <div className="surface-card p-10 text-center text-sm text-muted">No users match these filters.</div> : null}</div>
  </section>;
}
