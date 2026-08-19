import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listAuditEvents } from "@/lib/audit-log";

export async function GET(request: Request) {
  const admin = await requireAdminPermission("audit.read");
  if ("error" in admin) return admin.error;
  const query = new URL(request.url).searchParams;
  const logs = await listAuditEvents({ entityType: query.get("entityType") ?? undefined, entityId: query.get("entityId") ?? undefined, actorId: query.get("actorId") ? Number(query.get("actorId")) : undefined, action: query.get("action") ?? undefined, riskLevel: query.get("riskLevel") ?? undefined, requestId: query.get("requestId") ?? undefined, cursor: query.get("cursor") ? Number(query.get("cursor")) : undefined, limit: Number(query.get("limit") ?? 100) });
  if (query.get("format") === "csv") {
    const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [["id", "timestamp", "actor_type", "actor_id", "actor_role", "action", "entity", "entity_id", "reason", "request_id", "risk_level"].map(cell).join(","), ...logs.map(log => [log.id, new Date(log.createdAt).toISOString(), log.actorType, log.actorId, log.actorRole, log.action, log.entity, log.entityId, log.reason, log.requestId, log.riskLevel].map(cell).join(","))].join("\r\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=HYMN-audit-export.csv", "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json({ logs, page: { nextCursor: logs.length ? logs.at(-1)?.id ?? null : null, limit: Math.max(1, Math.min(Number(query.get("limit") ?? 100), 250)) } });
}
// vercel trigger 9
