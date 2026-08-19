import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { listAuditEvents } from "@/lib/audit-log";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("audit.read"); if ("error" in admin) return admin.error;
  return NextResponse.json({ logs: await listAuditEvents({ entityType: "payout_request", entityId: (await params).id }) });
}
// vercel trigger 9
