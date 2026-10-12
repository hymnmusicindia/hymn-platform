import { getPublicAppUrl } from "@/lib/public-app-url";
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
  const origin = request.headers.get("origin");
  if (origin && ![new URL(request.url).origin, getPublicAppUrl(request.url)].includes(origin)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    // Repeated clicks should preserve the original choice timestamp.
    const updated = await prisma.user.updateMany({ where: { id: session.sub, referralPromptCompletedAt: null }, data: { referralPromptCompletedAt: new Date() } });
    if (!updated.count && !await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true } })) return NextResponse.json({ error: "Account not found. Please sign in again." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "We could not save your choice right now. Please try again." }, { status: 503 });
  }
}
