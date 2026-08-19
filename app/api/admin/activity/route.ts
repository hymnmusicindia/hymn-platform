import { NextResponse } from "next/server";
import { requireAdminIdentity, requireAdminPermission } from "@/lib/access";
import { getAdminSession, getSession } from "@/lib/session";
import { findUserById } from "@/lib/db";
import { listAuditEvents, logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

async function identity() {
  const userSession = await getSession();
  if (userSession?.role === "admin") {
    const user = await findUserById(userSession.sub);
    return { actorId: userSession.sub, name: user?.name || userSession.name, email: user?.email || userSession.email, sessionId: (userSession as typeof userSession & { sid?: string }).sid || `admin-user-${userSession.sub}` };
  }
  const local = await getAdminSession();
  return { actorId: null, name: "HYMN Admin", email: "admin@local.hymn", sessionId: local?.sid || "local-admin-session" };
}

export async function POST(request: Request) {
  const access = await requireAdminIdentity();
  if ("error" in access) return access.error;
  const admin = await identity();
  const body = await request.json().catch(() => ({}));
  const page = typeof body.page === "string" ? body.page.slice(0, 80) : "overview";
  const kind = body.kind === "navigation" ? "navigation" : "heartbeat";
  await logAuditEvent({ actorType: "admin", actorId: admin.actorId, actorRole: "admin", entityType: "admin_session", entityId: admin.sessionId, sessionId: admin.sessionId, action: `admin.session.${kind}`, riskLevel: "low", metadata: { name: admin.name, email: admin.email, page } });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const access = await requireAdminPermission("audit.read");
  if ("error" in access) return access.error;
  const rows = await listAuditEvents({ entityType: "admin_session", limit: 250 });
  const cutoff = Date.now() - 120_000;
  const sessions = new Map<string, { sessionId: string; name: string; email: string; active: boolean; lastSeenAt: string; page: string; events: Array<{ id: number; action: string; page: string; createdAt: string }> }>();
  for (const row of rows as any[]) {
    const sessionId = row.sessionId || row.entityId;
    if (!sessionId) continue;
    const metadata = (row.metadata || {}) as Record<string, string>;
    const createdAt = new Date(row.createdAt).toISOString();
    const current = sessions.get(sessionId) || { sessionId, name: metadata.name || "Administrator", email: metadata.email || "", active: false, lastSeenAt: createdAt, page: metadata.page || "overview", events: [] as Array<{ id: number; action: string; page: string; createdAt: string }> };
    current.events.push({ id: row.id, action: row.action, page: metadata.page || "overview", createdAt });
    sessions.set(sessionId, current);
  }
  const result = Array.from(sessions.values()).map((session) => ({ ...session, active: new Date(session.lastSeenAt).getTime() >= cutoff, events: session.events.slice(0, 40) })).sort((a, b) => Number(b.active) - Number(a.active) || b.lastSeenAt.localeCompare(a.lastSeenAt));
  return NextResponse.json({ sessions: result }, { headers: { "Cache-Control": "private, no-store" } });
}
