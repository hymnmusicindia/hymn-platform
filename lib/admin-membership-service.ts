import "server-only";
import { prisma } from "./prisma";
import { isConfiguredAdminEmail } from "./auth-role";
import { isAdminAuthority } from "./admin-role-policy";

export async function changeAdministrator(actorId: number, userId: number, input: { role?: string; active?: boolean; nextRole?: "customer" | "producer"; reason: string }) {
  if (!Number.isSafeInteger(userId) || userId < 1 || !actorId || actorId === userId) throw Error("An administrator cannot change their own access. Ask another founder or super administrator.");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(187462902)`;
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    const authority = await tx.adminMembership.findUnique({ where: { userId: actorId }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
    const explicitOwner = !authority && actor && isConfiguredAdminEmail(actor.email);
    if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN" || !explicitOwner && (!authority?.active || authority.revokedAt || !isAdminAuthority(authority.role.key) || !authority.role.permissions.some(p => p.permission.key === "system.manage"))) throw Error("Active founder or super-administrator authority is required.");
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "ACTIVE" && input.active !== false) throw Error("Choose an active account for access grants. Inactive memberships may still be revoked.");
    const previous = await tx.adminMembership.findUnique({ where: { userId }, include: { role: true } });
    if (input.nextRole && !previous) throw Error("Administrator membership was not found.");
    const role = input.nextRole ? previous!.role : await tx.adminRole.findUnique({ where: { key: input.role! } });
    if (!role) throw Error("Role is not configured.");
    const active = input.nextRole ? false : input.active ?? true;
    const membership = await tx.adminMembership.upsert({ where: { userId }, create: { userId, roleId: role.id, active, createdBy: actorId, revokedAt: active ? null : new Date() }, update: { roleId: role.id, active, revokedAt: active ? null : new Date() } });
    if (active || input.nextRole) await tx.user.update({ where: { id: userId }, data: { role: input.nextRole === "producer" ? "PRODUCER" : input.nextRole === "customer" ? "CUSTOMER" : "ADMIN" } });
    if (input.nextRole === "producer") await tx.producerProfile.upsert({ where: { userId }, create: { userId, slug: `${user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "producer"}-${userId}`, displayName: user.name, bio: "", specialty: "Music producer", status: "pending_setup", active: true }, update: { active: true, status: "pending_setup" } });
    if (input.nextRole === "customer") await tx.producerProfile.updateMany({ where: { userId }, data: { active: false, status: "disabled" } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId, actorRole: authority?.role.key || "owner", action: input.nextRole ? "admin.membership.revoked" : "admin.membership.changed", entity: "admin_membership", entityId: String(membership.id), reason: input.reason, riskLevel: "high", previousValue: previous ? { role: previous.role.key, active: previous.active } : undefined, newValue: { role: role.key, active, nextRole: input.nextRole || null } } });
    return { userId, role: role.key, active };
  }, { timeout: 30000, maxWait: 10000 });
}
