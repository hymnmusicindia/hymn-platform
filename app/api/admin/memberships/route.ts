import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const [roles, memberships, admins] = await Promise.all([
    prisma.adminRole.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { memberships: true } } }, orderBy: { name: "asc" } }),
    prisma.adminMembership.findMany({ include: { user: { select: { id: true, name: true, email: true } }, role: { include: { permissions: { include: { permission: true } } } } }, orderBy: { updatedAt: "desc" } }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const memberIds = new Set(memberships.map((item) => item.userId));
  return NextResponse.json({
    roles: roles.map((role) => ({ key: role.key, name: role.name, description: role.description, permissions: role.permissions.map((item) => item.permission.key).sort(), memberCount: role._count.memberships })),
    memberships: memberships.map((item) => ({ id: item.id, userId: item.userId, user: item.user, role: item.role.key, roleName: item.role.name, active: item.active, permissions: item.role.permissions.map((row) => row.permission.key).sort(), updatedAt: item.updatedAt.toISOString() })),
    legacyAdmins: admins.filter((user) => !memberIds.has(user.id)),
  });
}
