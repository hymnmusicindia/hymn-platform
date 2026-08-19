import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRecentAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";

const schema = z.object({ role: z.enum(["super_admin", "qc_reviewer", "distribution_operator", "finance_operator", "payout_approver", "support_agent", "rights_operator", "read_only_auditor"]), active: z.boolean().default(true), reason: z.string().trim().min(5).max(1000) });
export async function PUT(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await requireRecentAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  try {
    const actorId = "sub" in admin ? Number(admin.sub) : 0; const userId = Number((await context.params).userId); const body = schema.parse(await request.json());
    if (!actorId || !userId) return NextResponse.json({ error: "Database-backed identities are required." }, { status: 400 });
    const role = await prisma.adminRole.findUnique({ where: { key: body.role } }); if (!role) return NextResponse.json({ error: "Role is not configured." }, { status: 409 });
    const existing = await prisma.adminMembership.findUnique({ where: { userId }, include: { role: true } });
    const membership = await prisma.adminMembership.upsert({ where: { userId }, create: { userId, roleId: role.id, active: body.active, createdBy: actorId, revokedAt: body.active ? null : new Date() }, update: { roleId: role.id, active: body.active, revokedAt: body.active ? null : new Date() }, include: { role: true } });
    await logAuditEvent({ actorType: "admin", actorId, entityType: "admin_membership", entityId: membership.id, action: "admin.membership.changed", oldValue: existing ? { role: existing.role.key, active: existing.active } : null, newValue: { role: role.key, active: body.active }, metadata: { reason: body.reason, riskLevel: "high" } });
    return NextResponse.json({ membership: { userId, role: membership.role.key, active: membership.active } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Membership update failed." }, { status: 400 }); }
}
// vercel trigger 9
