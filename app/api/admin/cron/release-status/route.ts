import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { redactDireNoteDiagnostic } from "@/lib/direnote";
import { GET as runSync } from "@/app/api/cron/direnote-release-sync/route";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  if (!["super_admin", "owner"].includes(admin.adminRole)) return NextResponse.json({ error: "Only a super administrator can run scheduled jobs manually." }, { status: 403 });
  const allowedOrigins = new Set([new URL(request.url).origin, getPublicAppUrl(request.url)]);
  if (!allowedOrigins.has(request.headers.get("origin") ?? "")) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "The release-status CRON is not configured." }, { status: 503 });
  const actorId = "sub" in admin ? Number(admin.sub) : null;
  // Record authorization before starting any provider or release work.
  const audit = await prisma.auditLog.create({ data: { actorId, actorType: "admin", action: "MANUAL_RELEASE_STATUS_CRON", entity: "cron", entityId: "direnote-release-sync", metadata: { state: "requested", role: admin.adminRole } } });
  try {
    const response = await runSync(new Request(new URL("/api/cron/direnote-release-sync", request.url), { headers: { authorization: `Bearer ${secret}` } }));
    const result = redactDireNoteDiagnostic(await response.json());
    // Audit rows are immutable. Append a linked outcome without modifying the request.
    const recorded = await prisma.auditLog.create({ data: { actorId, actorType: "admin", action: "MANUAL_RELEASE_STATUS_CRON_FINISHED", entity: "cron", entityId: "direnote-release-sync", metadata: { requestAuditId: audit.id, state: "finished", role: admin.adminRole, httpStatus: response.status, result } as never } }).then(() => true).catch(() => {
      console.error("Manual release-status CRON finished but its outcome audit could not be appended", { requestAuditId: audit.id });
      return false;
    });
    return NextResponse.json(result, { status: response.status, headers: { "Cache-Control": "no-store", "X-HYMN-Audit-Status": recorded ? "recorded" : "failed" } });
  } catch (error) {
    const message = String(redactDireNoteDiagnostic(error instanceof Error ? error.message : "Release-status sync failed."));
    await prisma.auditLog.create({ data: { actorId, actorType: "admin", action: "MANUAL_RELEASE_STATUS_CRON_FAILED", entity: "cron", entityId: "direnote-release-sync", metadata: { requestAuditId: audit.id, state: "failed", role: admin.adminRole, error: message } } }).catch(() => {
      console.error("Manual release-status CRON failure audit could not be appended", { requestAuditId: audit.id });
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
