import { NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/session";
import { findUserById } from "@/lib/db";
import { SessionPayload, User, UserRole } from "@/lib/types";
import { destinationForRole } from "@/lib/routes";
import { prisma } from "@/lib/prisma";

export { destinationForRole };

export async function requireSession() {
  return getSession();
}

export async function requireUser() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };

  const user = await findUserById(session.sub);
  if (!user) return { error: NextResponse.json({ error: "User not found." }, { status: 404 }) };
  return { session, user } as { session: SessionPayload; user: User };
}

export async function requireRole(roles: UserRole[]) {
  const result = await requireUser();
  if ("error" in result) return result;
  if (!roles.includes(result.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return result;
}

export async function requireAdminIdentity() {
  const userResult = await requireRole(["admin"]);
  if (!("error" in userResult)) return userResult.session;

  const session = await getAdminSession();
  if (!session) return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  return session;
}

export type AdminPermissionKey = "releases.read" | "releases.review" | "releases.override" | "distribution.submit" | "distribution.retry" | "distribution.confirm_status" | "updates.review" | "takedowns.review" | "royalties.import" | "royalties.reconcile" | "wallets.adjust" | "payouts.review" | "payouts.approve" | "payouts.mark_paid" | "kyc.review" | "fraud.read" | "fraud.manage" | "fraud.rules" | "users.read" | "users.manage" | "services.manage" | "audit.read" | "system.manage";
export const ALL_ADMIN_PERMISSIONS: AdminPermissionKey[] = ["releases.read", "releases.review", "releases.override", "distribution.submit", "distribution.retry", "distribution.confirm_status", "updates.review", "takedowns.review", "royalties.import", "royalties.reconcile", "wallets.adjust", "payouts.review", "payouts.approve", "payouts.mark_paid", "kyc.review", "fraud.read", "fraud.manage", "fraud.rules", "users.read", "users.manage", "services.manage", "audit.read", "system.manage"];

export async function getAdminAccessForPage() {
  const admin = await requireAdminIdentity();
  if ("error" in admin) return null;
  if (!("sub" in admin)) return { role: "super_admin", permissions: ALL_ADMIN_PERMISSIONS };
  try {
    const membership = await prisma.adminMembership.findFirst({ where: { userId: Number(admin.sub), active: true, revokedAt: null }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
    if (!membership) return { role: "admin", permissions: ALL_ADMIN_PERMISSIONS };
    return { role: membership.role.key, permissions: membership.role.permissions.map((row) => row.permission.key as AdminPermissionKey) };
  } catch {
    return { role: "admin", permissions: ALL_ADMIN_PERMISSIONS };
  }
}

export async function requireAdminPermission(permission: AdminPermissionKey) {
  const admin = await requireAdminIdentity();
  if ("error" in admin) return admin;
  if (!("sub" in admin)) {
    return Object.assign(admin, { adminRole: "super_admin", permissions: [permission] });
  }
  try {
    const membership = await prisma.adminMembership.findFirst({ where: { userId: Number(admin.sub), active: true, revokedAt: null }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
    if (!membership) {
      return Object.assign(admin, { adminRole: "admin", permissions: [permission] });
    }
    if (!membership.role.permissions.some(row => row.permission.key === permission)) {
      return { error: NextResponse.json({ error: "Forbidden: missing administrator permission." }, { status: 403 }) };
    }
    return Object.assign(admin, { adminRole: membership.role.key, permissions: membership.role.permissions.map(row => row.permission.key) });
  } catch {
    return Object.assign(admin, { adminRole: "admin", permissions: [permission] });
  }
}

export function isRecentAdminAuthentication(issuedAt: number | undefined, nowSeconds = Math.floor(Date.now() / 1000), maximumAgeSeconds = 15 * 60) {
  return typeof issuedAt === "number" && issuedAt > 0 && nowSeconds >= issuedAt && nowSeconds - issuedAt <= maximumAgeSeconds;
}

export async function requireRecentAdminPermission(permission: AdminPermissionKey, maximumAgeSeconds = 15 * 60) {
  const admin = await requireAdminPermission(permission);
  if ("error" in admin) return admin;
  const issuedAt = "iat" in admin && typeof admin.iat === "number" ? admin.iat : undefined;
  if (!isRecentAdminAuthentication(issuedAt, Math.floor(Date.now() / 1000), maximumAgeSeconds)) return { error: NextResponse.json({ error: "Recent administrator authentication is required for this sensitive action." }, { status: 401 }) };
  return admin;
}

export async function getCurrentUserForPage() {
  const session = await getSession();
  if (!session) return null;
  return findUserById(session.sub);
}

export async function getAdminSessionForPage() {
  return getAdminSession();
}
// vercel trigger 9

// vercel trigger 11

// vercel trigger 14
