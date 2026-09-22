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
    if (actorId === userId) return NextResponse.json({ error: "Ask another super administrator to change your administrator role." }, { status: 409 });
    const role = await prisma.adminRole.findUnique({ where: { key: body.role } }); if (!role) return NextResponse.json({ error: "Role is not configured." }, { status: 409 });
    const existing = await prisma.adminMembership.findUnique({ where: { userId }, include: { role: true } });
    const membership = await prisma.adminMembership.upsert({ where: { userId }, create: { userId, roleId: role.id, active: body.active, createdBy: actorId, revokedAt: body.active ? null : new Date() }, update: { roleId: role.id, active: body.active, revokedAt: body.active ? null : new Date() }, include: { role: true } });
    if (body.active) await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN" } });
    await logAuditEvent({ actorType: "admin", actorId, entityType: "admin_membership", entityId: membership.id, action: "admin.membership.changed", oldValue: existing ? { role: existing.role.key, active: existing.active } : null, newValue: { role: role.key, active: body.active }, metadata: { reason: body.reason, riskLevel: "high" } });
    return NextResponse.json({ membership: { userId, role: membership.role.key, active: membership.active } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Membership update failed." }, { status: 400 }); }
}

const revokeSchema = z.object({ nextRole: z.enum(["customer", "producer"]), reason: z.string().trim().min(5).max(1000) });
export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await requireRecentAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  try {
    const actorId = "sub" in admin ? Number(admin.sub) : 0; const userId = Number((await context.params).userId); const body = revokeSchema.parse(await request.json());
    if (!actorId || !userId) return NextResponse.json({ error: "Database-backed identities are required." }, { status: 400 });
    if (actorId === userId) return NextResponse.json({ error: "You cannot remove your own administrator access." }, { status: 409 });
    const existing = await prisma.adminMembership.findUnique({ where: { userId }, include: { role: true, user: true } });
    if (!existing) return NextResponse.json({ error: "Administrator membership was not found." }, { status: 404 });
    const result = await prisma.$transaction(async (tx) => {
      const membership = await tx.adminMembership.update({ where: { userId }, data: { active: false, revokedAt: new Date() } });
      const user = await tx.user.update({ where: { id: userId }, data: { role: body.nextRole.toUpperCase() as "CUSTOMER" | "PRODUCER" } });
      if (body.nextRole === "producer") await tx.producerProfile.upsert({ where: { userId }, create: { userId, slug: `${user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "producer"}-${userId}`, displayName: user.name, bio: "", specialty: "Music producer", status: "pending_setup", active: true }, update: { active: true, status: "pending_setup" } });
      else await tx.producerProfile.updateMany({ where: { userId }, data: { active: false, status: "disabled" } });
      return { membership, user };
    });
    await logAuditEvent({ actorType: "admin", actorId, entityType: "admin_membership", entityId: result.membership.id, action: "admin.membership.revoked", oldValue: { role: existing.role.key, active: existing.active }, newValue: { active: false, nextRole: body.nextRole }, metadata: { reason: body.reason, riskLevel: "high" } });
    return NextResponse.json({ membership: { userId, role: existing.role.key, active: false }, user: { ...result.user, role: result.user.role.toLowerCase(), avatarUrl: result.user.avatar, createdAt: result.user.createdAt.toISOString() } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Membership revocation failed." }, { status: 400 }); }
}
// vercel trigger 9
