import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { AdminSessionPayload, SessionPayload } from "@/lib/types";
import { getAdminSessionSecret, getUserSessionSecret } from "@/lib/env";

const USER_SESSION_COOKIE = "hymn_session";
const ADMIN_SESSION_COOKIE = "hymn_admin_session";

function usesPostgresPrisma() {
  return /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL?.trim() ?? "");
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function getCookieStore() {
  const { cookies } = await import("next/headers");
  return cookies();
}

export async function createSession(payload: SessionPayload) {
  const sessionId = randomUUID();
  const token = jwt.sign({ ...payload, sid: sessionId }, getUserSessionSecret(), { expiresIn: "7d" });
  const store = await getCookieStore();
  store.set(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });

  if (usesPostgresPrisma()) {
    await prisma.session.create({
      data: {
        userId: payload.sub,
        tokenHash: hashToken(sessionId),
        expiresAt: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000)
      }
    });
  }
}

export async function getSession() {
  const store = await getCookieStore();
  const value = store.get(USER_SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const decoded = jwt.verify(value, getUserSessionSecret());
    if (typeof decoded === "string") return null;
    if (!("sub" in decoded) || !("email" in decoded) || !("name" in decoded) || !("role" in decoded)) return null;
    if (usesPostgresPrisma() && "sid" in decoded && typeof decoded.sid === "string") {
      const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(decoded.sid) } });
      if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
    }
    return decoded as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const store = await getCookieStore();
  const value = store.get(USER_SESSION_COOKIE)?.value;
  if (value && usesPostgresPrisma()) {
    try {
      const decoded = jwt.verify(value, getUserSessionSecret());
      if (typeof decoded !== "string" && "sid" in decoded && typeof decoded.sid === "string") {
        await prisma.session.updateMany({
          where: { tokenHash: hashToken(decoded.sid), revokedAt: null },
          data: { revokedAt: new Date() }
        });
      }
    } catch {
      // The browser cookie is still cleared even when the token is invalid.
    }
  }
  store.delete(USER_SESSION_COOKIE);
}

export async function createAdminSession() {
  const token = jwt.sign({ username: "admin", role: "admin" } satisfies AdminSessionPayload, getAdminSessionSecret(), { expiresIn: "1d" });
  const store = await getCookieStore();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24
  });
}

export async function getAdminSession() {
  const store = await getCookieStore();
  const value = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    const decoded = jwt.verify(value, getAdminSessionSecret());
    if (typeof decoded === "string") return null;
    if (decoded.role !== "admin" || decoded.username !== "admin") return null;
    return decoded as AdminSessionPayload;
  } catch {
    return null;
  }
}

export async function clearAdminSession() {
  const store = await getCookieStore();
  store.delete(ADMIN_SESSION_COOKIE);
}
// vercel trigger 5
