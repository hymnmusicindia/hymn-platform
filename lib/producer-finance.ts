import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/db";
export { PRODUCER_COMMISSION_CONFIG } from "@/lib/finance-config";
import { PRODUCER_COMMISSION_CONFIG } from "@/lib/finance-config";

function currencyAmount(value: number) {
  return Math.round(value * 100) / 100;
}

export async function creditVerifiedBeatSale(input: {
  beatId: number;
  buyerUserId: number;
  orderId: number;
  paymentId: string;
  grossAmount: number;
  licenseType: string;
}) {
  const beat = await prisma.beat.findUnique({ where: { id: input.beatId }, select: { id: true, userId: true, title: true } });
  if (!beat) throw new Error(`Beat ${input.beatId} was not found.`);

  const grossAmount = currencyAmount(input.grossAmount);
  const hymnCommissionAmount = currencyAmount(grossAmount * PRODUCER_COMMISSION_CONFIG.hymnCommissionPercent / 100);
  const producerEarningAmount = currencyAmount(grossAmount - hymnCommissionAmount);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.beatSale.findUnique({
      where: { orderId_beatId_licenseType: { orderId: input.orderId, beatId: input.beatId, licenseType: input.licenseType } }
    });
    if (existing) return { sale: existing, credited: false };

    const latest = await tx.walletTransaction.findFirst({ where: { userId: beat.userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    const balanceAfter = new Prisma.Decimal(latest?.balanceAfter ?? 0).add(producerEarningAmount);
    const sale = await tx.beatSale.create({
      data: {
        beatId: beat.id,
        producerUserId: beat.userId,
        buyerUserId: input.buyerUserId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        grossAmount,
        netSaleAmount: grossAmount,
        hymnCommissionAmount,
        producerEarningAmount,
        producerRateApplied: PRODUCER_COMMISSION_CONFIG.producerSharePercent / 100,
        platformRateApplied: PRODUCER_COMMISSION_CONFIG.hymnCommissionPercent / 100,
        licenseType: input.licenseType,
        status: "paid"
      }
    });
    await tx.walletTransaction.create({
      data: {
        userId: beat.userId,
        type: "beat_sale_credit",
        amount: producerEarningAmount,
        referenceType: "beat_sale",
        referenceId: String(sale.id),
        idempotencyKey: `beat-sale:${sale.id}:producer-credit`,
        direction: "credit",
        balanceAfter,
        note: `${beat.title} sold. Gross Rs ${grossAmount}; HYMN 30% Rs ${hymnCommissionAmount}; producer 70% Rs ${producerEarningAmount}.`
      }
    });
    await tx.artistPayoutBalance.upsert({
      where: { userId: beat.userId },
      create: { userId: beat.userId, availableBalance: producerEarningAmount, lifetimeEarnings: producerEarningAmount },
      update: { availableBalance: { increment: producerEarningAmount }, lifetimeEarnings: { increment: producerEarningAmount } }
    });
    return { sale, credited: true };
  });

  if (result.credited) {
    await createNotification({
      userId: beat.userId,
      title: "Beat sold",
      body: `Your beat “${beat.title}” was purchased. Your 70% producer earning has been credited.`,
      type: "beat",
      href: "/producer/dashboard?module=sales",
      actionLabel: "View sale",
      eventKey: `beat-sale:${result.sale.id}:producer-credit`,
      metadata: { saleId: result.sale.id, beatId: beat.id, orderId: input.orderId, earningSource: "beat_sale" }
    }).catch((error) => console.error("Producer sale notification failed:", error));
  }

  return { ...result, grossAmount, hymnCommissionAmount, producerEarningAmount };
}

export async function getProducerFinanceSummary(userId: number) {
  const [profile, sales, ledger, payoutBalance, payouts] = await Promise.all([
    prisma.producerProfile.findUnique({ where: { userId } }),
    prisma.beatSale.findMany({ where: { producerUserId: userId }, include: { beat: { select: { title: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.walletTransaction.findMany({ where: { userId, referenceType: "beat_sale" }, orderBy: { createdAt: "desc" } }),
    prisma.artistPayoutBalance.findUnique({ where: { userId } }),
    prisma.payoutRequest.findMany({ where: { userId, sourceType: { in: ["producer_beat_sales", "mixed"] } }, orderBy: { requestedAt: "desc" } })
  ]);
  const paidSales = sales.filter((sale) => sale.status === "paid");
  return {
    profile,
    sales,
    ledger,
    payouts,
    totalSales: paidSales.length,
    grossRevenue: paidSales.reduce((sum, sale) => sum + Number(sale.grossAmount), 0),
    hymnCommission: paidSales.reduce((sum, sale) => sum + Number(sale.hymnCommissionAmount), 0),
    producerEarnings: paidSales.reduce((sum, sale) => sum + Number(sale.producerEarningAmount), 0),
    availableBalance: Number(payoutBalance?.availableBalance ?? 0),
    pendingPayout: Number(payoutBalance?.pendingBalance ?? 0),
    lifetimePaid: Number(payoutBalance?.lifetimePaid ?? 0)
  };
}
// vercel trigger 7
// vercel trigger 9

// vercel trigger 11
