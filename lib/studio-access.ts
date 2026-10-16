import { requireUser } from "@/lib/access";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function assertStudioActiveUser(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user || user.status !== "ACTIVE") throw new Error("An active account is required for Studio access.");
}

export async function requireStudioUser() {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  if (auth.user.status !== "active") return { error: NextResponse.json({ error: "An active account is required for Studio access." }, { status: 403 }) };
  return auth;
}
