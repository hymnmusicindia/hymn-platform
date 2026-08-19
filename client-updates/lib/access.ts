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

export async function getCurrentUserForPage() {
  const session = await getSession();
  if (!session) return null;
  return findUserById(session.sub);
}

export async function getAdminSessionForPage() {
  return getAdminSession();
}
