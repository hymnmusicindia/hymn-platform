import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { referralOnboardingEligible } from "@/lib/referral-eligibility";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { referredById: true, referralPromptCompletedAt: true, createdAt: true, _count: { select: { checkoutOrders: true, distributionOrders: true } }, subscription: { select: { _count: { select: { payments: true } } } } } });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const newAccount = referralOnboardingEligible({ ...user, checkoutOrders: user._count.checkoutOrders, distributionOrders: user._count.distributionOrders, subscriptionPayments: user.subscription?._count.payments ?? 0 });
  const policy = await prisma.growthRewardPolicy.findUniqueOrThrow({ where: { id: 1 } });
  return NextResponse.json({ showPrompt: newAccount && !user.referredById && !user.referralPromptCompletedAt, referrerReward: policy.artistCredit, referredReward: 0 });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await prisma.user.update({ where: { id: session.sub }, data: { referralPromptCompletedAt: new Date() } });
  return NextResponse.json({ success: true });
}
