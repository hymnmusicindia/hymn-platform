import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createUniqueReferralCode } from "@/lib/referrals";
import { referralPolicySnapshotSchema } from "@/lib/referral-reward-policy";
import { getPublicAppUrl } from "@/lib/public-app-url";

function maskEmail(value: string) {
  const [name, domain = ""] = value.split("@");
  return `${name.slice(0, 2)}${"*".repeat(Math.max(2, Math.min(6, name.length - 2)))}@${domain}`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const query = new URL(request.url).searchParams;
  const cursor = (name: string) => { const raw = query.get(name); return raw && /^[1-9][0-9]{0,9}$/.test(raw) ? Number(raw) : undefined; };
  const activityCursor = cursor("activityCursor"); const creditCursor = cursor("creditCursor");
  const user = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.sub} FOR UPDATE`;
    const account = await tx.user.findUnique({ where: { id: session.sub }, select: { id: true, name: true, referralCode: true, referralCredits: true } });
    if (!account) return null;
    if (account.referralCode) return account;
    const referralCode = await createUniqueReferralCode(tx, account.name);
    return tx.user.update({ where: { id: account.id }, data: { referralCode }, select: { id: true, name: true, referralCode: true, referralCredits: true } });
  });
  if (!user?.referralCode) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const [activities, ledger, policy, counts, totals, visits] = await Promise.all([
    prisma.referral.findMany({ where: { userId: user.id, ...(activityCursor ? { id: { lt: activityCursor } } : {}) }, orderBy: { id: "desc" }, take: 26 }),
    prisma.creditLedgerEntry.findMany({ where: { userId: user.id, ...(creditCursor ? { id: { lt: creditCursor } } : {}) }, orderBy: { id: "desc" }, take: 26 }),
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
    coolingDays: policy.coolingDays,
    eligiblePlans: ["Half-yearly", "Yearly", "Yearly Plus"],
    totalReferrals: counts.reduce((sum, item) => sum + item._count, 0),
    successfulReferrals: counts.find(item => item.status === "REWARDED")?._count || 0,
    pendingReferrals: counts.filter(item => ["ATTRIBUTED", "REGISTERED", "PENDING", "QUALIFIED"].includes(item.status)).reduce((sum, item) => sum + item._count, 0),
    totalCreditsEarned: totals._sum.earnings || 0,
    visits,
    activities: activities.slice(0,25).map(item => {
      const snapshot = referralPolicySnapshotSchema.safeParse(item.rewardPolicy);
      const eligibleAt = item.qualifiedAt && snapshot.success ? new Date(item.qualifiedAt.getTime() + snapshot.data.coolingDays * 86400000).toISOString() : null;
      return { id: item.id, person: maskEmail(item.signupEmail), status: item.status, earnings: item.earnings, expectedReward: snapshot.success ? snapshot.data.amount : 5, riskStatus: item.riskStatus, eligibleAt, createdAt: item.createdAt.toISOString(), rewardedAt: item.rewardedAt?.toISOString() ?? null };
    }),
    nextActivityCursor: activities.length > 25 ? activities[24].id : null,
    nextCreditCursor: ledger.length > 25 ? ledger[24].id : null,
    creditHistory: ledger.slice(0,25).map(item => ({ id: item.id, type: item.type, direction: item.direction, amount: Number(item.amount), description: item.description, createdAt: item.createdAt.toISOString() }))
  } }, { headers: { "Cache-Control": "private, no-store" } });
}
