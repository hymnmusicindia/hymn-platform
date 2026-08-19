import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const result = await requireAdminPermission("users.read");
  if ("error" in result) return result.error;
  const users = await prisma.user.findMany({ where: { role: "PRODUCER" }, include: { producerProfile: true, beats: true, producerSales: true, payoutBalance: true }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ producers: users.map((user) => {
    const paidSales = user.producerSales.filter((sale) => sale.status === "paid");
    return { id: user.id, name: user.name, email: user.email, status: user.producerProfile?.status ?? "pending_setup", profile: user.producerProfile, totalBeats: user.beats.length, activeBeats: user.beats.filter((beat) => beat.enabled).length, totalSales: paidSales.length, grossRevenue: paidSales.reduce((sum, sale) => sum + Number(sale.grossAmount), 0), producerEarnings: paidSales.reduce((sum, sale) => sum + Number(sale.producerEarningAmount), 0), availableBalance: Number(user.payoutBalance?.availableBalance ?? 0), pendingPayout: Number(user.payoutBalance?.pendingBalance ?? 0), lastActivity: user.updatedAt.toISOString() };
  }) });
}
// vercel trigger 7
// vercel trigger 9
