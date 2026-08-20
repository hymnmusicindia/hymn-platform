import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const admin = await requireAdminPermission("fraud.read");
  if ("error" in admin) return admin.error;
  const url = new URL(request.url); const status = url.searchParams.get("status"); const risk = url.searchParams.get("risk"); const search = url.searchParams.get("q")?.trim();
  const where = { ...(status ? { status } : {}), ...(risk ? { riskStatus: risk } : {}), ...(search ? { OR: [
    { referralCode: { contains: search, mode: "insensitive" as const } }, { signupEmail: { contains: search, mode: "insensitive" as const } },
    { qualifyingPaymentId: { contains: search, mode: "insensitive" as const } }, { owner: { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } },
    { referredUser: { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } }
  ] } : {}) };
  const [rows, grouped, flagged, visits] = await Promise.all([
    prisma.referral.findMany({ where, include: { owner: { select: { id: true, name: true, email: true } }, referredUser: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 250 }),
    prisma.referral.groupBy({ by: ["status"], _count: true }),
    prisma.referral.count({ where: { riskStatus: { not: "clear" } } }),
    prisma.referralVisit.count()
  ]);
  const counts = Object.fromEntries(grouped.map(item => [item.status, item._count])); const rewarded = counts.REWARDED || 0;
  return NextResponse.json({ summary: { visits, total: await prisma.referral.count(), pending: (counts.PENDING || 0) + (counts.REGISTERED || 0), qualified: counts.QUALIFIED || 0, rewarded, reversed: counts.REVERSED || 0, creditsIssued: rewarded * 8, signupConversion: visits ? Math.round((await prisma.referral.count()) / visits * 1000) / 10 : 0, qualificationConversion: rows.length ? Math.round(rewarded / rows.length * 1000) / 10 : 0, revenueGenerated: rows.reduce((sum, row) => sum + row.purchaseAmount, 0), flagged }, referrals: rows });
}
