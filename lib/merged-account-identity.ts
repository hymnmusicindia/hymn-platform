import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

export function mergedIdentityHash(value: string) { return createHash("sha256").update(value).digest("hex"); }

// Only hashes are retained in the immutable merge event, not the retired email
// or Google credential. Prevent a later sign-in/signup from recreating that account.
export async function assertNotMergedIdentity(input: { email: string; googleId?: string }, db: Pick<PrismaClient, "auditLog"> = prisma) {
  const hashes = [{ metadata: { path: ["sourceEmailHash"], equals: mergedIdentityHash(input.email.trim().toLowerCase()) } }, ...(input.googleId ? [{ metadata: { path: ["sourceGoogleIdHash"], equals: mergedIdentityHash(input.googleId) } }] : [])];
  const merged = await db.auditLog.findFirst({ where: { action: "ACCOUNT_MERGED", OR: hashes }, select: { id: true } });
  if (merged) throw new Error("This login is no longer available. Sign in with your updated account or contact HYMN support.");
}

export async function assertNotMergedAccount(userId: number) {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { statusReason: true } });
  if (account?.statusReason === "ACCOUNT_MERGED") throw new Error("This account has been merged. Sign in with your updated account.");
}
