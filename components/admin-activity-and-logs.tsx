"use client";

import { useEffect, useRef, useState } from "react";

type Session = { sessionId: string; name: string; email: string; active: boolean; lastSeenAt: string; page: string; events: Array<{ id: number; action: string; page: string; createdAt: string }> };

export function AdminActivityAndLogs({ currentPage, visible }: { currentPage: string; visible: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const previousPage = useRef("");
  const pageRef = useRef(currentPage);

  async function send(kind: "heartbeat" | "navigation") {
    await fetch("/api/admin/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, page: pageRef.current }), keepalive: true }).catch(() => null);
  }
  async function load() {
    const response = await fetch("/api/admin/activity", { cache: "no-store" });
    if (response.ok) setSessions((await response.json()).sessions || []);
  }

  useEffect(() => {
    send("heartbeat");
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") send("heartbeat").then(() => { if (visible) return load(); }); }, 45_000);
    return () => window.clearInterval(timer);
  }, [visible]);

  useEffect(() => {
    pageRef.current = currentPage;
    if (previousPage.current && previousPage.current !== currentPage) send("navigation");
    previousPage.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (!visible) return;
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [visible]);

  if (!visible) return null;
  return <section className="grid gap-5">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Platform</p><h2 className="mt-2 text-3xl font-semibold">Activity and Logs</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Live administrator presence and session activity from HYMN’s audit trail.</p></div>
    <div className="grid gap-3">{sessions.map((session) => <article key={session.sessionId} className="border-b py-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: session.active ? "var(--success)" : "var(--text-soft)", boxShadow: session.active ? "0 0 14px color-mix(in srgb, var(--success) 65%, transparent)" : "none" }} /><div><p className="font-semibold">{session.name}</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{session.email || "Local administrator"} · {session.active ? `Active in ${session.page.replace(/-/g, " ")}` : `Last active ${new Date(session.lastSeenAt).toLocaleString("en-IN")}`}</p></div></div><span className="text-xs font-semibold" style={{ color: session.active ? "var(--success)" : "var(--text-soft)" }}>{session.active ? "ACTIVE" : "OFFLINE"}</span></div>
      <details className="mt-4 pl-5"><summary className="cursor-pointer text-sm font-medium">Session activity ({session.events.length})</summary><ol className="mt-3 grid gap-2">{session.events.map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 text-xs" style={{ color: "var(--text-muted)" }}><span>{event.action.endsWith("navigation") ? "Opened" : "Active on"} <strong style={{ color: "var(--text)" }}>{event.page.replace(/-/g, " ")}</strong></span><time>{new Date(event.createdAt).toLocaleString("en-IN")}</time></li>)}</ol></details>
    </article>)}{sessions.length === 0 ? <p className="py-8 text-sm" style={{ color: "var(--text-muted)" }}>No administrator sessions have reported activity yet.</p> : null}</div>
  </section>;
}
