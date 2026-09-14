import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createUniqueReferralCode } from "@/lib/referrals";
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

  const [activities, ledger, policy, counts, totals, visits] = await Promise.all([
    prisma.referral.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.creditLedgerEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.growthRewardPolicy.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.referral.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    prisma.referral.aggregate({ where: { userId: user.id, status: "REWARDED" }, _sum: { earnings: true } }),
    prisma.referralVisit.count({ where: { referrerId: user.id } })
  ]);

  return NextResponse.json({ referral: {
    referralCode: user.referralCode,
    referralLink: `${getPublicAppUrl(request.url)}/join?ref=${encodeURIComponent(user.referralCode)}`,
    availableCredit: Number(user.referralCredits),
    referrerReward: policy.artistCredit,
    referredReward: 0,
    totalReferrals: counts.reduce((sum, item) => sum + item._count, 0),
    successfulReferrals: counts.find(item => item.status === "REWARDED")?._count || 0,
    pendingReferrals: counts.filter(item => ["ATTRIBUTED", "REGISTERED", "PENDING", "QUALIFIED"].includes(item.status)).reduce((sum, item) => sum + item._count, 0),
    totalCreditsEarned: totals._sum.earnings || 0,
    visits,
    activities: activities.map(item => ({ id: item.id, person: maskEmail(item.signupEmail), status: item.status, earnings: item.earnings, createdAt: item.createdAt.toISOString(), rewardedAt: item.rewardedAt?.toISOString() ?? null })),
    creditHistory: ledger.map(item => ({ id: item.id, type: item.type, direction: item.direction, amount: Number(item.amount), description: item.description, createdAt: item.createdAt.toISOString() }))
  } });
}
