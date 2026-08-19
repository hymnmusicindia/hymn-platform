import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listAuditEvents } from "@/lib/audit-log";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if ("error" in admin) return admin.error;
  const query = new URL(request.url).searchParams;
  return NextResponse.json({ logs: await listAuditEvents({ entityType: query.get("entityType") ?? undefined, entityId: query.get("entityId") ?? undefined, limit: Number(query.get("limit") ?? 100) }) });
}
