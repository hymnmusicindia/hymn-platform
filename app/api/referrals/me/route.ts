import { clearedReferralMinor } from "@/lib/referral-commissions";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createUniqueReferralCode } from "@/lib/referrals";
import { referralPolicySnapshotSchema } from "@/lib/referral-reward-policy";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { REFERRAL_COMMISSION_RATES, REFERRAL_HOLD_DAYS, REFERRAL_MINIMUM_PAYOUT_MINOR } from "@/lib/referral-commission-policy";

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
  const commissionCursor = cursor("commissionCursor");
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
    prisma.growthRewardPolicy.findUnique({ where: { id: 1 } }),
    prisma.referral.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    prisma.referral.aggregate({ where: { userId: user.id, status: "REWARDED" }, _sum: { earnings: true } }),
    prisma.referralVisit.count({ where: { referrerId: user.id } })
  ]);

  const [commissionGroups, commissionHistory, cashPayouts, payoutGroups, perReferral, clearedMinor] = await Promise.all([
    prisma.referralCommission.groupBy({ by: ["status"], where: { referral: { userId: user.id } }, _sum: { netMinor: true } }),
    prisma.referralCommission.findMany({ where: { referral: { userId: user.id }, status: { not: "EXCLUDED" }, ...(commissionCursor ? { id: { lt: commissionCursor } } : {}) }, orderBy: { id: "desc" }, take: 26, include: { adjustments: { orderBy: { id: "asc" } } } }),
    prisma.referralCommissionPayout.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 25, select: { id: true, amountMinor: true, status: true, paymentReference: true, createdAt: true } }),
    prisma.referralCommissionPayout.groupBy({ by: ["status"], where: { userId: user.id }, _sum: { amountMinor: true } }),
    prisma.referralCommission.groupBy({ by: ["referralId"], where: { referral: { userId: user.id } }, _sum: { netMinor: true } }),
    prisma.$transaction(tx => clearedReferralMinor(tx, user.id)),
  ]);
  const netPolicy = await prisma.referralProgram.findUnique({ where: { id: 1 }, select: { netRevenueEffectiveAt: true } });
  const earned = (status: string) => (commissionGroups.find(row => row.status === status)?._sum.netMinor || 0) / 100;
  const paid = (payoutGroups.find(row => row.status === "PAID")?._sum.amountMinor || 0) / 100;
  const requested = (payoutGroups.find(row => row.status === "REQUESTED")?._sum.amountMinor || 0) / 100;
  const balance = clearedMinor / 100 - paid - requested;
  return NextResponse.json({ referral: {
    commission: {
      pending: earned("PENDING"), held: earned("HELD") + Math.max(0, earned("AVAILABLE") - clearedMinor / 100), available: Math.max(0, balance), recovery: Math.max(0, -balance), paid, requested,
      total: commissionGroups.reduce((sum, row) => sum + (row._sum.netMinor || 0), 0) / 100,
      minimumPayout: REFERRAL_MINIMUM_PAYOUT_MINOR / 100, holdDays: REFERRAL_HOLD_DAYS,
      rates: Object.entries(REFERRAL_COMMISSION_RATES).map(([category, rate]) => ({ category, percent: netPolicy?.netRevenueEffectiveAt ? 2 : rate / 100, basis: netPolicy?.netRevenueEffectiveAt ? "verified eligible net revenue; configured rate frozen per purchase" : ["beats", "studio"].includes(category) ? "HYMN share" : "payment collected" })),
      history: commissionHistory.slice(0,25).map(row => ({ id: row.id, level: row.level, category: row.category, paid: row.paidMinor / 100, base: row.baseMinor / 100, rate: row.rateBps / 100, amount: row.netMinor / 100, originalAmount: row.originalMinor / 100, policyVersion: row.policyVersion, adjustments: row.adjustments.map(entry => ({ id: entry.id, amount: entry.amountMinor / 100, reason: entry.reason, createdAt: entry.createdAt.toISOString() })), status: row.status, eligibleAt: row.eligibleAt.toISOString(), createdAt: row.createdAt.toISOString() })),
      nextCursor: commissionHistory.length > 25 ? commissionHistory[24].id : null,
      payouts: cashPayouts.map(row => ({ id: row.id, amount: row.amountMinor / 100, status: row.status, reference: row.paymentReference, createdAt: row.createdAt.toISOString() })),
    },
    referralCode: user.referralCode,
    referralLink: `${getPublicAppUrl(request.url)}/join?ref=${encodeURIComponent(user.referralCode)}`,
    availableCredit: Number(user.referralCredits),
    referrerReward: policy?.artistCredit || 0,
    referredReward: 0,
    coolingDays: policy?.coolingDays || REFERRAL_HOLD_DAYS,
    eligiblePlans: ["Half-yearly", "Yearly", "Yearly Plus"],
    totalReferrals: counts.reduce((sum, item) => sum + item._count, 0),
    successfulReferrals: counts.find(item => item.status === "REWARDED")?._count || 0,
    pendingReferrals: counts.filter(item => ["ATTRIBUTED", "REGISTERED", "PENDING", "QUALIFIED"].includes(item.status)).reduce((sum, item) => sum + item._count, 0),
    totalCreditsEarned: totals._sum.earnings || 0,
    visits,
    activities: activities.slice(0,25).map(item => {
      const snapshot = referralPolicySnapshotSchema.safeParse(item.rewardPolicy);
      const eligibleAt = item.qualifiedAt && snapshot.success ? new Date(item.qualifiedAt.getTime() + snapshot.data.coolingDays * 86400000).toISOString() : null;
      const lifetime = (item.rewardPolicy as { version?: number } | null)?.version === 3;
      const commissionEarned = (perReferral.find(row => row.referralId === item.id)?._sum.netMinor || 0) / 100;
      return { id: item.id, lifetime, commissionEarned, person: maskEmail(item.signupEmail), status: item.status, earnings: item.earnings, expectedReward: lifetime ? 0 : snapshot.success ? snapshot.data.amount : 5, riskStatus: item.riskStatus, eligibleAt, createdAt: item.createdAt.toISOString(), rewardedAt: item.rewardedAt?.toISOString() ?? null };
    }),
    nextActivityCursor: activities.length > 25 ? activities[24].id : null,
    nextCreditCursor: ledger.length > 25 ? ledger[24].id : null,
    creditHistory: ledger.slice(0,25).map(item => ({ id: item.id, type: item.type, direction: item.direction, amount: Number(item.amount), description: item.description, createdAt: item.createdAt.toISOString() }))
  } }, { headers: { "Cache-Control": "private, no-store" } });
}
