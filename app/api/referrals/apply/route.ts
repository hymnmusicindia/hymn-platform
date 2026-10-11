import { z } from "zod";
import { referralOnboardingEligible } from "@/lib/referral-eligibility";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { registerReferralForNewUser } from "@/lib/referrals";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Log in before applying a referral code." }, { status: 401 });
  const limit = await consumeRateLimit({ scope: "referral.apply", identity: `${session.sub}:${requestIdentity(request)}`, limit: 10, windowSeconds: 300 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  try {
    const body = z.object({ referralCode: z.string().trim().min(2).max(64).regex(/^[a-zA-Z0-9]+$/) }).parse(await request.json());
    const referral = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.sub} FOR UPDATE`;
      const account = await tx.user.findUnique({ where: { id: session.sub }, select: { id: true, email: true, createdAt: true, referredById: true, _count: { select: { checkoutOrders: true, distributionOrders: true } }, subscription: { select: { _count: { select: { payments: true } } } } } });
      if (!account) throw new Error("Account not found.");
      if (!referralOnboardingEligible({ ...account, checkoutOrders: account._count.checkoutOrders, distributionOrders: account._count.distributionOrders, subscriptionPayments: account.subscription?._count.payments ?? 0 })) throw new Error("A referral can be applied once, within 24 hours of signup and before your first order or subscription payment.");
      const attached = await registerReferralForNewUser(tx, { referredUserId: account.id, referredEmail: account.email, referralCode: body.referralCode });
      if (!attached) throw new Error("Enter a referral code.");
      await tx.user.update({ where: { id: account.id }, data: { referralPromptCompletedAt: new Date() } });
      await tx.auditLog.create({ data: { actorType: "user", actorId: account.id, actorRole: session.role, action: "REFERRAL_MANUALLY_APPLIED", entity: "referral", entityId: String(attached.id), metadata: { source: "onboarding" } } });
      return attached;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ applied: true, referralId: referral.id });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError ? "Attribution is being updated. Please try again." : error instanceof z.ZodError ? "Enter a valid referral code." : error instanceof Error ? error.message : "Could not apply referral code.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
