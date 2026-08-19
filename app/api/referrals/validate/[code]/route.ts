import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { normalizeReferralCode } from "@/lib/referrals";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const limit = await consumeRateLimit({ scope: "referral.validate", identity: requestIdentity(request), limit: 30, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ valid: false, error: "Too many attempts. Please wait and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const code = normalizeReferralCode((await params).code);
  if (!code) return NextResponse.json({ valid: false }, { status: 400 });
  const owner = await prisma.user.findFirst({ where: { referralCode: { equals: code, mode: "insensitive" }, status: "ACTIVE" }, select: { referralCode: true } });
  return NextResponse.json(owner ? { valid: true, referralCode: owner.referralCode } : { valid: false }, { status: owner ? 200 : 404 });
}
