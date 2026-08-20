import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { registerReferralForNewUser } from "@/lib/referrals";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in before applying a referral code." }, { status: 401 });
  const limit = await consumeRateLimit({ scope: "referral.apply", identity: `${session.sub}:${requestIdentity(request)}`, limit: 10, windowSeconds: 300 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  try {
    const body = await request.json() as { referralCode?: string };
    const referral = await prisma.$transaction(async tx => {
      const account = await tx.user.findUnique({ where: { id: session.sub }, select: { id: true, email: true, createdAt: true, referredById: true, _count: { select: { checkoutOrders: true, distributionOrders: true } } } });
      if (!account) throw new Error("Account not found.");
      if (account.referredById) throw new Error("A referral is already attached to this account.");
      if (account._count.checkoutOrders || account._count.distributionOrders) throw new Error("Referral attribution is locked after your first order.");
      if (Date.now() - account.createdAt.getTime() > 24 * 60 * 60 * 1000) throw new Error("Referral codes can only be applied during new-account onboarding.");
      const attached = await registerReferralForNewUser(tx, { referredUserId: account.id, referredEmail: account.email, referralCode: body.referralCode });
      if (!attached) throw new Error("Enter a referral code.");
      await tx.auditLog.create({ data: { actorType: "user", actorId: account.id, actorRole: session.role, action: "REFERRAL_MANUALLY_APPLIED", entity: "referral", entityId: String(attached.id), metadata: { source: "onboarding" } } });
      return attached;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ applied: true, referralId: referral.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not apply referral code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
