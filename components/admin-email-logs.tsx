"use client";
import { useState } from "react";

type EmailLog = { id: number; toEmail: string; subject: string; template: string; eventKey: string; provider: string; status: string; entityType?: string | null; entityId?: string | null; errorMessage?: string | null; createdAt: string; sentAt?: string | null };
export function AdminEmailLogs({ initialLogs, configured }: { initialLogs: EmailLog[]; configured: boolean }) {
  const [logs, setLogs] = useState(initialLogs);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const visible = status ? logs.filter((log) => log.status === status) : logs;
  async function retry(id: number) {
    setBusy(id);
    const response = await fetch(`/api/admin/email-logs/${id}/retry`, { method: "POST" });
    const result = await response.json();
    if (response.ok) setLogs((current) => current.map((log) => log.id === id ? { ...log, status: result.status === "sent" ? "retried" : log.status } : log));
    setBusy(null);
  }
  return <div className="grid gap-5">
    {!configured ? <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200"><strong>Transactional email is not configured.</strong> Users will still receive in-app notifications.<p className="mt-2 text-amber-100/75">For best deliverability, verify your sending domain in Resend and configure DNS records. Until then, emails may be limited by Resend test sender restrictions.</p></div> : null}
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold">Email logs</h2><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Transactional delivery attempts and provider responses.</p></div><label className="grid gap-1 text-xs" style={{ color: "var(--text-muted)" }}>Status<select className="field min-w-40" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["queued","sent","failed","skipped","duplicate_skipped"].map((value) => <option key={value}>{value}</option>)}</select></label></div>
    <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--border)" }}><table className="w-full min-w-[900px] text-left text-sm"><thead style={{ background: "var(--bg-soft)", color: "var(--text-muted)" }}><tr>{["Recipient","Subject / template","Status","Entity","Created","Error","Action"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y" style={{ borderColor: "var(--border)" }}>{visible.map((log) => <tr key={log.id}><td className="px-4 py-3">{log.toEmail}</td><td className="px-4 py-3"><p className="font-medium">{log.subject}</p><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>{log.template}<br />{log.eventKey}</p></td><td className="px-4 py-3"><span className="chip">{log.status}</span></td><td className="px-4 py-3">{log.entityType && log.entityId ? `${log.entityType} #${log.entityId}` : "—"}</td><td className="px-4 py-3">{new Date(log.createdAt).toLocaleString("en-IN")}</td><td className="max-w-56 px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{log.errorMessage || "—"}</td><td className="px-4 py-3">{log.status === "failed" ? <button className="btn-outline" disabled={busy === log.id} onClick={() => retry(log.id)}>{busy === log.id ? "Retrying…" : "Retry"}</button> : "—"}</td></tr>)}</tbody></table>{visible.length === 0 ? <p className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>No email attempts match this filter.</p> : null}</div>
  </div>;
}
// vercel trigger 6
