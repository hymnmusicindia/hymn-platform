import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const memory = new Map<string, { count: number; expiresAt: number }>();
function keyFor(scope: string, identity: string) { return createHash("sha256").update(`${scope}:${identity}`).digest("hex"); }
export function requestIdentity(request: Request, fallback = "anonymous") { return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || fallback; }

export async function consumeRateLimit(input: { scope: string; identity: string; limit: number; windowSeconds: number }) {
  const keyHash = keyFor(input.scope, input.identity); const now = new Date(); const expiresAt = new Date(now.getTime() + input.windowSeconds * 1000);
  if (!/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL ?? "")) {
    const row = memory.get(keyHash); const next = !row || row.expiresAt <= now.getTime() ? { count: 1, expiresAt: expiresAt.getTime() } : { ...row, count: row.count + 1 }; memory.set(keyHash, next); return { allowed: next.count <= input.limit, remaining: Math.max(0, input.limit - next.count), retryAfterSeconds: Math.max(1, Math.ceil((next.expiresAt - now.getTime()) / 1000)) };
  }
  return prisma.$transaction(async tx => {
    await tx.securityRateLimit.upsert({ where: { keyHash }, create: { keyHash, scope: input.scope, count: 0, windowStart: now, expiresAt }, update: {} });
    await tx.$queryRaw`SELECT key_hash FROM security_rate_limits WHERE key_hash = ${keyHash} FOR UPDATE`;
    const current = await tx.securityRateLimit.findUniqueOrThrow({ where: { keyHash } });
    const reset = current.expiresAt <= now; const count = reset ? 1 : current.count + 1; const effectiveExpiry = reset ? expiresAt : current.expiresAt;
    await tx.securityRateLimit.update({ where: { keyHash }, data: { count, ...(reset ? { windowStart: now, expiresAt } : {}) } });
    return { allowed: count <= input.limit, remaining: Math.max(0, input.limit - count), retryAfterSeconds: Math.max(1, Math.ceil((effectiveExpiry.getTime() - now.getTime()) / 1000)) };
  });
}
// vercel trigger 9
