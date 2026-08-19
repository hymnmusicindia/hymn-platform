import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listAuditEvents } from "@/lib/audit-log";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(); if ("error" in admin) return admin.error;
  return NextResponse.json({ logs: await listAuditEvents({ entityType: "release", entityId: (await params).id }) });
}
