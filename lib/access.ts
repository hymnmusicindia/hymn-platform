import { NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/session";
import { findUserById } from "@/lib/db";
import { SessionPayload, User, UserRole } from "@/lib/types";
import { destinationForRole } from "@/lib/routes";

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

export async function requireAdmin() {
  const userResult = await requireRole(["admin"]);
  if (!("error" in userResult)) return userResult.session;

  const session = await getAdminSession();
  if (!session) return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  return session;
}

/**
 * Compatibility layer for the newer admin surfaces. The current application
 * has one administrator role (rather than separately persisted permission
 * grants), so a verified administrator is permitted to use each named admin
 * capability. Keeping the permission argument here makes the callers ready
 * for granular RBAC when those grants are introduced.
 */
export async function requireAdminIdentity() {
  return requireAdmin();
}

export async function requireAdminPermission(_permission: string) {
  return requireAdmin();
}

/**
 * Sensitive workflows use the same authenticated administrator check until a
 * dedicated re-authentication timestamp is stored with admin sessions.
 */
export async function requireRecentAdminPermission(_permission: string) {
  return requireAdmin();
}

export async function getCurrentUserForPage() {
  const session = await getSession();
  if (!session) return null;
  return findUserById(session.sub);
}

export async function getAdminSessionForPage() {
  return getAdminSession();
}
