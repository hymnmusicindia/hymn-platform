import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";

const updateSchema = z.object({ id: z.number().int().positive(), resolution: z.enum(["keep_hymn", "accept_direnote", "resolved"]), note: z.string().trim().max(1000).optional() });

export async function GET(request: Request) {
  const admin = await requireAdminPermission("releases.read"); if ("error" in admin) return admin.error;
  const status = new URL(request.url).searchParams.get("status");
  const rows = await prisma.direNoteReconciliationDiscrepancy.findMany({ where: status ? { status } : undefined, include: { release: { select: { id: true, title: true, artistName: true } }, track: { select: { id: true, title: true } } }, orderBy: { detectedAt: "desc" }, take: 250 });
  return NextResponse.json({ discrepancies: rows });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid reconciliation resolution." }, { status: 400 });
  const actorId = "sub" in admin ? Number(admin.sub) : null;
  const item = await prisma.direNoteReconciliationDiscrepancy.update({ where: { id: parsed.data.id }, data: { status: "resolved", resolution: parsed.data.resolution, resolvedAt: new Date(), resolvedById: actorId } });
  await logAuditEvent({ actorType: "admin", actorId, entityType: "direnote_reconciliation_discrepancy", entityId: item.id, action: "direnote.reconciliation.resolved", newValue: { resolution: parsed.data.resolution, note: parsed.data.note ?? null } });
  return NextResponse.json({ discrepancy: item });
}
