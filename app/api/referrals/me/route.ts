import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createUniqueReferralCode, REFERRED_USER_REWARD_INR, REFERRER_REWARD_INR } from "@/lib/referrals";
import { getPublicAppUrl } from "@/lib/public-app-url";

function maskEmail(value: string) {
  const [name, domain = ""] = value.split("@");
  return `${name.slice(0, 2)}${"*".repeat(Math.max(2, Math.min(6, name.length - 2)))}@${domain}`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const user = await prisma.$transaction(async tx => {
    const account = await tx.user.findUnique({ where: { id: session.sub }, select: { id: true, name: true, referralCode: true, referralCredits: true } });
    if (!account) return null;
    if (account.referralCode) return account;
    const referralCode = await createUniqueReferralCode(tx, account.name);
    return tx.user.update({ where: { id: account.id }, data: { referralCode }, select: { id: true, name: true, referralCode: true, referralCredits: true } });
  });
  if (!user?.referralCode) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const [activities, ledger] = await Promise.all([
    prisma.referral.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.creditLedgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 })
  ]);
  const rewarded = activities.filter(item => item.status === "REWARDED");
  const pending = activities.filter(item => ["ATTRIBUTED", "REGISTERED", "PENDING", "QUALIFIED"].includes(item.status));

  return NextResponse.json({ referral: {
    referralCode: user.referralCode,
    referralLink: `${getPublicAppUrl(request.url)}/join?ref=${encodeURIComponent(user.referralCode)}`,
    availableCredit: Number(user.referralCredits),
    referrerReward: REFERRER_REWARD_INR,
    referredReward: REFERRED_USER_REWARD_INR,
    totalReferrals: activities.length,
    successfulReferrals: rewarded.length,
    pendingReferrals: pending.length,
    totalCreditsEarned: rewarded.reduce((sum, item) => sum + item.earnings, 0),
    activities: activities.map(item => ({ id: item.id, person: maskEmail(item.signupEmail), status: item.status, earnings: item.earnings, createdAt: item.createdAt.toISOString(), rewardedAt: item.rewardedAt?.toISOString() ?? null })),
    creditHistory: ledger.map(item => ({ id: item.id, type: item.type, direction: item.direction, amount: Number(item.amount), description: item.description, createdAt: item.createdAt.toISOString() }))
  } });
}
