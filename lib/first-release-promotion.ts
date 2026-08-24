import { Prisma, ReleaseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const FIRST_RELEASE_PROMOTION_CODE = "FIRST_RELEASE_FREE";
export const FIRST_RELEASE_BASE_DISCOUNT = 99;
const RESERVATION_TTL_MS = 30 * 60 * 1000;

export type CampaignAttribution = Partial<Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term", string>>;

const submittedReleaseWhere = (userId: number): Prisma.ReleaseWhereInput => ({
  OR: [{ userId }, { ownerUserId: userId }],
  status: { notIn: [ReleaseStatus.DRAFT, ReleaseStatus.AWAITING_PAYMENT] }
});

async function promotion() {
  return prisma.promotion.findFirst({
    where: {
      code: FIRST_RELEASE_PROMOTION_CODE,
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }]
    }
  });
}

export async function getFirstReleaseEligibility(userId: number) {
  const offer = await promotion();
  if (!offer) return { eligible: false as const, reason: "promotion_inactive" as const };
  const submittedReleaseCount = await prisma.release.count({ where: submittedReleaseWhere(userId) });
  if (submittedReleaseCount > 0) return { eligible: false as const, reason: "release_already_submitted" as const };
  const redemption = await prisma.promotionRedemption.findUnique({ where: { promotionId_userId: { promotionId: offer.id, userId } } });
  if (!redemption) return { eligible: true as const, reason: "available" as const, promotionId: offer.id };
  if (redemption.status === "RESERVED" && redemption.updatedAt.getTime() < Date.now() - RESERVATION_TTL_MS) {
    return { eligible: true as const, reason: "stale_reservation" as const, promotionId: offer.id };
  }
  return { eligible: false as const, reason: redemption.status === "REDEEMED" ? "already_redeemed" as const : "reserved" as const, redemption };
}

export function calculateFirstReleasePrice(input: { plan: string; releaseType: string; trackCount: number; normalAmount: number }) {
  if (input.plan !== "one_time" || input.releaseType !== "single" || input.trackCount !== 1) throw new Error("The first-release offer applies only to one new Single release.");
  const discountAmount = Math.min(FIRST_RELEASE_BASE_DISCOUNT, input.normalAmount);
  return { originalAmount: input.normalAmount, discountAmount, finalAmount: Math.max(0, input.normalAmount - discountAmount) };
}

export async function reserveFirstRelease(input: { userId: number; originalAmount: number; discountAmount: number; finalAmount: number; attribution?: CampaignAttribution }) {
  return prisma.$transaction(async (tx) => {
    const offer = await tx.promotion.findUnique({ where: { code: FIRST_RELEASE_PROMOTION_CODE } });
    const now = new Date();
    if (!offer || !offer.active || (offer.startsAt && offer.startsAt > now) || (offer.endsAt && offer.endsAt <= now)) throw new Error("The first-release offer is not available.");
    const submittedReleaseCount = await tx.release.count({ where: submittedReleaseWhere(input.userId) });
    if (submittedReleaseCount > 0) throw new Error("The free first-release offer has already been used on this account.");
    await tx.promotionRedemption.deleteMany({ where: { promotionId: offer.id, userId: input.userId, status: "RESERVED", updatedAt: { lt: new Date(Date.now() - RESERVATION_TTL_MS) } } });
    if (offer.maxRedemptions != null) {
      const used = await tx.promotionRedemption.count({ where: { promotionId: offer.id, status: "REDEEMED" } });
      if (used >= offer.maxRedemptions) throw new Error("The first-release offer has ended.");
    }
    try {
      return await tx.promotionRedemption.create({ data: { promotionId: offer.id, userId: input.userId, originalAmount: input.originalAmount, discountAmount: input.discountAmount, finalAmount: input.finalAmount, campaignSource: input.attribution as Prisma.InputJsonValue | undefined } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("You have already used or reserved your first-release offer.");
      throw error;
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function redeemFirstRelease(redemptionId: number, releaseId: number) {
  const result = await prisma.promotionRedemption.updateMany({ where: { id: redemptionId, status: "RESERVED", releaseId: null }, data: { status: "REDEEMED", releaseId, redeemedAt: new Date() } });
  if (result.count !== 1) throw new Error("The first-release offer could not be redeemed.");
}

export async function releaseFirstReleaseReservation(redemptionId: number) {
  await prisma.promotionRedemption.deleteMany({ where: { id: redemptionId, status: "RESERVED", releaseId: null } });
}

export async function trackFirstReleaseEvent(input: { event: string; userId?: number; anonymousId?: string; attribution?: CampaignAttribution; metadata?: Record<string, unknown> }) {
  await prisma.acquisitionEvent.create({ data: { funnel: "first_release_free", event: input.event, userId: input.userId, anonymousId: input.anonymousId, attribution: input.attribution as Prisma.InputJsonValue | undefined, metadata: input.metadata as Prisma.InputJsonValue | undefined } });
}
